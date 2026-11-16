import { Notice, type App } from "obsidian";
import type PdfWrapperPlugin from "../main.ts";
import { convertedSummary } from "../core/convert.ts";
import { bulkResultMessage, nextPendingRemoved, noteBesidePdfMessage } from "../core/list-text.ts";
import type { ListItem, MarkedNote, Pairing, RepairId, VaultSnapshot } from "../core/model.ts";
import { pairUp } from "../core/pairing.ts";
import { buildList, bulkConvertChecker, bulkWrapChecker, isBulkConvertible, isBulkWrappable, isCurrentItem, noteBesidePdf, planRepair } from "../core/repairs.ts";
import { specificAttachmentFolder } from "../core/settings-data.ts";
import { CONVERTED_NOTICE_MS, isTemplateProblem, WrapIncomplete, WrapMessage, WrapRefusal } from "../pdf-wrapper.ts";
import type { Executor } from "./execute.ts";
import { gatherNoteFolder, gatherVault } from "./vault-snapshot.ts";
import { SETTLE_MS } from "./watcher.ts";

/** Said when a repair is clicked on an entry that no longer describes the vault; the list is then read again. */
const ENTRY_CHANGED = "This entry has changed since it was listed. The list has been refreshed.";

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
 * `applyRepair`, `convertAll` and `wrapAll`, each of which re-plans against a fresh snapshot first.
 * Refreshes and repairs run one at a time, in the order they were asked for.
 */
export class AttentionStore {
	private list: ListItem[] = [];
	private current: Pairing = { pairs: [], unwrappedPdfs: [] };
	/** The marked notes of `current`, by note path. */
	private markedByNote = new Map<string, MarkedNote>();
	private bulk = { convert: 0, wrap: 0 };
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
	refresh(pendingRemoved?: string[]): Promise<ListItem[]> {
		return this.serial(() => this.rescan(pendingRemoved ?? []), () => this.items());
	}

	items(): ListItem[] {
		return [...this.list];
	}

	/** The pairs as of the last refresh. */
	pairing(): Pairing {
		return this.current;
	}

	/** The note as a marked note as of the last refresh, or null when it was not marked. */
	listedMarked(notePath: string): MarkedNote | null {
		return this.markedByNote.get(notePath) ?? null;
	}

	/** How many entries "Convert all" and "Wrap all" would cover, as of the last refresh. */
	bulkCounts(): { convert: number; wrap: number } {
		return { ...this.bulk };
	}

	/**
	 * Carries out one repair the user clicked. The entry is checked against a fresh snapshot first: if it no longer
	 * describes the vault nothing is changed, the user is told and the list is read again.
	 */
	applyRepair(item: ListItem, repair: RepairId, chosenPdf?: string): Promise<void> {
		return this.serial(async () => {
			let ranActions = false;
			// True once the Executor has the plan: it shows a notice of its own for whatever fails from then on.
			let handedOver = false;
			try {
				const snapshot = this.snapshot();
				const pairing = pairUp(snapshot);
				if (!isCurrentItem(item, snapshot, pairing)) {
					new Notice(ENTRY_CHANGED);
					await this.rescan([]);
					return;
				}
				if (repair === "delete-pdf" && item.pdfPath !== null) {
					// The metadata cache (and so `planRepair`) can lag a note that has just come back, for example
					// by sync; the vault's file list does not. Never trash a PDF whose note is there.
					const note = noteBesidePdf(item.pdfPath, this.plugin.app.vault.getFiles().map((f) => f.path));
					if (note !== null) {
						new Notice(noteBesidePdfMessage(note));
						await this.rescan([]);
						return;
					}
				}
				// Planned before anything is saved: no await lies between the snapshot and the plan.
				const actions = planRepair(item, repair, snapshot, chosenPdf, pairing);
				if (repair === "keep-plain" && item.kind === "note-removed" && item.pdfPath !== null) {
					await this.forgetPending(item.pdfPath);
					if (this.unloaded) return;
				}
				ranActions = actions.some((a) => a.type !== "notice");
				handedOver = true;
				await this.executor.run(actions, { skipAfterRun: true });
			} catch (error) {
				// Failed before any file was touched (reading the vault, planning, saving the settings): say so here.
				if (!handedOver && !this.unloaded) new Notice(repairFailedMessage(error));
				console.error("PDF Wrapper: repair failed", item, repair, error);
			}
			await this.rescan([]);
			if (ranActions) this.scheduleFollowUp();
		}, () => undefined);
	}

	/**
	 * Converts every entry "Convert all" covers: the notes that link to their own PDF and have it beside them, so no
	 * file is moved. Resolves to the number converted.
	 *
	 * The entries are chosen once, from the pairs of the last refresh. Each is then checked again just before it is
	 * converted, against its note and that note's folder read afresh (not the whole vault, which would make the run
	 * quadratic): an entry that is no longer as listed is skipped. The list is read again once, when the run ends or stops.
	 */
	convertAll(): Promise<number> {
		const { app, settings } = this.plugin;
		return this.bulkRun("convert", {
			entries: () => this.list.filter(bulkConvertChecker(this.current)),
			snapshotFor: (item) => item.notePath === null ? this.snapshot() : gatherNoteFolder(app, settings, item.notePath),
			pick: (item, _snapshot, pairing) => isBulkConvertible(item, pairing) ? "convert" : null,
			rescanEach: false,
		});
	}

	/**
	 * Wraps every unwrapped PDF on the list that has no note beside it. Automatic wrapping may be wrapping the same
	 * PDFs at the same time, so a PDF another wrap got to first is skipped, not a failure. Resolves to the number wrapped.
	 */
	wrapAll(): Promise<number> {
		return this.bulkRun("wrap", {
			entries: () => [...this.list],
			snapshotFor: () => this.snapshot(),
			pick: (item, snapshot, pairing) => isBulkWrappable(item, snapshot, pairing) ? "wrap" : null,
			// Lets listeners (the explorer styling) see progress while the run goes on.
			rescanEach: true,
		});
	}

