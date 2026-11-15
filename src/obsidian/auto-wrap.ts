import { Notice, type App } from "obsidian";
import { planAutoWrap } from "../core/auto-wrap.ts";
import type { PdfWrapperSettings } from "../core/settings-data.ts";
import { WrapIncomplete, WrapMessage } from "../pdf-wrapper.ts";
import type { Executor } from "./execute.ts";
import { gatherSnapshot } from "./snapshot.ts";
import { SETTLE_MS } from "./watcher.ts";

/** Local-storage key of the per-device switch. Local storage is not synced, unlike the plugin's settings. */
export const AUTO_WRAP_KEY = "pdf-wrapper-auto-wrap";

export function isAutoWrapOn(app: App): boolean {
	return app.loadLocalStorage(AUTO_WRAP_KEY) === true;
}

export function setAutoWrap(app: App, on: boolean): void {
	app.saveLocalStorage(AUTO_WRAP_KEY, on ? true : null);
}

const reason = (error: unknown): string => (error instanceof Error ? error.message : String(error));

/**
 * Wraps PDFs that appear while the plugin runs, but only those still unclaimed and without a note of their name
 * after their own settle period (a note that is about to arrive by sync then wins). Wraps run one at a time, each
 * judged against a snapshot taken after the one before finished. Call `unload()` when the plugin unloads.
 */
export class AutoWrapper {
	/** PDF path to the time it appeared; insertion order is arrival order. */
	private readonly pending = new Map<string, number>();
	private timer: number | null = null;
	private running = false;
	private unloaded = false;
	/** Failure messages already shown this session. */
	private readonly shown = new Set<string>();

	constructor(
		private readonly app: App,
		private readonly executor: Executor,
		private readonly getSettings: () => PdfWrapperSettings,
		private readonly attachmentFolder: () => string | null,
		/** Called after a pass that wrapped something, so lists built from the vault can refresh. */
		private readonly onWrapped: () => void = () => undefined,
	) {}

	/** Waits SETTLE_MS, then wraps the PDF only if shouldAutoWrap is still true against a fresh snapshot. */
	onPdfCreated(path: string): void {
		if (this.unloaded) return;
		this.pending.set(path, Date.now());
		// While a pass is running it picks the new PDF up itself.
		if (!this.running && this.timer === null) this.scheduleAt(Date.now() + SETTLE_MS);
	}

	/** Clears the timer and forgets every pending PDF. A wrap already under way finishes. */
	unload(): void {
		this.unloaded = true;
		this.pending.clear();
		this.cancelTimer();
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
		let wrapped = false;
		try {
			while (!this.unloaded) {
				// Switched off during the settle period: nothing waiting is wrapped.
				if (!isAutoWrapOn(this.app)) {
					this.pending.clear();
					break;
				}
				// Taken fresh for every wrap: the previous one has finished and may have changed the vault.
				const snapshot = gatherSnapshot(this.app, this.getSettings().markerProperty);
				const pending = [...this.pending].map(([path, since]) => ({ path, since }));
				const plan = planAutoWrap(pending, Date.now(), SETTLE_MS, snapshot, this.attachmentFolder());
				for (const path of plan.drop) this.pending.delete(path);
				const next = plan.wrap[0];
				if (next === undefined) {
					this.scheduleAt(plan.waitUntil);
					break;
				}
				this.pending.delete(next);
				if (await this.wrapOne(next)) wrapped = true;
			}
		} catch (error) {
			console.error("PDF Wrapper: automatic wrapping stopped", error);
			this.pending.clear();
		} finally {
			this.running = false;
		}
		if (wrapped && !this.unloaded) this.onWrapped();
	}

	/** True when the PDF ended up wrapped. A failure is reported once per distinct message and does not stop the pass. */
	private async wrapOne(path: string): Promise<boolean> {
		const name = this.app.vault.getFileByPath(path)?.basename ?? path;
		try {
			// Quiet: the Executor would show a notice per failure, and one per PDF of a batch is too many.
			if (!(await this.executor.run([{ type: "wrap", pdfPath: path }], { quiet: true }))) return false;
			new Notice(`Wrapped ${name}`);
			return true;
		} catch (error) {
			if (error instanceof WrapIncomplete) {
				new Notice(`Wrapped ${name}`);
				this.reportOnce(error.message, error.message);
				return true;
			}
			console.error("PDF Wrapper: could not wrap", path, error);
			// A WrapMessage is complete as it is. Any other message names the PDF, so the reason alone is the key.
			if (error instanceof WrapMessage) this.reportOnce(error.message, error.message);
			else this.reportOnce(reason(error), `Failed to wrap ${path}: ${reason(error)}`);
			return false;
		}
	}

	private reportOnce(key: string, message: string): void {
		if (this.shown.has(key)) return;
		this.shown.add(key);
		new Notice(message);
	}
}
