import { Notice, TFile, type CachedMetadata, type Plugin, type TAbstractFile } from "obsidian";
import { claimChanged, parseClaim } from "../core/claims.ts";
import { textLinksToPdf } from "../core/links.ts";
import { isNote, isPdf } from "../core/paths.ts";
import { react } from "../core/react.ts";
import type { PdfWrapperSettings } from "../core/settings-data.ts";
import { PendingCreates, type OwnChanges } from "../core/marks.ts";
import { withoutPath } from "../core/snapshot.ts";
import { waitAtMost, type CappedWait } from "../core/wait.ts";
import type { NoteClaim, VaultEvent } from "../core/types.ts";
import type { Executor } from "./execute.ts";
import type { LocalIntent } from "./local-intent.ts";
import { gatherSnapshot, readClaim } from "./snapshot.ts";

/** How long after the last change that needs it the pairs are re-examined. Provisional: not tuned against real sync behaviour. */
export const SETTLE_MS = 2000;

/**
 * The longest the Watcher waits for the user's own operation to finish before reacting anyway. A wrapped call
 * may never settle (for example a rename waiting on Obsidian's "Update links?" dialog); without a cap every
 * later event would queue behind it. The Executor's execution-time checks remain the safety net.
 */
export const IDLE_WAIT_MS = 10000;

/**
 * Before a PDF is deleted with its note, notes modified this recently are also read for a link to it, in case the
 * metadata cache has not indexed that link yet. At most RECENT_NOTES_READ of them, the most recently modified first.
 */
const RECENT_EDIT_MS = 10000;
const RECENT_NOTES_READ = 20;

export interface WatcherDeps {
	localIntent: LocalIntent;
	own: OwnChanges;
	executor: Executor;
	getSettings: () => PdfWrapperSettings;
	/**
	 * Called once per settle window, with every PDF kept in it after its note was deleted (outside Obsidian, with
	 * following deletes off, or while other notes link to the PDF); often none.
	 */
	onRecheck: (pendingRemoved: string[]) => void;
	/**
	 * Called for every PDF that appears and is not the plugin's own change; the receiver decides whether to act.
	 * `local` is true when the plugin positively identified it as made by an action inside Obsidian on this device.
	 */
	onPdfCreated: (path: string, local: boolean) => void;
	/** False until the Needs attention list has been built once; until then a property change needs no refresh. */
	isListReady: () => boolean;
	/** The note's claim as the list last saw it, or null when it had none. */
	listedClaim: (notePath: string) => NoteClaim | null;
	/** Asks for a coalesced refresh of the list and the explorer rules. Only reads the vault. */
	refreshSoon: () => void;
}

const reason = (error: unknown): string => (error instanceof Error ? error.message : String(error));

/**
 * Follows renames, moves, deletes and copies made inside Obsidian across a pair, by passing each vault event to
 * `react` and running exactly the actions it returns. Events are handled one at a time, in arrival order.
 */
export class Watcher {
	private queue: Promise<void> = Promise.resolve();
	private recheckTimer: number | null = null;
	private readonly pendingRemoved = new Set<string>();
	/** Notes created inside Obsidian whose claim may not be indexed yet (see `onMetadataChanged`). */
	private readonly pendingCreates = new PendingCreates();
	/**
	 * Set when the plugin unloads: no new event is handled and no recheck is scheduled after that. An Executor run
	 * already in progress finishes its remaining actions, because finishing a half-done pair move (partner renamed,
	 * claim not yet updated) is safer than stopping midway.
	 */
	private unloaded = false;
	private idleWait: CappedWait | null = null;

	constructor(private readonly plugin: Plugin, private readonly deps: WatcherDeps) {
		plugin.register(() => {
			this.unloaded = true;
			this.pendingCreates.clear();
			this.idleWait?.cancel();
			this.cancelRecheck();
		});
	}

	/** Registers the handlers once the layout is ready, so the `create` fired for every file on load is not seen. */
	start(): void {
		const { workspace, vault, metadataCache } = this.plugin.app;
		workspace.onLayoutReady(() => {
			// Disabled before the layout was ready: register nothing.
			if (this.unloaded) return;
			this.plugin.registerEvent(vault.on("rename", (file, oldPath) => this.onRename(file, oldPath)));
			this.plugin.registerEvent(vault.on("create", (file) => this.onCreate(file)));
			this.plugin.registerEvent(vault.on("delete", (file) => this.onPdfDelete(file)));
			this.plugin.registerEvent(metadataCache.on("deleted", (file, prevCache) => this.onNoteDeleted(file, prevCache)));
			this.plugin.registerEvent(metadataCache.on("changed", (file) => this.onMetadataChanged(file)));
		});
	}

