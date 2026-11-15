import { basename, dirname, filename, findPathIgnoringCase, isNote, joinPath } from "./paths.ts";
import type { AttentionItem, Classification, FixId } from "./types.ts";

/** A folder for display: the vault root shows as "/". */
function folderLabel(path: string): string {
	return dirname(path) || "/";
}

/** The plain-language state shown under an entry of the Needs attention list. */
export function stateLine(item: AttentionItem, c: Classification): string {
	switch (item.kind) {
		case "missing":
			return "PDF not found. It may not have downloaded yet.";
		case "misnamed":
			return `PDF has a different name: ${filename(item.pdfPath ?? "")}`;
		case "displaced":
			return `PDF is in another folder: ${folderLabel(item.pdfPath ?? "")}`;
		case "extra-claim":
			return "Points at another document's PDF";
		case "contested": {
			const others = c.pairs.filter((p) => p.pdfPath === item.pdfPath && p.notePath !== item.notePath).length;
			return `Shares a PDF with ${others} other ${others === 1 ? "note" : "notes"}`;
		}
		case "note-removed":
			return "Its note was removed outside Obsidian";
		case "unwrapped":
			return "Not wrapped";
	}
}

/** The file an entry is about: its note when it has one, else its PDF. */
export function rowFile(item: AttentionItem): { name: string; folder: string } {
	const path = item.notePath ?? item.pdfPath ?? "";
	return { name: filename(path), folder: folderLabel(path) };
}

const FIX_LABELS: Record<FixId, string> = {
	"rename-pdf-to-note": "Rename PDF to match",
	"rename-note-to-pdf": "Rename note to match",
	"move-pdf-to-note": "Move PDF beside note",
	"copy-pdf-for-note": "Copy the PDF",
	"choose-pdf": "Choose a PDF",
	"remove-claim": "Remove the claim",
	"delete-pdf": "Delete the PDF",
	"wrap": "Wrap",
	"keep-plain": "Keep as a plain PDF",
};

export function fixLabel(fix: FixId): string {
	return FIX_LABELS[fix];
}

/**
 * The PDFs whose note was removed outside Obsidian that are still worth asking about: the saved list plus
 * `added`, in that order, without duplicates, keeping only PDFs that are still unwrapped.
 */
export function nextPendingRemoved(saved: string[], added: string[], unwrappedPdfs: string[]): string[] {
	const unwrapped = new Set(unwrappedPdfs);
	return [...new Set([...saved, ...added])].filter((p) => unwrapped.has(p));
}

/** The notice after "Fix all" or "Wrap all". */
export function bulkResultMessage(kind: "fix" | "wrap", done: number, stopped: boolean): string {
	const noun = kind === "fix" ? (done === 1 ? "document" : "documents") : (done === 1 ? "PDF" : "PDFs");
	if (stopped) return `Stopped after ${kind === "fix" ? "fixing" : "wrapping"} ${done} ${noun}.`;
	return `${kind === "fix" ? "Fixed" : "Wrapped"} ${done} ${noun}.`;
}

/** The startup notice when the list is not empty. */
export function attentionNotice(count: number): string {
	return count === 1 ? "1 wrapped document needs attention" : `${count} wrapped documents need attention`;
}

/**
 * The note in `notePaths` that would pair with `pdfPath` (same folder, same base name, ignoring letter case as a
 * case-insensitive file system would), or null. Meant for the vault's file list, which does not lag as the
 * metadata cache can.
 */
export function noteBesidePdf(pdfPath: string, notePaths: string[]): string | null {
	const wanted = joinPath(dirname(pdfPath), `${basename(pdfPath)}.md`);
	return findPathIgnoringCase(notePaths.filter(isNote), wanted);
}

/** Why "Delete the PDF" was refused: a note that would pair with it exists. */
export function noteBesidePdfMessage(notePath: string): string {
	return `A note named ${filename(notePath)} now exists beside this PDF. Check the list again.`;
}
