import { Notice, TFile, type App, type TAbstractFile } from "obsidian";
import { currentOwnTargets } from "../core/convert.ts";
import type { OwnChanges } from "../core/marks.ts";
import type { FileAction } from "../core/model.ts";
import { findPdfBeside } from "../core/pairing.ts";
import { isPdf } from "../core/paths.ts";
import type { PdfWrapperSettings } from "../core/settings-data.ts";
import { siblingNotePath, wrapPdf, WrapIncomplete, WrapMessage, type WrapOptions } from "../pdf-wrapper.ts";
import { thenHook } from "../core/then-hook.ts";
import { waitAtMost } from "../core/wait.ts";
import { BodyConvertError, convertNote, ownTargetsFor } from "./vault-snapshot.ts";
import { IDLE_WAIT_MS } from "./watcher.ts";

interface RunOptions {
	quiet?: boolean;
	skipAfterRun?: boolean;
	/** Only with `quiet`: given the message of a wrap that took links to the PDF out of the note it made. */
	onConverted?: (message: string) => void;
}

/** What became of one action: carried out, or skipped because a file it needs is no longer there. */
type Outcome = "done" | "stale";

const reason = (error: unknown): string => (error instanceof Error ? error.message : String(error));

/** Carries out the actions the core returns (`follow`, `planRepair`), and nothing more. */
export class Executor {
	constructor(
		private readonly app: App,
		private readonly getSettings: () => PdfWrapperSettings,
		private readonly saveSettings: () => Promise<void>,
		private readonly own: OwnChanges,
		/** Called after every `run`, even a failed one, because files may have changed. */
		private readonly afterRun: () => void = () => undefined,
		/** Resolves once no file operation made inside Obsidian is still running (`LocalIntent.whenIdle`). */
		private readonly whenIdle: () => Promise<void> = () => Promise.resolve(),
	) {}

	/**
	 * `wrapPdf` with the note it creates marked as the plugin's own change, so the Watcher does not take it for a note
	 * the user made. The mark is removed once the wrap settles either way: if Templater created the note elsewhere and
	 * it was moved into place, no create event used the mark, and it must not linger.
	 */
	wrapMarked(pdf: TFile, options: WrapOptions): Promise<TFile> {
		return this.withMark(siblingNotePath(pdf), "settled", () =>
			wrapPdf(this.app, this.getSettings(), this.saveSettings, pdf, options));
	}

	/**
	 * Runs the actions one after another. Resolves true when every action ran, false when it stopped
	 * quietly because a file an action needs is no longer there (the vault changed under us; recheck).
	 * On a failure it stops, shows a Notice naming the file and the reason, and rethrows.
	 * With `skipAfterRun`, the `afterRun` hook is not called (the caller refreshes itself).
	 * With `quiet`, a `wrap` action (and only that) shows no Notice of its own: its failure, and a WrapIncomplete
	 * (the PDF is wrapped but a later step failed), are thrown for the caller to report. Nor does it show the message
	 * about links the template had put in the new note: that goes to `onConverted`, for the caller to show once for
	 * its whole run (see `convertedSummary`), or to the console when there is none.
	 */
	async run(actions: FileAction[], options: RunOptions = {}): Promise<boolean> {
		const task = () => this.runAll(actions, options);
		return options.skipAfterRun === true ? task() : thenHook(task, this.afterRun);
	}

	private async runAll(actions: FileAction[], options: RunOptions): Promise<boolean> {
		const quiet = options.quiet === true;
		for (const action of actions) {
			let outcome: Outcome;
			try {
				outcome = await this.runOne(action, options);
			} catch (error) {
				if (!(quiet && action.type === "wrap")) new Notice(this.failureMessage(action, error));
				throw error;
			}
			if (outcome === "stale") return false;
		}
		return true;
	}

	private async runOne(action: FileAction, options: RunOptions): Promise<Outcome> {
		switch (action.type) {
			case "rename":
				return this.rename(action.from, action.to);
			case "copy":
				return this.copy(action.from, action.to);
			case "removeMarker":
				return this.removeMarker(action.notePath);
			case "convert":
				return this.convert(action.notePath, action.ownTargets);
			case "delete":
				return this.delete(action.path);
			case "wrap":
				return this.wrap(action.pdfPath, options);
			case "notice":
				new Notice(action.message);
				return "done";
		}
	}

	private async rename(from: string, to: string): Promise<Outcome> {
		const source = this.app.vault.getFileByPath(from);
		if (!source) return "stale";
		if (from === to) return "done";
		// A rename that only changes letter case may find the source itself at the destination; that does not count.
		const caseOnly = from.toLowerCase() === to.toLowerCase();
		if (this.isOccupied(to, caseOnly ? source : null)) throw new Error("a file or folder with that name already exists.");
		await this.withMark(from, "event", () => this.app.fileManager.renameFile(source, to));
		return "done";
	}

	private async copy(from: string, to: string): Promise<Outcome> {
		const source = this.app.vault.getFileByPath(from);
		if (!source) return "stale";
		if (this.isOccupied(to, null)) throw new Error("a file or folder with that name already exists.");
		await this.withMark(to, "event", () => this.app.vault.copy(source, to));
		return "done";
	}

