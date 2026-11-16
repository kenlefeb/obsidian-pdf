import { findPdfBeside } from "./pairing.ts";
import { basename } from "./paths.ts";

/** The code block language the plugin renders the PDF beside the note in place of. Fixed; not the marker setting. */
export const BLOCK_LANGUAGE = "wrapped-pdf";

export const BLOCK_TEXT = "```wrapped-pdf\n```";

// An opening fence (three or more backticks or tildes, indented at most three spaces) whose info string is exactly
// the block language.
const FENCE = /^ {0,3}(?:`{3,}|~{3,})[ \t]*wrapped-pdf[ \t]*\r?$/m;

/** True when the text has a fenced code block with the language `wrapped-pdf`. */
export function hasBlock(text: string): boolean {
	return FENCE.test(text);
}

/** What the block shows when no PDF with the note's name is beside it. */
export function noPdfMessage(notePath: string): string {
	return `No PDF named ${basename(notePath)}.pdf beside this note.`;
}

/** What the block draws: the PDF beside the note, or the message saying there is none. */
export type BlockView = { pdfPath: string } | { pdfPath: null; message: string };

/** What the block in the note shows, given the paths in the note's folder (others are ignored). */
export function blockView(notePath: string, pathsInFolder: string[]): BlockView {
	const pdfPath = findPdfBeside(notePath, pathsInFolder);
	return pdfPath !== null ? { pdfPath } : { pdfPath: null, message: noPdfMessage(notePath) };
}

/** True when drawing `b` would look the same as `a`, so the block is left as it is. */
export function sameBlockView(a: BlockView, b: BlockView): boolean {
	if (a.pdfPath !== null || b.pdfPath !== null) return a.pdfPath === b.pdfPath;
	return a.message === b.message;
}
