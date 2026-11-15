import type { Pair, Pairing, VaultSnapshot } from "./model.ts";
import { basename, dirname, isNote, isPdf, joinPath, samePair } from "./paths.ts";

/** The PDF in `pdfPaths` that pairs with the note: same folder and base name, any case of the extension. Its real path, or null. */
export function findPdfBeside(notePath: string, pdfPaths: string[]): string | null {
	return pdfPaths.find((pdf) => samePair(notePath, pdf)) ?? null;
}

/** The note in `notePaths` that pairs with the PDF: same folder and base name, any case of the extension. Its real path, or null. */
export function findNoteBeside(pdfPath: string, notePaths: string[]): string | null {
	return notePaths.find((note) => samePair(note, pdfPath)) ?? null;
}

/**
 * Pairs every marked note with the PDF of its name beside it. Nothing in the note names the PDF. Folder and base name
 * must match exactly (case-sensitive); the extension may be in any case, and the pair holds the PDF's real path, as
 * findPdfBeside would give it. A PDF is unwrapped when it is in no healthy pair and no marked note's link-valued
 * marker points to it.
 */
export function pairUp(snapshot: VaultSnapshot): Pairing {
	// Folder and base name -> the first such PDF, so each note is one lookup instead of a pass over every PDF.
	const pdfByName = new Map<string, string>();
	for (const pdf of snapshot.pdfPaths) {
		const name = nameKey(pdf);
		if (isPdf(pdf) && !pdfByName.has(name)) pdfByName.set(name, pdf);
	}
	const pairs: Pair[] = snapshot.marked.map((note) => {
		const pdfPath = isNote(note.notePath) ? pdfByName.get(nameKey(note.notePath)) ?? null : null;
		return pdfPath !== null
			? { note, pdfPath, state: "healthy" }
			: { note, pdfPath: null, state: "pdf-not-found" };
	});
	const taken = new Set<string>();
	for (const pair of pairs) {
		if (pair.pdfPath !== null) taken.add(pair.pdfPath);
		if (pair.note.linkedPdf !== null) taken.add(pair.note.linkedPdf);
	}
	return { pairs, unwrappedPdfs: snapshot.pdfPaths.filter((pdf) => !taken.has(pdf)) };
}

/** Folder and base name, case kept: equal for a note and a PDF exactly when samePair holds for them. */
function nameKey(path: string): string {
	return joinPath(dirname(path), basename(path));
}

export function healthyPairs(p: Pairing): { notePath: string; pdfPath: string }[] {
	const healthy: { notePath: string; pdfPath: string }[] = [];
	for (const pair of p.pairs) {
		if (pair.pdfPath !== null) healthy.push({ notePath: pair.note.notePath, pdfPath: pair.pdfPath });
	}
	return healthy;
}

export function pairOfNote(p: Pairing, notePath: string): Pair | null {
	return p.pairs.find((pair) => pair.note.notePath === notePath) ?? null;
}
