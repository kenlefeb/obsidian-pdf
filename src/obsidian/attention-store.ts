import { Notice, type App } from "obsidian";
import type PdfWrapperPlugin from "../main.ts";
import { bulkResultMessage, nextPendingRemoved, noteBesidePdf, noteBesidePdfMessage } from "../core/attention.ts";
import { classify } from "../core/classify.ts";
import { buildAttention, fixesFor, isBulkFixable, isCurrent, planFix } from "../core/fixes.ts";
import { specificAttachmentFolder } from "../core/settings-data.ts";
import type { AttentionItem, Classification, FixId, Snapshot } from "../core/types.ts";
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

	/** Rescans, adding `pendingRemoved` to the PDFs whose note was removed outside Obsidian. Never changes a vault file. */
	refresh(pendingRemoved?: string[]): Promise<AttentionItem[]> {
		return this.serial(() => this.rescan(pendingRemoved ?? []), () => this.items());
	}

	items(): AttentionItem[] {
		return [...this.list];
	}

	classification(): Classification {
		return this.current;
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
				await this.executor.run(actions);
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
		return this.bulkRun("fix", (item, snapshot) =>
			isBulkFixable(item, snapshot) ? fixesFor(item.kind)[0] ?? null : null);
	}

	/** Wraps every unwrapped PDF on the list. Resolves to the number wrapped. */
	wrapAll(): Promise<number> {
		return this.bulkRun("wrap", (item, snapshot) =>
			item.kind === "unwrapped" && isCurrent(item, snapshot) ? "wrap" : null);
	}

	onChange(listener: () => void): () => void {
		this.listeners.add(listener);
		return () => this.listeners.delete(listener);
	}

	/**
	 * Runs `pick`'s fix on each listed entry it accepts, one at a time, re-planning against a fresh snapshot
	 * each time. Stops at the first failure.
	 */
	private bulkRun(kind: "fix" | "wrap", pick: (item: AttentionItem, snapshot: Snapshot) => FixId | null): Promise<number> {
		return this.serial(async () => {
			let done = 0;
			let stopped = false;
			try {
				for (const item of [...this.list]) {
					if (this.unloaded) break;
					const snapshot = this.snapshot();
					const fix = pick(item, snapshot);
					if (fix === null) continue;
					try {
						// False means a file vanished under us: that item is skipped, not counted, and the run goes on.
						// Only a throw is a failure that stops the run.
						if (await this.executor.run(planFix(item, fix, snapshot))) done++;
					} catch (error) {
						// The Executor has already shown a notice naming the file and the reason.
						console.error("PDF Wrapper: bulk fix failed", item, fix, error);
						stopped = true;
						break;
					}
				}
			} catch (error) {
				// Something other than a file action failed, for example reading the vault.
				console.error("PDF Wrapper: bulk fix failed", error);
				stopped = true;
			} finally {
				if (!this.unloaded) new Notice(bulkResultMessage(kind, done, stopped));
				await this.rescan([]);
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
			this.list = buildAttention(c, pending, {
				includeUnwrapped: this.isAutoWrapOn(),
				attachmentFolder: attachmentFolder(this.plugin.app),
			});
			this.scanned = true;
			this.bulk = {
				fix: this.list.filter((item) => isBulkFixable(item, snapshot)).length,
				wrap: this.list.filter((item) => item.kind === "unwrapped").length,
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
