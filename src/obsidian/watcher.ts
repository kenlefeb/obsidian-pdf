import { Notice, TFile, type CachedMetadata, type Plugin, type TAbstractFile } from "obsidian";
import { parseClaim } from "../core/claims.ts";
import { isNote, isPdf } from "../core/paths.ts";
import { react } from "../core/react.ts";
import type { PdfWrapperSettings } from "../core/settings-data.ts";
import type { Snapshot, VaultEvent } from "../core/types.ts";
import type { Executor, OwnChanges } from "./execute.ts";
import type { LocalIntent } from "./local-intent.ts";
import { gatherSnapshot } from "./snapshot.ts";

/** How long after the last change that needs it the pairs are re-examined. Provisional: spike 2 has no data yet. */
export const SETTLE_MS = 2000;

export interface WatcherDeps {
	localIntent: LocalIntent;
	own: OwnChanges;
	executor: Executor;
	getSettings: () => PdfWrapperSettings;
	/** Called once per settle window; with each PDF whose note was removed outside Obsidian, or once with null. */
	onRecheck: (pendingRemoved: string | null) => void;
}

const reason = (error: unknown): string => (error instanceof Error ? error.message : String(error));

/** A snapshot with every trace of `path` removed (a deleted file the caches may still remember). */
function without(snapshot: Snapshot, path: string): Snapshot {
	return {
		notePaths: snapshot.notePaths.filter((p) => p !== path),
		pdfPaths: snapshot.pdfPaths.filter((p) => p !== path),
		claims: snapshot.claims.filter((c) => c.notePath !== path),
	};
}

/**
 * Follows renames, moves and deletes made inside Obsidian across a pair, by passing each vault event to
 * `react` and running exactly the actions it returns. Events are handled one at a time, in arrival order.
 */
export class Watcher {
	private queue: Promise<void> = Promise.resolve();
	private recheckTimer: number | null = null;
	private readonly pendingRemoved = new Set<string>();

	constructor(private readonly plugin: Plugin, private readonly deps: WatcherDeps) {
		plugin.register(() => this.cancelRecheck());
	}

	/** Registers the handlers once the layout is ready, so the `create` fired for every file on load is not seen. */
	start(): void {
		const { workspace, vault, metadataCache } = this.plugin.app;
		workspace.onLayoutReady(() => {
			this.plugin.registerEvent(vault.on("rename", (file, oldPath) => this.onRename(file, oldPath)));
			this.plugin.registerEvent(vault.on("create", (file) => this.onCreate(file)));
			this.plugin.registerEvent(vault.on("delete", (file) => this.onPdfDelete(file)));
			this.plugin.registerEvent(metadataCache.on("deleted", (file, prevCache) => this.onNoteDeleted(file, prevCache)));
		});
	}

	// The handlers below decide everything that depends on the moment of the event (own change,
	// local intent, the deleted note's claim) at once, and queue the rest.

	private onRename(file: TAbstractFile, oldPath: string): void {
		// A folder's children fire their own renames.
		if (!(file instanceof TFile) || this.isOwn(oldPath)) return;
		const local = this.deps.localIntent.consume(oldPath) && this.deps.getSettings().followRenames;
		this.enqueue({ kind: "rename", path: file.path, oldPath, local });
	}

	private onCreate(file: TAbstractFile): void {
		if (!(file instanceof TFile) || this.isOwn(file.path)) return;
		const local = this.deps.localIntent.consume(file.path);
		this.enqueue({ kind: "create", path: file.path, local });
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

	private enqueue(event: VaultEvent): void {
		this.queue = this.queue.then(() => this.handle(event));
	}

	/** Never rejects: a failure is explained to the user and leads to a recheck. */
	private async handle(event: VaultEvent): Promise<void> {
		try {
			let snapshot = gatherSnapshot(this.plugin.app, this.deps.getSettings().markerProperty);
			if (event.kind === "delete") snapshot = without(snapshot, event.path);
			const reaction = react(event, snapshot);
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

	/** Debounced: the recheck runs SETTLE_MS after the last request, once for the whole burst. */
	private requestRecheck(pendingRemoved: string | null): void {
		if (pendingRemoved !== null) this.pendingRemoved.add(pendingRemoved);
		this.cancelRecheck();
		this.recheckTimer = window.setTimeout(() => this.fireRecheck(), SETTLE_MS);
	}

	private fireRecheck(): void {
		this.recheckTimer = null;
		const pending = [...this.pendingRemoved];
		this.pendingRemoved.clear();
		try {
			if (pending.length === 0) this.deps.onRecheck(null);
			for (const path of pending) this.deps.onRecheck(path);
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
