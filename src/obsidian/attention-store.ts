import { Notice, type App } from "obsidian";
import type PdfWrapperPlugin from "../main.ts";
import { bulkResultMessage, nextPendingRemoved, noteBesidePdf, noteBesidePdfMessage } from "../core/attention.ts";
import { classify } from "../core/classify.ts";
import { buildAttention, fixesFor, isBulkFixable, isBulkWrappable, planFix } from "../core/fixes.ts";
import { specificAttachmentFolder } from "../core/settings-data.ts";
import type { AttentionItem, Classification, FixId, NoteClaim, Snapshot } from "../core/types.ts";
import { WrapIncomplete, WrapMessage, WrapRefusal } from "../pdf-wrapper.ts";
import type { Executor } from "./execute.ts";
import { gatherSnapshot } from "./snapshot.ts";
import { SETTLE_MS } from "./watcher.ts";

/** Obsidian's "Default location for new attachments" value; not in the public type definitions. */
interface VaultWithConfig {
	getConfig?: (key: string) => unknown;
}

export function attachmentFolder(app: App): string | null {
	try {
		return specificAttachmentFolder((app.vault as unknown as VaultWithConfig).getConfig?.("attachmentFolderPath"));
	} catch (error) {
		console.warn("PDF Wrapper: could not read the attachment folder setting", error);
		return null;
	}
}

/**
 * Holds the current Needs attention list. A refresh only reads the vault; files change only through
 * `applyFix`, `fixAll` and `wrapAll`, each of which re-plans against a fresh snapshot first.
 * Refreshes and fixes run one at a time, in the order they were asked for.
 */
export class AttentionStore {
	private list: AttentionItem[] = [];
	private current: Classification = { pairs: [], unwrappedPdfs: [] };
	/** The claims of `current`, by note path. */
	private claimsByNote = new Map<string, NoteClaim>();
	private bulk = { fix: 0, wrap: 0 };
	private chain: Promise<unknown> = Promise.resolve();
	private readonly listeners = new Set<() => void>();
	private readonly openModals = new Set<{ close(): void }>();
	private followUpTimer: number | null = null;
	private scanned = false;
	private unloaded = false;

	constructor(
		private readonly plugin: PdfWrapperPlugin,
		private readonly executor: Executor,
		private readonly isAutoWrapOn: () => boolean,
	) {
		plugin.register(() => {
			this.unloaded = true;
			this.listeners.clear();
			this.cancelFollowUp();
			// No button of an unloaded plugin may stay clickable.
			for (const modal of [...this.openModals]) modal.close();
			this.openModals.clear();
		});
	}

	/** Registers a modal to close when the plugin unloads. Call the returned function when it closes. */
	trackModal(modal: { close(): void }): () => void {
		if (this.unloaded) {
			modal.close();
			return () => undefined;
		}
		this.openModals.add(modal);
		return () => this.openModals.delete(modal);
	}

	/** False until the first scan has completed. */
	hasScanned(): boolean {
		return this.scanned;
	}

	/**
	 * Rescans, adding `pendingRemoved` to the PDFs kept after their note was deleted (outside Obsidian, with following
	 * deletes off, or while other notes link to the PDF). Never changes a vault file.
	 */
	refresh(pendingRemoved?: string[]): Promise<AttentionItem[]> {
		return this.serial(() => this.rescan(pendingRemoved ?? []), () => this.items());
	}

	items(): AttentionItem[] {
		return [...this.list];
	}

	classification(): Classification {
		return this.current;
	}

	/** The note's claim as of the last refresh, or null when it had none. */
	listedClaim(notePath: string): NoteClaim | null {
		return this.claimsByNote.get(notePath) ?? null;
	}

	/** How many entries "Fix all" and "Wrap all" would cover, as of the last refresh. */
	bulkCounts(): { fix: number; wrap: number } {
		return { ...this.bulk };
	}