	private async removeMarker(notePath: string): Promise<Outcome> {
		const note = this.app.vault.getFileByPath(notePath);
		if (!note) return "stale";
		const marker = this.getSettings().markerProperty;
		await this.withMark(notePath, "settled", () =>
			this.app.fileManager.processFrontMatter(note, (frontmatter: Record<string, unknown>) => {
				delete frontmatter[marker];
			}));
		return "done";
	}

	private async convert(notePath: string, ownTargets: string[]): Promise<Outcome> {
		const note = this.app.vault.getFileByPath(notePath);
		if (!note) return "stale";
		// A rename just before this (Convert moving the PDF beside the note) makes Obsidian rewrite the note's links to
		// the PDF. Let that finish, as far as the plugin can tell, then read the spellings the note uses now.
		await waitAtMost(this.whenIdle(), IDLE_WAIT_MS).done;
		const targets = await this.ownTargetsNow(note, ownTargets);
		await this.withMark(notePath, "settled", () => convertNote(this.app, note, this.getSettings().markerProperty, targets));
		return "done";
	}

	/**
	 * The link spellings to convert, as the note stands now: those its text uses for the PDF beside it, and the
	 * planned ones that still resolve to that PDF or to nothing (see `currentOwnTargets`). With no PDF beside the
	 * note, the planned ones as given.
	 */
	private async ownTargetsNow(note: TFile, planned: string[]): Promise<string[]> {
		const beside = (note.parent?.children ?? []).filter((file) => file instanceof TFile && isPdf(file.path)).map((file) => file.path);
		const pdfPath = findPdfBeside(note.path, beside);
		const pdf = pdfPath === null ? null : this.app.vault.getFileByPath(pdfPath);
		if (pdf === null) return planned;
		const fresh = await ownTargetsFor(this.app, note, pdf);
		return currentOwnTargets(fresh, planned, pdf.path,
			(target) => this.app.metadataCache.getFirstLinkpathDest(target, note.path)?.path ?? null);
	}

	private async delete(path: string): Promise<Outcome> {
		const file = this.app.vault.getFileByPath(path);
		// Already gone, for example because its folder was deleted with it.
		if (!file) return "done";
		await this.withMark(path, "event", () => this.app.fileManager.trashFile(file));
		return "done";
	}

	private async wrap(pdfPath: string, options: RunOptions): Promise<Outcome> {
		const quiet = options.quiet === true;
		// Not quiet: the wrap shows its own notice.
		const onConverted = quiet
			? options.onConverted ?? ((message: string) => console.warn(`PDF Wrapper: ${message}`))
			: undefined;
		const pdf = this.app.vault.getFileByPath(pdfPath);
		if (!pdf) return "stale";
		try {
			await this.wrapMarked(pdf, { open: false, onConverted });
		} catch (error) {
			// The PDF is wrapped; only a later step failed. Say so and carry on.
			if (quiet || !(error instanceof WrapIncomplete)) throw error;
			new Notice(error.message);
		}
		return "done";
	}

	/**
	 * Marks `path` as the plugin's own change while `change` runs. With "event", the create, rename or delete event the
	 * change fires uses the mark up, so it is removed here only if the change fails. With "settled", it is removed when
	 * the change settles either way: an edit of a note's contents fires no such event.
	 */
	private async withMark<T>(path: string, until: "event" | "settled", change: () => Promise<T>): Promise<T> {
		const release = this.own.mark(path);
		let failed = true;
		try {
			const result = await change();
			failed = false;
			return result;
		} finally {
			if (failed || until === "settled") release();
		}
	}

	/** True when a file or folder other than `except` is at `path`, ignoring letter case as a case-insensitive file system would. */
	private isOccupied(path: string, except: TAbstractFile | null): boolean {
		const exact = this.app.vault.getAbstractFileByPath(path);
		if (exact && exact !== except) return true;
		const wanted = path.toLowerCase();
		return this.app.vault.getAllLoadedFiles().some((file) => file !== except && file.path.toLowerCase() === wanted);
	}

	private failureMessage(action: FileAction, error: unknown): string {
		const why = reason(error);
		const marker = this.getSettings().markerProperty;
		switch (action.type) {
			case "rename":
				return `Could not rename ${action.from} to ${action.to}: ${why}`;
			case "copy":
				return `Could not copy ${action.from} to ${action.to}: ${why}`;
			case "removeMarker":
				return `Could not remove the "${marker}" property from ${action.notePath}: ${why}`;
			case "convert":
				return error instanceof BodyConvertError
					? `Set the "${marker}" property of ${action.notePath} to true and took its PDF out of the other properties, ` +
						`but could not replace the links to the PDF in its text: ${why}`
					: `Could not convert ${action.notePath}: ${why}`;
			case "delete":
				return `Could not delete ${action.path}: ${why}`;
			case "wrap":
				return error instanceof WrapMessage ? error.message : `Failed to wrap ${action.pdfPath}: ${why}`;
			case "notice":
				return `Could not show a message: ${why}`;
		}
	}
}
