import { Notice, type App, type TFile } from "obsidian";
import { duplicatePaths, leftoverMessage, type DuplicateProgress } from "../core/duplicate.ts";
import { basename, filename, samePair } from "../core/paths.ts";
import type { Action } from "../core/types.ts";
import type { PdfWrapperSettings } from "../core/settings-data.ts";
import type { Executor } from "./execute.ts";
import { gatherSnapshot, readClaim } from "./snapshot.ts";

/** Notes being duplicated right now, so a second invocation for the same note is ignored. */
const inFlight = new Set<string>();

/** The PDF of the note's healthy pair (claimed, existing, same folder and base name), or null. */
export function healthyPdf(app: App, settings: PdfWrapperSettings, note: TFile): TFile | null {
	const claim = readClaim(app, note, settings.markerProperty);
	if (!claim || claim.pdfPath === null || !samePair(note.path, claim.pdfPath)) return null;
	return app.vault.getFileByPath(claim.pdfPath);
}

/**
 * Copies a wrapped document's note and PDF under a shared new number and points the copy's marker at the
 * copied PDF. The PDF is copied first: if the note copy then fails, what is left is a plain PDF, not a note
 * claiming the original's PDF. The Executor reports failures itself; this only explains what was left behind.
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
			`Cannot duplicate ${note.name}: it is not a wrapped document. Its "${settings.markerProperty}" property must link to a PDF with the same name in the same folder.`,
		);
		return;
	}
	if (inFlight.has(note.path)) {
		new Notice(`${note.name} is already being duplicated.`);
		return;
	}
	inFlight.add(note.path);
	try {
		const target = duplicatePaths(note.path, pdf.path, gatherSnapshot(app, settings.markerProperty));
		const oldTargets = [...new Set([pdf.path, filename(pdf.path), basename(pdf.path)])];
		const done: DuplicateProgress = { pdf: false, note: false, claim: false };
		const steps: [keyof DuplicateProgress, Action][] = [
			["pdf", { type: "copy", from: pdf.path, to: target.pdf }],
			["note", { type: "copy", from: note.path, to: target.note }],
			["claim", { type: "setClaim", notePath: target.note, pdfPath: target.pdf, oldTargets }],
		];
		let stopped = false;
		// Deliberately not stopped when the plugin unloads: the remaining steps run, because a finished copy is safer
		// than a half-made one (a copied note still claiming the original's PDF). The Watcher does the same.
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
			const message = leftoverMessage(done, target, settings.markerProperty);
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