	applyFix(item: AttentionItem, fix: FixId, chosenPdf?: string): Promise<void> {
		return this.serial(async () => {
			let ranActions = false;
			try {
				if (fix === "keep-plain" && item.kind === "note-removed" && item.pdfPath !== null) {
					await this.forgetPending(item.pdfPath);
					if (this.unloaded) return;
				}
				if (fix === "delete-pdf" && item.pdfPath !== null) {
					// The metadata cache (and so `planFix`) can lag a note that has just come back, for example
					// by sync; the vault's file list does not. Never trash a PDF whose note is there.
					const note = noteBesidePdf(item.pdfPath, this.plugin.app.vault.getFiles().map((f) => f.path));
					if (note !== null) {
						new Notice(noteBesidePdfMessage(note));
						await this.rescan([]);
						return;
					}
				}
				const actions = planFix(item, fix, this.snapshot(), chosenPdf);
				ranActions = actions.some((a) => a.type !== "notice");
				await this.executor.run(actions, { skipAfterRun: true });
			} catch (error) {
				// The Executor has already shown a notice naming the file and the reason.
				console.error("PDF Wrapper: fix failed", item, fix, error);
			}
			await this.rescan([]);
			if (ranActions) this.scheduleFollowUp();
		}, () => undefined);
	}

	/** Applies the default fix to every entry "Fix all" covers. Resolves to the number fixed. */
	fixAll(): Promise<number> {
		return this.bulkRun("fix", (item, snapshot, c) =>
			isBulkFixable(item, snapshot, c) ? fixesFor(item.kind)[0] ?? null : null);
	}

	/**
	 * Wraps every unwrapped PDF on the list that has no note beside it. Automatic wrapping may be wrapping the same
	 * PDFs at the same time, so a PDF another wrap got to first is skipped, not a failure. Resolves to the number wrapped.
	 */
	wrapAll(): Promise<number> {
		return this.bulkRun("wrap", (item, snapshot, c) => isBulkWrappable(item, snapshot, c) ? "wrap" : null);
	}

	onChange(listener: () => void): () => void {
		this.listeners.add(listener);
		return () => this.listeners.delete(listener);
	}

	/**
	 * Runs `pick`'s fix on each listed entry it accepts, one at a time, re-planning against a fresh snapshot
	 * each time. Stops at the first failure. Wraps run quietly: a refused wrap (another wrap got there first, or the
	 * PDF cannot be wrapped) is skipped without a notice, and only another failure is reported here and stops the run.
	 */
	private bulkRun(
		kind: "fix" | "wrap",
		pick: (item: AttentionItem, snapshot: Snapshot, c: Classification) => FixId | null,
	): Promise<number> {
		return this.serial(async () => {
			let done = 0;
			let stopped = false;
			// False only while the last in-loop rescan already shows the vault as this run left it.
			let needRescan = true;
			try {
				for (const item of [...this.list]) {
					if (this.unloaded) break;
					const snapshot = this.snapshot();
					// Classified once per snapshot, for both the pick and the plan.
					const c = classify(snapshot);
					const fix = pick(item, snapshot, c);
					if (fix === null) continue;
					needRescan = true;
					let counted = false;
					try {
						// False means a file vanished under us: that item is skipped, not counted, and the run goes on.
						// Only a throw is a failure that stops the run.
						counted = await this.executor.run(planFix(item, fix, snapshot, undefined, c), { skipAfterRun: true, quiet: kind === "wrap" });
					} catch (error) {
						if (error instanceof WrapRefusal) {
							// Automatic wrapping (or a click) is wrapping it, its note appeared, or it cannot be wrapped: skip it.
							continue;
						}
						if (error instanceof WrapIncomplete) {
							// The PDF is wrapped; only a later step failed. Say so and carry on.
							new Notice(error.message);
							counted = true;
						} else {
							// For a fix the Executor has already shown a notice; a quiet wrap leaves that to us.
							if (kind === "wrap") new Notice(wrapFailureMessage(item.pdfPath, error));
							console.error("PDF Wrapper: bulk fix failed", item, fix, error);
							stopped = true;
							break;
						}
					}
					if (counted) {
						done++;
						// Let listeners (the explorer styling) see progress while the run goes on; not through `serial`.
						await this.rescan([]);
						needRescan = false;
					}
				}
			} catch (error) {
				// Something other than a file action failed, for example reading the vault.
				console.error("PDF Wrapper: bulk fix failed", error);
				stopped = true;
				needRescan = true;
			} finally {
				if (!this.unloaded) new Notice(bulkResultMessage(kind, done, stopped));
				if (needRescan) await this.rescan([]);
				if (done > 0) this.scheduleFollowUp();
			}
			return done;
		}, () => 0);
	}

