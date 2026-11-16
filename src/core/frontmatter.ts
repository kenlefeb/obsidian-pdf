const BOM = "\uFEFF";

/** Where a frontmatter block sits in a text. */
export interface Frontmatter {
	/** Offset just after the opening fence line, including its line ending. */
	blockStart: number;
	/** Offset where the closing fence line starts. */
	blockEnd: number;
	/** Offset just after the closing fence line, including its line ending. */
	bodyStart: number;
}

function isFence(line: string): boolean {
	return (line.endsWith("\r") ? line.slice(0, -1) : line) === "---";
}

/**
 * The frontmatter block at the very start of `text`, or null when there is none. A block opens with a first line
 * that is exactly `---` and closes at the next line that is exactly `---` (a trailing CR is ignored). A BOM is not
 * skipped: strip it first.
 */
export function findFrontmatter(text: string): Frontmatter | null {
	const firstEnd = text.indexOf("\n");
	if (firstEnd < 0 || !isFence(text.slice(0, firstEnd))) return null;
	let pos = firstEnd + 1;
	while (pos <= text.length) {
		const next = text.indexOf("\n", pos);
		const lineEnd = next < 0 ? text.length : next;
		if (isFence(text.slice(pos, lineEnd))) {
			return { blockStart: firstEnd + 1, blockEnd: pos, bodyStart: next < 0 ? text.length : next + 1 };
		}
		if (next < 0) break;
		pos = next + 1;
	}
	return null;
}

/**
 * Offset where the note body starts: just after the closing `---` line of a frontmatter block, or 0 when there is none.
 * An optional BOM before the opening fence is skipped.
 */
export function bodyOffset(text: string): number {
	const start = text.startsWith(BOM) ? BOM.length : 0;
	const fm = findFrontmatter(text.slice(start));
	return fm === null ? 0 : start + fm.bodyStart;
}
