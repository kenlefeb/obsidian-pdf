import { basename, filename } from "./paths.ts";

const WIKILINK = /\[\[([^\]\n]*)\]\]/g;

/**
 * True when `text` (a note's whole text, frontmatter included) links to or embeds the PDF at `pdfPath`: a wikilink or
 * embed (`[[…]]`) whose target is the PDF's path, its file name or its base name (Obsidian may resolve `[[A]]` to `A.pdf`
 * when no note `A` remains), or a markdown link whose target, URL-decoded, is the PDF's path or file name. Letter case is
 * ignored. A bare mention in prose is not a link. Errs towards "linked": it only ever keeps a PDF.
 */
export function textLinksToPdf(text: string, pdfPath: string): boolean {
	const path = pdfPath.toLowerCase();
	const name = filename(pdfPath).toLowerCase();
	const base = basename(pdfPath).toLowerCase();
	const matches = (target: string): boolean => {
		const t = target.trim().toLowerCase();
		if (t === "") return false;
		const own = filename(t);
		return t === path || own === name || own === base;
	};
	for (const [, inner = ""] of text.matchAll(WIKILINK)) {
		if (matches(wikilinkTarget(inner))) return true;
	}
	for (const inner of markdownLinkTargets(text)) {
		if (matches(markdownTarget(inner))) return true;
	}
	return false;
}

/** `folder/A.pdf#page=2|alias` → `folder/A.pdf`. A pipe escaped for a table (`\|`) ends the target too. */
function wikilinkTarget(inner: string): string {
	const target = inner.split("|")[0]?.split("#")[0] ?? "";
	return target.endsWith("\\") ? target.slice(0, -1) : target;
}

/**
 * The raw targets of the markdown links and embeds in `text`: what follows each `](` that has a `[` before it on the
 * same line (so link text may hold brackets), up to the matching `)` (parentheses inside the target may nest), or up
 * to `>` for the `<…>` form. A target is not followed past the end of its line.
 */
function markdownLinkTargets(text: string): string[] {
	const targets: string[] = [];
	let at = text.indexOf("](");
	while (at >= 0) {
		const lineStart = text.lastIndexOf("\n", at) + 1;
		const start = at + 2;
		if (text.slice(lineStart, at).includes("[")) {
			const end = targetEnd(text, start);
			if (end !== null) targets.push(text.slice(start, end));
		}
		at = text.indexOf("](", start);
	}
	return targets;
}

/** Where the target starting at `start` ends (the offset of its closing `)`), or null when it is not closed on its line. */
function targetEnd(text: string, start: number): number | null {
	let depth = 0;
	let angle = text[start] === "<";
	for (let i = angle ? start + 1 : start; i < text.length; i++) {
		const ch = text[i];
		if (ch === "\n") return null;
		if (angle) {
			if (ch === ">") angle = false;
			continue;
		}
		if (ch === "(") depth++;
		else if (ch === ")") {
			if (depth === 0) return i;
			depth--;
		}
	}
	return null;
}

/** `<folder/A B.pdf>`, `folder/A%20B.pdf#page=2 "title"` → `folder/A B.pdf`. */
function markdownTarget(inner: string): string {
	let target = inner.trim();
	if (target.startsWith("<")) {
		const end = target.indexOf(">");
		target = end < 0 ? target.slice(1) : target.slice(1, end);
	} else {
		target = target.split(/\s+/)[0] ?? "";
	}
	target = (target.split("#")[0] ?? "").replace(/^\.?\//, "");
	try {
		return decodeURIComponent(target);
	} catch {
		return target;
	}
}
