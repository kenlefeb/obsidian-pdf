import { Notice, type App, type TAbstractFile } from "obsidian";
import type { OwnChanges } from "../core/marks.ts";
import type { FileAction } from "../core/model.ts";
import type { Action } from "../core/types.ts";
import type { PdfWrapperSettings } from "../core/settings-data.ts";
import { siblingNotePath, wrapPdf, WrapIncomplete, WrapMessage } from "../pdf-wrapper.ts";
import { thenHook } from "../core/then-hook.ts";
import { EmbedUpdateError, writeClaim } from "./snapshot.ts";
import { convertNote } from "./vault-snapshot.ts";

/** The claim-based actions (until they are removed) and the actions of name-independent pairing. */
type AnyAction = Action | FileAction;

/** What became of one action: carried out, or skipped because a file it needs is no longer there. */
type Outcome = "done" | "stale";

const reason = (error: unknown): string => (error instanceof Error ? error.message : String(error));

/** Carries out the actions the core returns (`react`, `planFix`, `follow`, `planRepair`), and nothing more. */
export class Executor {
	constructor(
		private readonly app: App,
		private readonly getSettings: () => PdfWrapperSettings,
		private readonly saveSettings: () => Promise<void>,
		private readonly own: OwnChanges,
		/** Called after every `run`, even a failed one, because files may have changed. */
		private readonly afterRun: () => void = () => undefined,
	) {}

	/**
	 * Runs the actions one after another. Resolves true when every action ran, false when it stopped
	 * quietly because a file an action needs is no longer there (the vault changed under us; recheck).
	 * On a failure it stops, shows a Notice naming the file and the reason, and rethrows.
	 * With `skipAfterRun`, the `afterRun` hook is not called (the caller refreshes itself).
	 * With `quiet`, a `wrap` action (and only that) shows no Notice of its own: its failure, and a WrapIncomplete
	 * (the PDF is wrapped but a later step failed), are thrown for the caller to report.
	 */
	async run(actions: AnyAction[], options: { quiet?: boolean; skipAfterRun?: boolean } = {}): Promise<boolean> {
		const task = () => this.runAll(actions, options.quiet === true);
		return options.skipAfterRun === true ? task() : thenHook(task, this.afterRun);
	}

	private async runAll(actions: AnyAction[], quiet: boolean): Promise<boolean> {
		for (const action of actions) {
			let outcome: Outcome;
			try {
				outcome = await this.runOne(action, quiet);
			} catch (error) {
				if (!(quiet && action.type === "wrap")) new Notice(this.failureMessage(action, error));
				throw error;
			}
			if (outcome === "stale") return false;
		}
		return true;
	}

