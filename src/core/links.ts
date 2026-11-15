import { basename, filename } from "./paths.ts";

const WIKILINK = /\[\[([^\]\n]*)\]\]/g;
const MARKDOWN_LINK = /\[[^\]\n]*\]\(([^)\n]*)\)/g;

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
	for (const [, inner = ""] of text.matchAll(MARKDOWN_LINK)) {
		if (matches(markdownTarget(inner))) return true;
	}
	return false;
}

/** `folder/A.pdf#page=2|alias` → `folder/A.pdf`. */
function wikilinkTarget(inner: string): string {
	return inner.split("|")[0]?.split("#")[0] ?? "";
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
