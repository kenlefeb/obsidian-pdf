import type { ListItem, ListKind, Pairing, RepairId } from "./model.ts";
import { pairOfNote } from "./pairing.ts";
import { dirname, filename } from "./paths.ts";

/** A folder for display: the vault root shows as "/". */
function folderLabel(path: string): string {
	return dirname(path) || "/";
}

const ENTRY_NAMES: Record<ListKind, string> = {
	"pdf-not-found": "PDF not found",
	"links-own-pdf": "Links to its own PDF",
	"note-removed": "Its note was deleted; the PDF was kept",
	"unwrapped": "Not wrapped",
};

/**
 * The plain-language state shown under an entry of the Needs attention list. A note that links to its own PDF and
 * has none beside it also says where the linked PDF is, since Convert will move it (and Convert all leaves it out).
 */
export function stateLine(item: ListItem, pairing: Pairing): string {
	const name = ENTRY_NAMES[item.kind];
	if (item.kind !== "links-own-pdf" || item.notePath === null) return name;
	const pair = pairOfNote(pairing, item.notePath);
	if (pair === null || pair.pdfPath !== null) return name;
	return pair.note.linkedPdf === null ? `${name}, which was not found` : `${name}, which is at ${pair.note.linkedPdf}`;
}

/** The file an entry is about: its note when it has one, else its PDF. */
export function rowFile(item: ListItem): { name: string; folder: string } {
	const path = item.notePath ?? item.pdfPath ?? "";
	return { name: filename(path), folder: folderLabel(path) };
}

const REPAIR_LABELS: Record<RepairId, string> = {
	"use-pdf": "Use a PDF",
	"rename-note-to-pdf": "Rename note to match",
	"copy-pdf": "Copy another document's PDF",
	"remove-marker": "Remove the marker",
	"convert": "Convert",
	"delete-pdf": "Delete the PDF",
	"wrap": "Wrap",
	"keep-plain": "Keep as a plain PDF",
};

export function repairLabel(repair: RepairId): string {
	return REPAIR_LABELS[repair];
}

/**
 * The PDFs kept after their note was deleted (removed outside Obsidian, deleted in Obsidian with following deletes
 * off, or deleted while other notes still link to the PDF) that are still worth asking about: the saved list plus
 * `added`, in that order, without duplicates, keeping only PDFs that are still unwrapped.
 */
export function nextPendingRemoved(saved: string[], added: string[], unwrappedPdfs: string[]): string[] {
	const unwrapped = new Set(unwrappedPdfs);
	return [...new Set([...saved, ...added])].filter((p) => unwrapped.has(p));
}

/** The notice after "Convert all" or "Wrap all". */
export function bulkResultMessage(kind: "convert" | "wrap", done: number, stopped: boolean): string {
	const noun = kind === "convert" ? (done === 1 ? "document" : "documents") : (done === 1 ? "PDF" : "PDFs");
	if (stopped) return `Stopped after ${kind === "convert" ? "converting" : "wrapping"} ${done} ${noun}.`;
	return `${kind === "convert" ? "Converted" : "Wrapped"} ${done} ${noun}.`;
}

/** The startup notice when the list is not empty. */
export function listNotice(count: number): string {
	return count === 1 ? "1 document needs attention" : `${count} documents need attention`;
}

/** Why "Delete the PDF" was refused: a note that would pair with it exists. */
export function noteBesidePdfMessage(notePath: string): string {
	return `A note named ${filename(notePath)} now exists beside this PDF. Check the list again.`;
}