	private async runOne(action: AnyAction, quiet: boolean): Promise<Outcome> {
		switch (action.type) {
			case "rename":
				return this.rename(action.from, action.to);
			case "copy":
				return this.copy(action.from, action.to);
			case "setClaim":
				return this.setClaim(action.notePath, action.pdfPath, action.oldTargets);
			case "removeClaim":
				return this.removeClaim(action.notePath);
			case "removeMarker":
				return this.removeMarker(action.notePath);
			case "convert":
				return this.convert(action.notePath, action.ownTargets);
			case "delete":
				return this.delete(action.path);
			case "wrap":
				return this.wrap(action.pdfPath, quiet);
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
		await this.withMark(from, () => this.app.fileManager.renameFile(source, to));
		return "done";
	}

	private async copy(from: string, to: string): Promise<Outcome> {
		const source = this.app.vault.getFileByPath(from);
		if (!source) return "stale";
		if (this.isOccupied(to, null)) throw new Error("a file or folder with that name already exists.");
		await this.withMark(to, () => this.app.vault.copy(source, to));
		return "done";
	}

	private async setClaim(notePath: string, pdfPath: string, oldTargets: string[]): Promise<Outcome> {
		const note = this.app.vault.getFileByPath(notePath);
		if (!note) return "stale";
		const marker = this.getSettings().markerProperty;
		try {
			await writeClaim(this.app, note, marker, pdfPath, oldTargets);
		} catch (error) {
			if (!(error instanceof EmbedUpdateError)) throw error;
			new Notice(`Updated the "${marker}" property of ${notePath}, but could not update its PDF embed: ${error.message}`);
		}
		return "done";
	}

	private async removeClaim(notePath: string): Promise<Outcome> {
		const note = this.app.vault.getFileByPath(notePath);
		if (!note) return "stale";
		const marker = this.getSettings().markerProperty;
		await this.app.fileManager.processFrontMatter(note, (frontmatter: Record<string, unknown>) => {
			delete frontmatter[marker];
		});
		return "done";
	}

	private async removeMarker(notePath: string): Promise<Outcome> {
		const note = this.app.vault.getFileByPath(notePath);
		if (!note) return "stale";
		const marker = this.getSettings().markerProperty;
		await this.whileMarked(notePath, () =>
			this.app.fileManager.processFrontMatter(note, (frontmatter: Record<string, unknown>) => {
				delete frontmatter[marker];
			}));
		return "done";
	}

	private async convert(notePath: string, ownTargets: string[]): Promise<Outcome> {
		const note = this.app.vault.getFileByPath(notePath);
		// Gone: there is nothing left to convert.
		if (!note) return "done";
		await this.whileMarked(notePath, () => convertNote(this.app, note, this.getSettings().markerProperty, ownTargets));
		return "done";
	}

	private async delete(path: string): Promise<Outcome> {
		const file = this.app.vault.getFileByPath(path);
		// Already gone, for example because its folder was deleted with it.
		if (!file) return "done";
		await this.withMark(path, () => this.app.fileManager.trashFile(file));
		return "done";
	}

	private async wrap(pdfPath: string, quiet: boolean): Promise<Outcome> {
		const pdf = this.app.vault.getFileByPath(pdfPath);
		if (!pdf) return "stale";
		// Released once the wrap settles either way: if Templater created the note elsewhere and it was moved
		// into place, no create event used the mark, and it must not linger.
		const release = this.own.mark(siblingNotePath(pdf));
		try {
			await wrapPdf(this.app, this.getSettings(), this.saveSettings, pdf, { open: false });
		} catch (error) {
			// The PDF is wrapped; only a later step failed. Say so and carry on.
			if (quiet || !(error instanceof WrapIncomplete)) throw error;
			new Notice(error.message);
		} finally {
			release();
		}
		return "done";
	}

	/** Marks `path` as the plugin's own change for the duration of `change`, removing the mark if it fails. */
	private async withMark<T>(path: string, change: () => Promise<T>): Promise<T> {
		const release = this.own.mark(path);
		try {
			return await change();
		} catch (error) {
			release();
			throw error;
		}
	}

	/**
	 * Marks `path` as the plugin's own change while `change` runs, and removes the mark when it settles: an edit of a
	 * note's contents fires no create, rename or delete event that would use the mark up.
	 */
	private async whileMarked<T>(path: string, change: () => Promise<T>): Promise<T> {
		const release = this.own.mark(path);
		try {
			return await change();
		} finally {
			release();
		}
	}

	/** True when a file or folder other than `except` is at `path`, ignoring letter case as a case-insensitive file system would. */
	private isOccupied(path: string, except: TAbstractFile | null): boolean {
		const exact = this.app.vault.getAbstractFileByPath(path);
		if (exact && exact !== except) return true;
		const wanted = path.toLowerCase();
		return this.app.vault.getAllLoadedFiles().some((file) => file !== except && file.path.toLowerCase() === wanted);
	}

	private failureMessage(action: AnyAction, error: unknown): string {
		const why = reason(error);
		const marker = this.getSettings().markerProperty;
		switch (action.type) {
			case "rename":
				return `Could not rename ${action.from} to ${action.to}: ${why}`;
			case "copy":
				return `Could not copy ${action.from} to ${action.to}: ${why}`;
			case "setClaim":
				return `Could not update the "${marker}" property of ${action.notePath}: ${why}`;
			case "removeClaim":
				return `Could not remove the "${marker}" property from ${action.notePath}: ${why}`;
			case "removeMarker":
				return `Could not remove the "${marker}" property from ${action.notePath}: ${why}`;
			case "convert":
				return `Could not convert ${action.notePath}: ${why}`;
			case "delete":
				return `Could not delete ${action.path}: ${why}`;
			case "wrap":
				return error instanceof WrapMessage ? error.message : `Failed to wrap ${action.pdfPath}: ${why}`;
			case "notice":
				return `Could not show a message: ${why}`;
		}
	}
}
