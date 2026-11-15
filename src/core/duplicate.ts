import { basename, dirname, filename, joinPath } from "./paths.ts";
import type { Snapshot } from "./types.ts";

/** The extension of the file's own name, case preserved, with the dot; empty when none. */
const ownExtension = (path: string): string => filename(path).slice(basename(path).length);

/**
 * Where the copies of a wrapped document go: `<base> n.md` and `<base> n.pdf` in the note's folder, for the
 * smallest n >= 1 at which both are free, so the two copies share one number. Each keeps its own extension
 * case. Names are compared ignoring letter case against every note and PDF in the snapshot.
 */
export function duplicatePaths(notePath: string, pdfPath: string, snapshot: Snapshot): { note: string; pdf: string } {
	const taken = new Set([...snapshot.notePaths, ...snapshot.pdfPaths].map((p) => p.toLowerCase()));
	const dir = dirname(notePath);
	const base = basename(notePath);
	for (let n = 1; ; n++) {
		const note = joinPath(dir, `${base} ${n}${ownExtension(notePath)}`);
		const pdf = joinPath(dir, `${base} ${n}${ownExtension(pdfPath)}`);
		if (!taken.has(note.toLowerCase()) && !taken.has(pdf.toLowerCase())) return { note, pdf };
	}
}

/** What a duplication did before it stopped. */
export interface DuplicateProgress {
	pdf: boolean;
	note: boolean;
	claim: boolean;
}

/** The Notice that explains files a stopped duplication created, or null when it created none or finished. */
export function leftoverMessage(done: DuplicateProgress, target: { note: string; pdf: string }, marker: string): string | null {
	if (!done.pdf || done.claim) return null;
	if (!done.note) return `Duplicating stopped part way. ${target.pdf} was created without a note. It is a plain PDF; you can wrap it or delete it.`;
	return `Duplicating stopped part way. ${target.note} and ${target.pdf} were created, but the note still points at the original PDF. Delete both, or set its "${marker}" property to the new PDF.`;
}