	/**
	 * A note's frontmatter changed without a rename, create or delete: for example its marker property was deleted in
	 * the properties panel, or sync delivered a changed claim. Read-only: when the claim differs from the listed one it
	 * only asks for a refresh, so ordinary typing in a note costs one cache lookup.
	 *
	 * The one exception: a note created inside Obsidian moments ago (in `pendingCreates`) is passed to `react` again
	 * as that `create`, because its claim was usually not indexed yet when the `create` event was handled. This is
	 * allowed because it continues a local in-app create (an in-app copy of a wrapped note copies its PDF); it is
	 * never triggered by an edit, sync or any other change.
	 */
	private onMetadataChanged(file: TFile): void {
		if (this.unloaded) return;
		if (this.pendingCreates.has(file.path)) this.continueLocalCreate(file.path);
		if (!isNote(file.path) || !this.deps.isListReady()) return;
		try {
			const current = readClaim(this.plugin.app, file, this.deps.getSettings().markerProperty);
			if (claimChanged(this.deps.listedClaim(file.path), current)) this.deps.refreshSoon();
		} catch (error) {
			console.error("PDF Wrapper: could not check a changed note", file.path, error);
		}
	}

	// The handlers below decide everything that depends on the moment of the event (own change,
	// local intent, the deleted note's claim) at once, and queue the rest.

	private onRename(file: TAbstractFile, oldPath: string): void {
		// A folder's children fire their own renames.
		if (!(file instanceof TFile) || this.isOwn(oldPath)) return;
		// A PDF that reaches its final name from a non-PDF one (a download's temporary name) is an arrival from outside.
		if (isPdf(file.path) && !isPdf(oldPath)) this.deps.onPdfCreated(file.path, false);
		const local = this.deps.localIntent.consume(oldPath) && this.deps.getSettings().followRenames;
		this.enqueue({ kind: "rename", path: file.path, oldPath, local });
	}

	private onCreate(file: TAbstractFile): void {
		if (!(file instanceof TFile) || this.isOwn(file.path)) return;
		const local = this.deps.localIntent.consume(file.path);
		if (isPdf(file.path)) this.deps.onPdfCreated(file.path, local);
		if (local && isNote(file.path)) this.pendingCreates.add(file.path);
		this.enqueue({ kind: "create", path: file.path, local });
	}

	/**
	 * Reacts once more to a note created inside Obsidian, now that the metadata cache has indexed it. The entry is
	 * used up when this runs, not when it is queued: if the first pass already acted (its claim was readable then),
	 * it dropped the entry, and this pass is skipped, so a taken PDF name gives one notice, not two.
	 */
	private continueLocalCreate(path: string): void {
		this.enqueue({ kind: "create", path, local: true }, () => this.pendingCreates.consume(path));
	}

	/** Deleted notes are handled by `onNoteDeleted`, which also gets the note's previous claim. */
	private onPdfDelete(file: TAbstractFile): void {
		if (!(file instanceof TFile) || !isPdf(file.path) || this.isOwn(file.path)) return;
		const local = this.deps.localIntent.consume(file.path) && this.deps.getSettings().followDeletes;
		this.enqueue({ kind: "delete", path: file.path, local, claimedPdf: null });
	}

	private onNoteDeleted(file: TFile, prevCache: CachedMetadata | null): void {
		if (!isNote(file.path) || this.isOwn(file.path)) return;
		const local = this.deps.localIntent.consume(file.path) && this.deps.getSettings().followDeletes;
		this.enqueue({ kind: "delete", path: file.path, local, claimedPdf: this.previousClaim(file.path, prevCache) });
	}

	/** The vault path of the PDF the deleted note claimed, resolved from its previous cache, or null. */
	private previousClaim(notePath: string, prevCache: CachedMetadata | null): string | null {
		const frontmatter = prevCache?.frontmatter;
		const marker = this.deps.getSettings().markerProperty;
		if (!frontmatter || !Object.prototype.hasOwnProperty.call(frontmatter, marker)) return null;
		const rawTarget = parseClaim(frontmatter[marker]);
		if (rawTarget === null) return null;
		return this.plugin.app.metadataCache.getFirstLinkpathDest(rawTarget, notePath)?.path ?? null;
	}

	/** True for the plugin's own change. Also uses up the local-intent mark the same change left. */
	private isOwn(path: string): boolean {
		if (!this.deps.own.consume(path)) return false;
		this.deps.localIntent.consume(path);
		return true;
	}

	/** Queues `event`; when its turn comes it is handled only if `shouldHandle` (asked then) agrees. */
	private enqueue(event: VaultEvent, shouldHandle: () => boolean = () => true): void {
		this.queue = this.queue
			.then(() => (shouldHandle() ? this.handle(event) : undefined))
			.catch((error: unknown) => console.error("PDF Wrapper: event handling failed", event, error));
	}

