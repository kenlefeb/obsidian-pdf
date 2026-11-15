import type { Pair, Pairing, VaultSnapshot } from "./model.ts";
import { pdfBeside } from "./paths.ts";

/**
 * Pairs every marked note with the PDF of its name beside it (exact path, so case-sensitive). Nothing in the note
 * names the PDF. A PDF is unwrapped when it is in no healthy pair and no marked note's link-valued marker points to it.
 */
export function pairUp(snapshot: VaultSnapshot): Pairing {
	const pdfs = new Set(snapshot.pdfPaths);
	const pairs: Pair[] = snapshot.marked.map((note) => {
		const beside = pdfBeside(note.notePath);
		return pdfs.has(beside)
			? { note, pdfPath: beside, state: "healthy" }
			: { note, pdfPath: null, state: "pdf-not-found" };
	});
	const taken = new Set<string>();
	for (const pair of pairs) {
		if (pair.pdfPath !== null) taken.add(pair.pdfPath);
		if (pair.note.linkedPdf !== null) taken.add(pair.note.linkedPdf);
	}
	return { pairs, unwrappedPdfs: snapshot.pdfPaths.filter((pdf) => !taken.has(pdf)) };
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