	onChange(listener: () => void): () => void {
		this.listeners.add(listener);
		return () => this.listeners.delete(listener);
	}

	/**
	 * Runs `pick`'s repair on each of `entries` it accepts, one at a time, re-planning each against the fresh
	 * snapshot `snapshotFor` gives for it; an entry that has changed since it was listed is skipped. Stops at the first
	 * failure. With `rescanEach` the list is read again after every entry done, otherwise once at the end. Wraps run
	 * quietly: a refused wrap (another wrap got there first, or the PDF cannot be wrapped) is skipped without a
	 * notice, and only another failure (including Templater handing back no note) is reported here and stops the run.
	 */
	private bulkRun(
		kind: "convert" | "wrap",
		run: {
			entries: () => ListItem[];
			snapshotFor: (item: ListItem) => VaultSnapshot;
			pick: (item: ListItem, snapshot: VaultSnapshot, pairing: Pairing) => RepairId | null;
			rescanEach: boolean;
		},
	): Promise<number> {
		return this.serial(async () => {
			let done = 0;
			let stopped = false;
			// False only while the last in-loop rescan already shows the vault as this run left it.
			let needRescan = true;
			// What wraps took out of the notes they made (links the template put in), to be said once for the run.
			const converted: string[] = [];
			try {
				for (const item of run.entries()) {
					if (this.unloaded) break;
					const snapshot = run.snapshotFor(item);
					// Paired once per snapshot, for both the pick and the plan.
					const pairing = pairUp(snapshot);
					const repair = run.pick(item, snapshot, pairing);
					if (repair === null) continue;
					// Nothing to run: the entry has changed since it was listed, or the repair is refused. Skipped, not
					// counted, and a refusal's notice is not shown; for wraps as for converts.
					const actions = planRepair(item, repair, snapshot, undefined, pairing);
					if (!actions.some((a) => a.type !== "notice")) continue;
					needRescan = true;
					let counted = false;
					try {
						// False means a file vanished under us: that item is skipped, not counted, and the run goes on.
						// Only a throw is a failure that stops the run.
						counted = await this.executor.run(actions, {
							skipAfterRun: true,
							quiet: kind === "wrap",
							onConverted: (message) => converted.push(message),
						});
					} catch (error) {
						if (error instanceof WrapRefusal && !isTemplateProblem(error)) {
							// Automatic wrapping (or a click) is wrapping it, its note appeared, or it cannot be wrapped: skip it.
							// Templater handing back no note would likely repeat for every PDF, so that one stops the run below.
							continue;
						}
						if (error instanceof WrapIncomplete) {
							// The PDF is wrapped; only a later step failed. Say so and carry on.
							new Notice(error.message);
							counted = true;
						} else {
							// For a convert the Executor has already shown a notice; a quiet wrap leaves that to us.
							if (kind === "wrap") new Notice(wrapFailureMessage(item.pdfPath, error));
							console.error("PDF Wrapper: bulk repair failed", item, repair, error);
							stopped = true;
							break;
						}
					}
					if (counted) {
						done++;
						if (run.rescanEach) {
							// Not through `serial`: this run is already inside it.
							await this.rescan([]);
							needRescan = false;
						}
					}
				}
			} catch (error) {
				// Something other than a file action failed, for example reading the vault.
				console.error("PDF Wrapper: bulk repair failed", error);
				stopped = true;
				needRescan = true;
			} finally {
				if (!this.unloaded) new Notice(bulkResultMessage(kind, done, stopped));
				const summary = convertedSummary(converted);
				if (summary !== null && !this.unloaded) new Notice(summary, CONVERTED_NOTICE_MS);
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

	private snapshot(): VaultSnapshot {
		return gatherVault(this.plugin.app, this.plugin.settings);
	}

	/** Must run inside `serial`. Never throws: a failure is logged and the previous list kept. */
	private async rescan(added: string[]): Promise<ListItem[]> {
		if (this.unloaded) return this.items();
		try {
			const snapshot = this.snapshot();
			const pairing = pairUp(snapshot);
			const settings = this.plugin.settings;
			const pending = nextPendingRemoved(settings.pendingRemovedPdfs, added, pairing.unwrappedPdfs);
			if (!sameList(pending, settings.pendingRemovedPdfs)) {
				settings.pendingRemovedPdfs = pending;
				await this.plugin.saveSettings();
				if (this.unloaded) return this.items();
			}
			this.current = pairing;
			this.markedByNote = new Map(snapshot.marked.map((note) => [note.notePath, note]));
			this.list = buildList(pairing, pending, attachmentFolder(this.plugin.app), {
				includeUnwrapped: this.isAutoWrapOn(),
				notePaths: snapshot.notePaths,
			});
			this.scanned = true;
			this.bulk = {
				convert: this.list.filter(bulkConvertChecker(pairing)).length,
				// The same test "Wrap all" applies to each entry, so the button's presence matches what it would attempt;
				// indexed once for this snapshot rather than scanning every note for every entry.
				wrap: this.list.filter(bulkWrapChecker(snapshot, pairing)).length,
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
	 * The metadata cache can lag behind a repair's writes to a note, so the refresh straight after a repair may
	 * still see the note as it was. Look once more after the settle period.
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

/** The notice for a repair that failed before the Executor ran anything, so before any vault file was touched. */
function repairFailedMessage(error: unknown): string {
	return `Could not carry out the repair: ${error instanceof Error ? error.message : String(error)}. No file was changed.`;
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
