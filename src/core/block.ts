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