	/** A failure is explained to the user and leads to a recheck. */
	private async handle(event: VaultEvent): Promise<void> {
		if (this.unloaded) return;
		try {
			// Let the user's own operation finish first (Obsidian rewrites links after Vault.rename returns).
			// Not an operation of this queue (events run one at a time), but automatic wrapping's Executor runs are not
			// in this queue and can overlap with it; the wait is capped at IDLE_WAIT_MS so nothing can stall it for long.
			await this.waitForIdle();
			if (this.unloaded) return;
			// Checked as late as possible, so a note that has just gained an embed of the PDF (a merge) is seen. Before
			// the snapshot, because it reads files and so may wait.
			if (event.kind === "delete" && event.local && event.claimedPdf !== null) {
				event = { ...event, linkedElsewhere: await this.isLinkedElsewhere(event.claimedPdf, event.path) };
				if (this.unloaded) return;
			}
			let snapshot = gatherSnapshot(this.plugin.app, this.deps.getSettings().markerProperty);
			if (event.kind === "delete") snapshot = withoutPath(snapshot, event.path);
			const reaction = react(event, snapshot);
			// The create has been acted on (copied or explained): no second pass when the cache reports the note changed.
			if (event.kind === "create" && reaction.actions.length > 0) this.pendingCreates.consume(event.path);
			let recheck = reaction.recheck;
			if (reaction.actions.length > 0) {
				try {
					// False: the vault changed under us and the remaining actions were skipped.
					if (!(await this.deps.executor.run(reaction.actions))) recheck = true;
				} catch (error) {
					// The Executor has already shown a notice naming the file and the reason.
					console.error("PDF Wrapper: could not follow", event, error);
					recheck = true;
				}
			}
			if (recheck) this.requestRecheck(reaction.pendingRemoved);
		} catch (error) {
			console.error("PDF Wrapper: could not react to", event, error);
			new Notice(`PDF Wrapper could not react to the change of ${event.path}: ${reason(error)}`);
			this.requestRecheck(null);
		}
	}

	/**
	 * True when a note other than `deletedNote` links to or embeds `pdfPath`, as far as the plugin can tell now. First
	 * the metadata cache's resolved links; when they show nothing, the text of the notes modified in the last
	 * RECENT_EDIT_MS, because the cache may not have indexed a link added moments ago (Note composer's merge writes the
	 * target note, then deletes the source). Read-only. On any error, or when the plugin unloads meanwhile, answers
	 * true, so the PDF is kept.
	 */
	private async isLinkedElsewhere(pdfPath: string, deletedNote: string): Promise<boolean> {
		try {
			const { metadataCache, vault } = this.plugin.app;
			for (const [source, targets] of Object.entries(metadataCache.resolvedLinks)) {
				if (source === deletedNote || !Object.prototype.hasOwnProperty.call(targets, pdfPath)) continue;
				// A note the cache still remembers but that is gone (deleted with the same folder) does not count.
				if (vault.getFileByPath(source) !== null) return true;
			}
			const now = Date.now();
			const recent = vault.getMarkdownFiles()
				.filter((file) => file.path !== deletedNote && now - file.stat.mtime <= RECENT_EDIT_MS)
				.sort((a, b) => b.stat.mtime - a.stat.mtime)
				.slice(0, RECENT_NOTES_READ);
			for (const file of recent) {
				const text = await vault.cachedRead(file);
				if (this.unloaded || textLinksToPdf(text, pdfPath)) return true;
			}
			return false;
		} catch (error) {
			console.warn("PDF Wrapper: could not read the links to", pdfPath, error);
			return true;
		}
	}

	/** Waits for `localIntent.whenIdle()`, at most IDLE_WAIT_MS. */
	private async waitForIdle(): Promise<void> {
		const wait = waitAtMost(this.deps.localIntent.whenIdle(), IDLE_WAIT_MS);
		this.idleWait = wait;
		const settled = await wait.done;
		this.idleWait = null;
		if (!settled && !this.unloaded) {
			console.warn(`PDF Wrapper: an Obsidian file operation was still running after ${IDLE_WAIT_MS} ms; reacting anyway.`);
		}
	}

	/** Debounced: the recheck runs SETTLE_MS after the last request, once for the whole burst. */
	private requestRecheck(pendingRemoved: string | null): void {
		if (this.unloaded) return;
		if (pendingRemoved !== null) this.pendingRemoved.add(pendingRemoved);
		this.cancelRecheck();
		this.recheckTimer = window.setTimeout(() => this.fireRecheck(), SETTLE_MS);
	}

	private fireRecheck(): void {
		this.recheckTimer = null;
		const pending = [...this.pendingRemoved];
		this.pendingRemoved.clear();
		try {
			this.deps.onRecheck(pending);
		} catch (error) {
			console.error("PDF Wrapper: recheck failed", error);
		}
	}

	private cancelRecheck(): void {
		if (this.recheckTimer === null) return;
		window.clearTimeout(this.recheckTimer);
		this.recheckTimer = null;
	}
}