	/** Runs `task` after every earlier one has settled; once the plugin has unloaded, returns `ifUnloaded()` instead. */
	private serial<T>(task: () => Promise<T>, ifUnloaded: () => T): Promise<T> {
		const run = this.chain.then(() => (this.unloaded ? ifUnloaded() : task()));
		this.chain = run.catch(() => undefined);
		return run;
	}

	private snapshot(): Snapshot {
		return gatherSnapshot(this.plugin.app, this.plugin.settings.markerProperty);
	}

	/** Must run inside `serial`. Never throws: a failure is logged and the previous list kept. */
	private async rescan(added: string[]): Promise<AttentionItem[]> {
		if (this.unloaded) return this.items();
		try {
			const snapshot = this.snapshot();
			const c = classify(snapshot);
			const settings = this.plugin.settings;
			const pending = nextPendingRemoved(settings.pendingRemovedPdfs, added, c.unwrappedPdfs);
			if (!sameList(pending, settings.pendingRemovedPdfs)) {
				settings.pendingRemovedPdfs = pending;
				await this.plugin.saveSettings();
				if (this.unloaded) return this.items();
			}
			this.current = c;
			this.claimsByNote = new Map(c.pairs.map((pair) => [pair.notePath, pair]));
			this.list = buildAttention(c, pending, {
				includeUnwrapped: this.isAutoWrapOn(),
				attachmentFolder: attachmentFolder(this.plugin.app),
				notePaths: snapshot.notePaths,
			});
			this.scanned = true;
			this.bulk = {
				fix: this.list.filter((item) => isBulkFixable(item, snapshot, c)).length,
				// The same test "Wrap all" applies to each entry, so the button's presence matches what it would attempt.
				wrap: this.list.filter((item) => isBulkWrappable(item, snapshot, c)).length,
			};
		} catch (error) {
			console.error("PDF Wrapper: could not check wrapped documents", error);
		}
		this.notify();
		return this.items();
	}

	private async forgetPending(pdfPath: string): Promise<void> {
		const settings = this.plugin.settings;
		if (!settings.pendingRemovedPdfs.includes(pdfPath)) return;
		settings.pendingRemovedPdfs = settings.pendingRemovedPdfs.filter((p) => p !== pdfPath);
		await this.plugin.saveSettings();
	}

	/**
	 * The metadata cache can lag behind a fix's frontmatter writes, so the refresh straight after a fix may
	 * still see the old claim. Look once more after the settle period.
	 */
	private scheduleFollowUp(): void {
		if (this.unloaded) return;
		this.cancelFollowUp();
		this.followUpTimer = window.setTimeout(() => {
			this.followUpTimer = null;
			void this.refresh();
		}, SETTLE_MS);
	}

	private cancelFollowUp(): void {
		if (this.followUpTimer === null) return;
		window.clearTimeout(this.followUpTimer);
		this.followUpTimer = null;
	}

	private notify(): void {
		for (const listener of [...this.listeners]) {
			try {
				listener();
			} catch (error) {
				console.error("PDF Wrapper: attention list listener failed", error);
			}
		}
	}
}

/** The notice for a wrap in "Wrap all" that failed, as the Executor would show it for a wrap that is not quiet. */
function wrapFailureMessage(pdfPath: string | null, error: unknown): string {
	if (error instanceof WrapMessage) return error.message;
	return `Failed to wrap ${pdfPath ?? "a PDF"}: ${error instanceof Error ? error.message : String(error)}`;
}

function sameList(a: string[], b: string[]): boolean {
	return a.length === b.length && a.every((p, i) => p === b[i]);
}

/**
 * The startup scan: after the settle period, refresh; if anything is listed, wait once more so pairs that
 * sync has since completed drop off, refresh again, and only then call `show` with the count.
 * Its timers are cleared when the plugin unloads.
 */
export function scanAtStartup(plugin: PdfWrapperPlugin, store: AttentionStore, show: (count: number) => void): void {
	let timer: number | null = null;
	let unloaded = false;
	plugin.register(() => {
		unloaded = true;
		if (timer !== null) window.clearTimeout(timer);
	});
	const after = (ms: number, step: () => Promise<void>) => {
		timer = window.setTimeout(() => {
			timer = null;
			if (!unloaded) void step();
		}, ms);
	};
	after(SETTLE_MS, async () => {
		const first = await store.refresh();
		if (unloaded || first.length === 0) return;
		after(SETTLE_MS, async () => {
			const second = await store.refresh();
			if (!unloaded && second.length > 0) show(second.length);
		});
	});
}
