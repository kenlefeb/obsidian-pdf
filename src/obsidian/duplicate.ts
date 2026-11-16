import { Notice, TFile, type App } from "obsidian";
import { duplicatePaths, leftoverMessage, type DuplicateProgress } from "../core/duplicate.ts";
import type { FileAction } from "../core/model.ts";
import { findPdfBeside } from "../core/pairing.ts";
import { isNote, isPdf } from "../core/paths.ts";
import type { PdfWrapperSettings } from "../core/settings-data.ts";
import type { Executor } from "./execute.ts";
import { readMarked, templateLocations } from "./vault-snapshot.ts";

/** Notes being duplicated right now, so a second invocation for the same note is ignored. */
const inFlight = new Set<string>();

/** The PDF of the note's healthy pair (the note is marked and a PDF of its name is beside it), or null. */
export function healthyPdf(app: App, settings: PdfWrapperSettings, note: TFile): TFile | null {
	if (readMarked(app, note, settings.markerProperty, templateLocations(app, settings)) === null) return null;
	const beside = (note.parent?.children ?? []).filter((file): file is TFile => file instanceof TFile && isPdf(file.path));
	const pdfPath = findPdfBeside(note.path, beside.map((file) => file.path));
	return pdfPath === null ? null : app.vault.getFileByPath(pdfPath);
}

/**
 * Copies a wrapped document's note and PDF under a shared new number. Nothing else: the copies pair by name, so no
 * note is edited. The PDF is copied first: if the note copy then fails, what is left is a plain PDF, not a marked
 * note without one. The Executor reports failures itself; this only explains what was left behind.
 */
export async function duplicateWrapped(
	app: App,
	executor: Executor,
	settings: PdfWrapperSettings,
	note: TFile,
	onDone: () => void,
): Promise<void> {
	const pdf = healthyPdf(app, settings, note);
	if (!pdf) {
		new Notice(
			`Cannot duplicate ${note.name}: it is not a wrapped document. It needs the "${settings.markerProperty}" property and a PDF with the same name in the same folder.`,
		);
		return;
	}
	if (inFlight.has(note.path)) {
		new Notice(`${note.name} is already being duplicated.`);
		return;
	}
	inFlight.add(note.path);
	try {
		const paths = app.vault.getFiles().map((file) => file.path);
		const target = duplicatePaths(note.path, pdf.path, { notePaths: paths.filter(isNote), pdfPaths: paths.filter(isPdf) });
		const done: DuplicateProgress = { pdf: false, note: false };
		const steps: [keyof DuplicateProgress, FileAction][] = [
			["pdf", { type: "copy", from: pdf.path, to: target.pdf }],
			["note", { type: "copy", from: note.path, to: target.note }],
		];
		let stopped = false;
		// Deliberately not stopped when the plugin unloads: the note copy still runs, because a finished copy is safer
		// than a PDF left without its note.
		for (const [step, action] of steps) {
			try {
				if (!(await executor.run([action]))) {
					new Notice(`Could not duplicate ${note.name}: it changed while duplicating. Try again.`);
					stopped = true;
					break;
				}
				done[step] = true;
			} catch (error) {
				console.error("PDF Wrapper: failed to duplicate", note.path, error);
				stopped = true;
				break;
			}
		}
		if (stopped) {
			const message = leftoverMessage(done, target);
			if (message) new Notice(message, 10000);
			return;
		}
		const copy = app.vault.getFileByPath(target.note);
		if (copy) await app.workspace.getLeaf(false).openFile(copy);
	} finally {
		inFlight.delete(note.path);
		onDone();
	}
}
