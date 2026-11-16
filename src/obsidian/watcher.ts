import { Notice, TFile, type CachedMetadata, type Plugin, type TAbstractFile } from "obsidian";
import { claimChanged } from "../core/claims.ts";
import { copySourceByText, follow } from "../core/follow.ts";
import { textLinksToPdf } from "../core/links.ts";
import { isMarked, isTemplatePath } from "../core/marker.ts";
import type { FollowEvent, VaultSnapshot } from "../core/model.ts";
import { findPdfBeside, healthyPairs, pairUp } from "../core/pairing.ts";
import { dirname, isNote, isPdf } from "../core/paths.ts";
import type { PdfWrapperSettings } from "../core/settings-data.ts";
import { PendingCreates, type OwnChanges } from "../core/marks.ts";
import { waitAtMost, type CappedWait } from "../core/wait.ts";
import type { NoteClaim } from "../core/types.ts";
import type { Executor } from "./execute.ts";
import type { LocalIntent } from "./local-intent.ts";
import { readClaim } from "./snapshot.ts";
import { gatherVault, templateLocations } from "./vault-snapshot.ts";

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

/** The snapshot with every trace of a deleted file removed, in case the vault or the cache still remembers it. */
function withoutFile(snapshot: VaultSnapshot, path: string): VaultSnapshot {
	return {
		notePaths: snapshot.notePaths.filter((p) => p !== path),
		pdfPaths: snapshot.pdfPaths.filter((p) => p !== path),
		marked: snapshot.marked.filter((note) => note.notePath !== path),
	};
}

/**
 * Follows renames, moves, deletes and copies made inside Obsidian across a pair, by passing each vault event to
 * `follow` and running the actions it returns: a rename, copy or delete of the partner file, or a notice. No note's
 * contents are ever edited here. Events are handled one at a time, in arrival order.
 *
 * `follow` knows nothing about the settings, so the Watcher applies them: an event counts as local only when it was
 * made inside Obsidian AND its setting is on ("Rename and move the PDF with its note" for renames and copies,
 * "Delete the PDF when its note is deleted in Obsidian" for deletes). Otherwise it is handled as a change from
 * outside: nothing is renamed, copied or deleted, and the result is listed.
 */
export class Watcher {
	private queue: Promise<void> = Promise.resolve();
	private recheckTimer: number | null = null;
	private readonly pendingRemoved = new Set<string>();
	/** Notes created inside Obsidian whose marker may not be indexed yet (see `onMetadataChanged`). */
	private readonly pendingCreates = new PendingCreates();
	/** For the notes in `pendingCreates` made by a `Vault.copy` of one file: the file each was copied from. */
	private readonly createdFrom = new Map<string, string>();
	/**
	 * Set when the plugin unloads: no new event is handled and no recheck is scheduled after that. An Executor run
	 * already in progress finishes.
	 */
	private unloaded = false;
	private idleWait: CappedWait | null = null;

