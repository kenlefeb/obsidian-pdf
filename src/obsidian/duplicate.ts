import { Notice, type App, type TFile } from "obsidian";
import { duplicatePaths } from "../core/duplicate.ts";
import { basename, filename, samePair } from "../core/paths.ts";
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
): Promise<void> {
	const pdf = healthyPdf(app, settings, note);
	if (!pdf) {
		new Notice(
			`Cannot duplicate ${note.name}: it is not a wrapped document. Its "${settings.markerProperty}" property must link to a PDF with the same name in the same folder.`,
		);
		return;
	}
	if (inFlight.has(note.path)) return;
	inFlight.add(note.path);
	try {
		const target = duplicatePaths(note.path, pdf.path, gatherSnapshot(app, settings.markerProperty));
		const oldTargets = [...new Set([pdf.path, filename(pdf.path), basename(pdf.path)])];
		let completed = false;
		try {
			completed = await executor.run([
				{ type: "copy", from: pdf.path, to: target.pdf },
				{ type: "copy", from: note.path, to: target.note },
				{ type: "setClaim", notePath: target.note, pdfPath: target.pdf, oldTargets },
			]);
		} catch (error) {
			console.error("PDF Wrapper: failed to duplicate", note.path, error);
		}
		if (!completed) {
			explainLeftovers(app, target);
			return;
		}
		const copy = app.vault.getFileByPath(target.note);
		if (copy) await app.workspace.getLeaf(false).openFile(copy);
	} finally {
		inFlight.delete(note.path);
	}
}

/** After a stopped duplication, names whichever copies exist, so the vault's state is explained. */
function explainLeftovers(app: App, target: { note: string; pdf: string }): void {
	const left = [target.pdf, target.note].filter((path) => app.vault.getFileByPath(path) !== null);
	if (left.length === 0) return;
	const noteLeft = left.includes(target.note);
	new Notice(
		`Duplicating stopped part way. Left behind: ${left.join(" and ")}.` +
			(noteLeft ? " The copied note may still point at the original PDF." : " It is a plain PDF; you can delete it."),
		10000,
	);
}
