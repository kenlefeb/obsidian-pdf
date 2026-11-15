import { Notice, type App } from "obsidian";
import { autoWrapDueAt, planAutoWrap, stoppedMessage, summarizeWraps, type ArrivalOrigin, type WrapOutcome } from "../core/auto-wrap.ts";
import type { PdfWrapperSettings } from "../core/settings-data.ts";
import { WrapIncomplete, WrapMessage, WrapRefusal } from "../pdf-wrapper.ts";
import type { Executor } from "./execute.ts";
import { gatherSnapshot } from "./snapshot.ts";

/** Local-storage key of the per-device switch. Local storage is not synced, unlike the plugin's settings. */
export const AUTO_WRAP_KEY = "pdf-wrapper-auto-wrap";

export function isAutoWrapOn(app: App): boolean {
	return app.loadLocalStorage(AUTO_WRAP_KEY) === true;
}

export function setAutoWrap(app: App, on: boolean): void {
	app.saveLocalStorage(AUTO_WRAP_KEY, on ? true : null);
}

const reason = (error: unknown): string => (error instanceof Error ? error.message : String(error));

/** A single wrap running this long leaves a trace in the console; it is never abandoned. */
const SLOW_WRAP_MS = 60000;

/**
 * Wraps PDFs that appear while the plugin runs, but only those still unclaimed and without a note of their name
 * once they are due (a PDF made inside Obsidian after a couple of seconds, one from outside after 15 to 30 s, so a
 * note that is about to arrive by sync wins). Wraps run one at a time, each judged against a snapshot taken after
 * the one before finished. Notices are summarised once per pass. Call `unload()` when the plugin unloads.
 */
export class AutoWrapper {
	/** PDF path to the time it becomes due; insertion order is arrival order. */
	private readonly pending = new Map<string, number>();
	private timer: number | null = null;
	private running = false;
	private unloaded = false;

	constructor(
		private readonly app: App,
		private readonly executor: Executor,
		private readonly getSettings: () => PdfWrapperSettings,
		private readonly attachmentFolder: () => string | null,
		/**
		 * Called after each wrap attempt, so lists built from the vault can refresh while a long pass runs. The wraps
		 * skip the Executor's own after-run refresh, so this should be a coalescing refresh.
		 */
		private readonly onWrapped: () => void = () => undefined,
	) {}

	/** Queues the PDF; it is wrapped once due, only if shouldAutoWrap is still true against a fresh snapshot. */
	onPdfCreated(path: string, local: boolean): void {
		if (this.unloaded) return;
		const origin: ArrivalOrigin = local ? "local" : "outside";
		const due = autoWrapDueAt(Date.now(), origin);
		this.pending.set(path, due);
		// While a pass is running it picks the new PDF up itself.
		if (!this.running) this.scheduleAt(this.earliestDue());
	}

	/** Clears the timer and forgets every pending PDF. A wrap already under way finishes, silently. */
	unload(): void {
		this.unloaded = true;
		this.pending.clear();
		this.cancelTimer();
	}

	private earliestDue(): number | null {
		let earliest: number | null = null;
		for (const due of this.pending.values()) earliest = earliest === null ? due : Math.min(earliest, due);
		return earliest;
	}

	private scheduleAt(time: number | null): void {
		this.cancelTimer();
		if (time === null || this.unloaded) return;
		this.timer = window.setTimeout(() => {
			this.timer = null;
			if (!this.unloaded) void this.drain();
		}, Math.max(0, time - Date.now()));
	}

	private cancelTimer(): void {
		if (this.timer === null) return;
		window.clearTimeout(this.timer);
		this.timer = null;
	}

	private async drain(): Promise<void> {
		if (this.running) return;
		this.running = true;
		const outcomes: WrapOutcome[] = [];
		let stopped: string | null = null;
		try {
			while (!this.unloaded) {
				// Switched off while waiting: nothing waiting is wrapped.
				if (!isAutoWrapOn(this.app)) {
					this.pending.clear();
					break;
				}
				// Taken fresh for every wrap: the previous one has finished and may have changed the vault.
				const snapshot = gatherSnapshot(this.app, this.getSettings().markerProperty);
				const pending = [...this.pending].map(([path, due]) => ({ path, due }));
				const plan = planAutoWrap(pending, Date.now(), snapshot, this.attachmentFolder());
				for (const path of plan.drop) this.pending.delete(path);
				const next = plan.wrap[0];
				if (next === undefined) {
					this.scheduleAt(plan.waitUntil);
					break;
				}
				this.pending.delete(next);
				const outcome = await this.wrapOne(next);
				outcomes.push(outcome);
				// Also after a failure: the note may have been created before a later step failed.
				if (!this.unloaded) this.onWrapped();
			}
		} catch (error) {
			console.error("PDF Wrapper: automatic wrapping stopped", error);
			this.pending.clear();
			stopped = reason(error);
		} finally {
			this.running = false;
		}
		if (this.unloaded) return;
		for (const message of summarizeWraps(outcomes)) new Notice(message);
		if (stopped !== null) {
			new Notice(stoppedMessage(stopped));
		}
	}

	/** Never throws: a failure is an outcome, and the pass goes on. */
	private async wrapOne(path: string): Promise<WrapOutcome> {
		const name = this.app.vault.getFileByPath(path)?.basename ?? path;
		const slow = window.setTimeout(() => {
			console.warn(`PDF Wrapper: wrapping ${path} has been running for more than ${SLOW_WRAP_MS / 1000} s; it may be waiting for a prompt.`);
		}, SLOW_WRAP_MS);
		try {
			// Quiet: the Executor would show a notice per failure; the pass shows one summary instead.
			// skipAfterRun: the pass calls `onWrapped` itself after every wrap.
			if (!(await this.executor.run([{ type: "wrap", pdfPath: path }], { quiet: true, skipAfterRun: true }))) return { kind: "skipped" };
			return { kind: "wrapped", name };
		} catch (error) {
			if (error instanceof WrapIncomplete) return { kind: "incomplete", name, message: error.message };
			// The note arrived after the snapshot, or another wrap (a click, or "Wrap all") is creating it right now:
			// someone else is wrapping it, which is what we wanted.
			if (error instanceof WrapRefusal && (error.reason === "note-exists" || error.reason === "in-flight")) return { kind: "skipped" };
			console.error("PDF Wrapper: could not wrap", path, error);
			return { kind: "failed", message: error instanceof WrapMessage ? error.message : `Failed to wrap ${path}: ${reason(error)}` };
		} finally {
			window.clearTimeout(slow);
		}
	}
}
