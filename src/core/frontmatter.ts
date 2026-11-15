const BOM = "﻿";

function isFence(line: string): boolean {
	return (line.endsWith("\r") ? line.slice(0, -1) : line) === "---";
}

/**
 * Offset where the note body starts: just after the closing `---` line of a frontmatter block, or 0 when there is none.
 * A block opens with a first line (after an optional BOM) that is exactly `---` and closes at the next line that is exactly `---`.
 */
export function bodyOffset(text: string): number {
	const start = text.startsWith(BOM) ? BOM.length : 0;
	const firstEnd = text.indexOf("\n", start);
	if (firstEnd < 0 || !isFence(text.slice(start, firstEnd))) return 0;
	let pos = firstEnd + 1;
	while (pos <= text.length) {
		const next = text.indexOf("\n", pos);
		const lineEnd = next < 0 ? text.length : next;
		if (isFence(text.slice(pos, lineEnd))) return next < 0 ? text.length : next + 1;
		if (next < 0) break;
		pos = next + 1;
	}
	return 0;
}
