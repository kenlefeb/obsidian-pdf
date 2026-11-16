import { basename, filename } from "./paths.ts";

/**
 * A markdown link target longer than this is not parsed (a bound on the work per link). Such a link still counts as
 * a link to the PDF when its line holds the PDF's file name, so the bound never leans towards deleting.
 */
const MAX_TARGET = 2048;

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
	for (const inner of wikilinkInners(text)) {
		if (matches(wikilinkTarget(inner))) return true;
	}
	const { targets, overlongLines } = markdownLinkTargets(text);
	for (const inner of targets) {
		if (matches(markdownTarget(inner))) return true;
	}
	if (overlongLines.length > 0) {
		const forms = nameForms(filename(pdfPath));
		for (const line of overlongLines) {
			const lower = line.toLowerCase();
			if (forms.some((form) => lower.includes(form))) return true;
		}
	}
	return false;
}

/** `folder/A.pdf#page=2|alias` → `folder/A.pdf`. A pipe escaped for a table (`\|`) ends the target too. */
function wikilinkTarget(inner: string): string {
	const target = inner.split("|")[0]?.split("#")[0] ?? "";
	return target.endsWith("\\") ? target.slice(0, -1) : target;
}

/** The PDF's file name, lower-cased, as written and percent-encoded. */
function nameForms(name: string): string[] {
	const forms = [name, encodeURI(name), encodeURIComponent(name)].map((form) => form.toLowerCase());
	return [...new Set(forms)];
}

/**
 * What is between `[[` and `]]` for each wikilink or embed in `text`: no `]` and no line break inside. Linear in the
 * length of the text: where the next `]` or line break is, is known for every position after one backward pass.
 */
function wikilinkInners(text: string): string[] {
	const n = text.length;
	const nextStop = new Int32Array(n + 1);
	nextStop[n] = n;
	for (let k = n - 1; k >= 0; k--) nextStop[k] = text[k] === "]" || text[k] === "\n" ? k : (nextStop[k + 1] ?? n);
	const inners: string[] = [];
	let i = 0;
	while (i < n - 1) {
		if (text[i] === "[" && text[i + 1] === "[") {
			const j = nextStop[i + 2] ?? n;
			if (text[j] === "]" && text[j + 1] === "]") {
				inners.push(text.slice(i + 2, j));
				i = j + 2;
				continue;
			}
		}
		i++;
	}
	return inners;
}

/**
 * The raw targets of the markdown links and embeds in `text`: what follows each `](` that has a `[` before it on the
 * same line (so link text may hold brackets), up to the `)` that closes the `(` (parentheses inside the target may
 * nest), or, for the `<…>` form, up to and including the `>`. A target is not followed past the end of its line. A
 * target longer than MAX_TARGET is not taken; its line is listed in `overlongLines` instead. Linear in the length of
 * the text: each line's parentheses are matched once.
 */
function markdownLinkTargets(text: string): { targets: string[]; overlongLines: string[] } {
	const targets: string[] = [];
	const overlongLines: string[] = [];
	let lineStart = 0;
	while (lineStart <= text.length) {
		const newline = text.indexOf("\n", lineStart);
		const lineEnd = newline < 0 ? text.length : newline;
		if (text.slice(lineStart, lineEnd).includes("](") && collectLineTargets(text, lineStart, lineEnd, targets)) {
			overlongLines.push(text.slice(lineStart, lineEnd));
		}
		lineStart = lineEnd + 1;
	}
	return { targets, overlongLines };
}

/** Adds the line's targets to `targets`. True when the line has a target longer than MAX_TARGET. */
function collectLineTargets(text: string, from: number, to: number, targets: string[]): boolean {
	const size = to - from;
	// For each "(" (by offset in the line), the offset of the ")" that closes it, or -1.
	const closeOf = new Int32Array(size).fill(-1);
	// For each offset, the offset of the next ">" at or after it in the line, or -1.
	const nextGt = new Int32Array(size + 1).fill(-1);
	const open: number[] = [];
	for (let k = 0; k < size; k++) {
		const ch = text[from + k];
		if (ch === "(") open.push(k);
		else if (ch === ")") {
			const o = open.pop();
			if (o !== undefined) closeOf[o] = k;
		}
	}
	for (let k = size - 1; k >= 0; k--) nextGt[k] = text[from + k] === ">" ? k : (nextGt[k + 1] ?? -1);
	let bracketSeen = false;
	let overlong = false;
	for (let k = 0; k < size - 1; k++) {
		const ch = text[from + k];
		if (ch === "[") {
			bracketSeen = true;
		} else if (ch === "]" && text[from + k + 1] === "(" && bracketSeen) {
			const start = k + 2;
			const end = text[from + start] === "<" ? (nextGt[start + 1] ?? -1) + 1 : (closeOf[k + 1] ?? -1);
			if (end <= 0) continue;
			if (end - start <= MAX_TARGET) targets.push(text.slice(from + start, from + end));
			else overlong = true;
		}
	}
	return overlong;
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