	constructor(private readonly plugin: Plugin, private readonly deps: WatcherDeps) {
		plugin.register(() => {
			this.unloaded = true;
			this.pendingCreates.clear();
			this.createdFrom.clear();
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
	 * The one exception: a note created inside Obsidian moments ago (in `pendingCreates`) is passed to `follow` again
	 * as that `create`, because its marker was usually not indexed yet when the `create` event was handled. This is
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

	// The handlers below decide everything that depends on the moment of the event (own change, local intent,
	// the copy's source, whether the deleted note was marked) at once, and queue the rest.

	private onRename(file: TAbstractFile, oldPath: string): void {
		// A folder's children fire their own renames.
		if (!(file instanceof TFile)) return;
		// A note created moments ago has left that path: a note sync puts there later is not that create.
		this.forgetCreate(oldPath);
		if (this.isOwn(oldPath)) return;
		// A PDF that reaches its final name from a non-PDF one (a download's temporary name) is an arrival from outside.
		if (isPdf(file.path) && !isPdf(oldPath)) this.deps.onPdfCreated(file.path, false);
		const local = this.deps.localIntent.consume(oldPath) && this.deps.getSettings().followRenames;
		this.enqueue({ kind: "rename", path: file.path, oldPath, local });
	}

	private onCreate(file: TAbstractFile): void {
		if (!(file instanceof TFile) || this.isOwn(file.path)) return;
		if (isNote(file.path)) {
			this.onNoteCreated(file.path);
			return;
		}
		// A PDF's `local` only sets automatic wrapping's settle time; it does not depend on any follow setting.
		const local = this.deps.localIntent.consume(file.path);
		if (isPdf(file.path)) this.deps.onPdfCreated(file.path, local);
		// Only a new note is followed; this ends in a recheck.
		this.enqueue({ kind: "create", path: file.path, local, copiedFrom: null });
	}

	/**
	 * A new note may be an in-app copy of a wrapped note, which `follow` answers by copying the PDF. That counts as
	 * local only with a file mark of its own (a folder mark covers whatever sync puts in that folder meanwhile) and
	 * only while "Rename and move the PDF with its note" is on. The mark and the copy's recorded source are used up
	 * either way.
	 */
	private onNoteCreated(path: string): void {
		const copiedFrom = this.deps.localIntent.copySource(path);
		const local = this.deps.localIntent.consumeFileMark(path) && this.deps.getSettings().followRenames;
		// Forget the sources of creates that have expired unused, so the map stays small.
		for (const pending of [...this.createdFrom.keys()]) {
			if (!this.pendingCreates.has(pending)) this.createdFrom.delete(pending);
		}
		if (!local) {
			this.enqueue({ kind: "create", path, local: false, copiedFrom: null });
			return;
		}
		this.pendingCreates.add(path);
		if (copiedFrom === null) this.createdFrom.delete(path);
		else this.createdFrom.set(path, copiedFrom);
		this.enqueue({ kind: "create", path, local: true, copiedFrom });
	}

	/**
	 * Follows once more a note created inside Obsidian, now that the metadata cache has indexed it. The entry is
	 * used up when this runs, not when it is queued: if the first pass already acted (its marker was readable then),
	 * it dropped the entry, and this pass is skipped, so a taken PDF name gives one notice, not two.
	 */
	private continueLocalCreate(path: string): void {
		const copiedFrom = this.createdFrom.get(path) ?? null;
		this.enqueue({ kind: "create", path, local: true, copiedFrom }, () => this.consumeCreate(path));
	}

	/** True, once, while the note at `path` is a recent in-app create that has not been acted on. */
	private consumeCreate(path: string): boolean {
		this.createdFrom.delete(path);
		return this.pendingCreates.consume(path);
	}

	/** The note created at `path` moments ago has left that path: a note sync puts there later is not that create. */
	private forgetCreate(path: string): void {
		this.createdFrom.delete(path);
		this.pendingCreates.forget(path);
	}

	/** Deleted notes are handled by `onNoteDeleted`, which also gets the note's previous cache. A PDF's delete is never followed. */
	private onPdfDelete(file: TAbstractFile): void {
		if (!(file instanceof TFile) || !isPdf(file.path) || this.isOwn(file.path)) return;
		const local = this.deps.localIntent.consume(file.path) && this.deps.getSettings().followDeletes;
		this.enqueue({ kind: "delete", path: file.path, local, wasMarked: false, linkedElsewhere: true });
	}

	private onNoteDeleted(file: TFile, prevCache: CachedMetadata | null): void {
		if (!isNote(file.path)) return;
		this.forgetCreate(file.path);
		if (this.isOwn(file.path)) return;
		const local = this.deps.localIntent.consume(file.path) && this.deps.getSettings().followDeletes;
		// `linkedElsewhere` starts true (keep the PDF); `handle` replaces it once it has looked.
		this.enqueue({ kind: "delete", path: file.path, local, wasMarked: this.wasMarked(file.path, prevCache), linkedElsewhere: true });
	}

	/** True when the deleted note carried the marker, by its previous cache. A template is never a marked note. */
	private wasMarked(notePath: string, prevCache: CachedMetadata | null): boolean {
		const settings = this.deps.getSettings();
		const frontmatter = prevCache?.frontmatter;
		if (!frontmatter || !Object.prototype.hasOwnProperty.call(frontmatter, settings.markerProperty)) return false;
		if (!isMarked(frontmatter[settings.markerProperty])) return false;
		return !isTemplatePath(notePath, templateLocations(this.plugin.app, settings));
	}

	/** True for the plugin's own change. Also uses up the local-intent mark and the copy source the same change left. */
	private isOwn(path: string): boolean {
		if (!this.deps.own.consume(path)) return false;
		this.deps.localIntent.consume(path);
		this.deps.localIntent.copySource(path);
		return true;
	}

	/** Queues `event`; when its turn comes it is handled only if `shouldHandle` (asked then) agrees. */
	private enqueue(event: FollowEvent, shouldHandle: () => boolean = () => true): void {
		this.queue = this.queue
			.then(() => (shouldHandle() ? this.handle(event) : undefined))
			.catch((error: unknown) => console.error("PDF Wrapper: event handling failed", event, error));
	}

	/** A failure is explained to the user and leads to a recheck. */
	private async handle(event: FollowEvent): Promise<void> {
		if (this.unloaded) return;
		try {
			// Let the user's own operation finish first (Obsidian rewrites links after Vault.rename returns).
			// Not an operation of this queue (events run one at a time), but automatic wrapping's Executor runs are not
			// in this queue and can overlap with it; the wait is capped at IDLE_WAIT_MS so nothing can stall it for long.
			await this.waitForIdle();
			if (this.unloaded) return;
			// The PDF that was checked for links from other notes; the only one this event may delete.
			let checkedPdf: string | null = null;
			// Checked as late as possible, so a note that has just gained an embed of the PDF (a merge) is seen. Before
			// the snapshot, because it reads files and so may wait.
			if (event.kind === "delete" && event.local && event.wasMarked) {
				checkedPdf = findPdfBeside(event.path, this.plugin.app.vault.getFiles().map((file) => file.path).filter(isPdf));
				// No PDF beside the deleted note: nothing to delete, and "linked" can only keep a PDF.
				const linkedElsewhere = checkedPdf === null || await this.isLinkedElsewhere(checkedPdf, event.path);
				event = { ...event, linkedElsewhere };
				if (this.unloaded) return;
			}
			let snapshot = this.snapshotAfter(event);
			if (event.kind === "create" && event.local && event.copiedFrom === null) {
				const copiedFrom = await this.copySourceByText(event.path, snapshot);
				if (this.unloaded) return;
				if (copiedFrom !== null) {
					event = { ...event, copiedFrom };
					// Reading the notes may have waited: decide against the vault as it is now.
					snapshot = this.snapshotAfter(event);
				}
			}
			const result = follow(event, snapshot);
			let recheck = result.recheck;
			let pendingRemoved = result.pendingRemoved;
			let actions = result.actions;
			// `follow` renames, copies and deletes only for a local event, and deletes only the PDF beside the deleted
			// note. Held to that here too: anything else is not run, and the PDF is kept and listed.
			const refused = actions.find((action) => action.type !== "notice"
				&& (!event.local || (action.type === "delete" && action.path !== checkedPdf)));
			if (refused !== undefined) {
				console.warn("PDF Wrapper: did not follow", event, refused);
				if (refused.type === "delete") pendingRemoved = refused.path;
				actions = [];
				recheck = true;
			}
			// The create has been acted on (copied or explained): no second pass when the cache reports the note changed.
			if (event.kind === "create" && actions.length > 0) this.consumeCreate(event.path);
			if (actions.length > 0) {
				try {
					// False: the vault changed under us and the remaining actions were skipped.
					if (!(await this.deps.executor.run(actions))) recheck = true;
				} catch (error) {
					// The Executor has already shown a notice naming the file and the reason.
					console.error("PDF Wrapper: could not follow", event, error);
					recheck = true;
				}
			}
			if (recheck) this.requestRecheck(pendingRemoved);
		} catch (error) {
			console.error("PDF Wrapper: could not react to", event, error);
			new Notice(`PDF Wrapper could not react to the change of ${event.path}: ${reason(error)}`);
			this.requestRecheck(null);
		}
	}

	/** The vault as `follow` must see it: after the event, so without the file a `delete` removed. */
	private snapshotAfter(event: FollowEvent): VaultSnapshot {
		const snapshot = gatherVault(this.plugin.app, this.deps.getSettings());
		return event.kind === "delete" ? withoutFile(snapshot, event.path) : snapshot;
	}

	/**
	 * For a note made inside Obsidian that no `Vault.copy` named a source for: the note it is a copy of, judged by
	 * its text. Only when the new note is marked and has no PDF (so only once it is indexed), and only among the notes
	 * of healthy pairs in the same folder; the answer is the one whose text is identical, or null when none or several
	 * are. Read-only (`cachedRead`). On any error answers null, and the copy is listed as "PDF not found".
	 */
	private async copySourceByText(path: string, snapshot: VaultSnapshot): Promise<string | null> {
		try {
			if (!snapshot.marked.some((note) => note.notePath === path)) return null;
			if (findPdfBeside(path, snapshot.pdfPaths) !== null) return null;
			const { vault } = this.plugin.app;
			const created = vault.getFileByPath(path);
			if (created === null) return null;
			const folder = dirname(path);
			const sources = healthyPairs(pairUp(snapshot))
				.map((pair) => pair.notePath)
				.filter((notePath) => notePath !== path && dirname(notePath) === folder);
			if (sources.length === 0) return null;
			const text = await vault.cachedRead(created);
			const candidates: { notePath: string; text: string }[] = [];
			for (const notePath of sources) {
				const note = vault.getFileByPath(notePath);
				if (note !== null) candidates.push({ notePath, text: await vault.cachedRead(note) });
				if (this.unloaded) return null;
			}
			return copySourceByText(text, candidates);
		} catch (error) {
			console.warn("PDF Wrapper: could not look for the note that", path, "was copied from", error);
			return null;
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
			// The PDF is already gone (for example deleted with its folder): nothing to keep, and `follow` will do nothing,
			// so skip reading notes. Answering "linked" can only keep a PDF.
			if (vault.getFileByPath(pdfPath) === null) return true;
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
