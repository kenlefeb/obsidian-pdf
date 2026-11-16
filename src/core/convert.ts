import { BLOCK_LANGUAGE, BLOCK_TEXT } from "./block.ts";
import { bodyOffset } from "./frontmatter.ts";
import { filename } from "./paths.ts";

const BOM = "\uFEFF";

/**
 * A markdown link target longer than this is not parsed, and the link is left as written (a bound on the work per
 * link, so text with many nested unclosed targets cannot take long).
 */
const MAX_TARGET = 2048;

/**
 * Mutates a parsed frontmatter object. Marker -> true. In every other property, a value that is a link to an own
 * target is set to null; in a list, such entries are removed and the rest kept in order. Returns the names of the
 * non-marker properties it changed.
 */
export function convertProperties(frontmatter: Record<string, unknown>, markerProperty: string, ownTargets: string[]): string[] {
	const own = new Set(ownTargets);
	const isOwnLink = (value: unknown): boolean => {
		if (typeof value !== "string") return false;
		const target = wholeLinkTarget(value);
		return target !== null && own.has(target);
	};
	const changed: string[] = [];
	for (const key of Object.keys(frontmatter)) {
		if (key === markerProperty) continue;
		const value = frontmatter[key];
		if (Array.isArray(value)) {
			const kept = (value as unknown[]).filter((entry) => !isOwnLink(entry));
			if (kept.length !== value.length) {
				frontmatter[key] = kept;
				changed.push(key);
			}
		} else if (isOwnLink(value)) {
			frontmatter[key] = null;
			changed.push(key);
		}
	}
	frontmatter[markerProperty] = true;
	return changed;
}

/**
 * Body only (frontmatter untouched). Each embed of an own target becomes BLOCK_TEXT on its own lines; each plain
 * link to one becomes its display text (alias, else the file name). A link is to an own target when its target, with
 * any `#subpath` and `|alias` removed and URL-decoded for markdown links, equals one of `ownTargets` exactly.
 * Fenced code blocks and inline code are not touched; line endings are preserved.
 *
 * Converting the result again changes nothing, with one accepted limit: display text that itself holds a link to an
 * own target (`[see [[A.pdf]]](A.pdf)`) is put back as written, so that inner link is only converted by a second pass.
 */
export function convertBody(text: string, ownTargets: string[]): { text: string; embeds: number; links: number } {
	const own = new Set(ownTargets);
	let offset = bodyOffset(text);
	// With no frontmatter a byte order mark is still in front of the first line; it is not part of that line.
	if (offset === 0 && text.startsWith(BOM)) offset = BOM.length;
	let out = text.slice(0, offset);
	let embeds = 0;
	let links = 0;
	let fence: { char: string; length: number } | null = null;
	// The line ending for a last line that has none: the previous line's, to begin with the first one in the text.
	const firstNewline = text.indexOf("\n");
	let lastEol = firstNewline > 0 && text[firstNewline - 1] === "\r" ? "\r\n" : "\n";
	let lineStart = offset;
	while (lineStart < text.length) {
		const newline = text.indexOf("\n", lineStart);
		const next = newline < 0 ? text.length : newline + 1;
		const eol = newline < 0 ? "" : text[newline - 1] === "\r" && newline > lineStart ? "\r\n" : "\n";
		const line = text.slice(lineStart, next - eol.length);
		if (eol !== "") lastEol = eol;
		lineStart = next;
		if (fence !== null) {
			if (closesFence(line, fence)) fence = null;
			out += line + eol;
			continue;
		}
		fence = openingFence(line);
		if (fence !== null) {
			out += line + eol;
			continue;
		}
		const scanned = scanLine(line, own);
		links += scanned.links;
		embeds += scanned.parts.length - 1;
		out += withBlocks(scanned.parts, lastEol) + eol;
	}
	return { text: out, embeds, links };
}

/** Sentence for the user after a wrap removed something the template put in; null when nothing was. */
export function convertedMessage(noteName: string, properties: string[], embeds: number, links: number): string | null {
	const done: string[] = [];
	if (properties.length > 0) {
		done.push(`the PDF was taken out of the ${properties.length === 1 ? "property" : "properties"} ${properties.join(", ")}`);
	}
	if (embeds > 0) done.push(`${embeds} ${embeds === 1 ? "embed" : "embeds"} of the PDF became the ${BLOCK_LANGUAGE} block`);
	if (links > 0) done.push(`${links} ${links === 1 ? "link" : "links"} to the PDF became plain text`);
	if (done.length === 0) return null;
	return `"${noteName}": the template linked the note to its PDF, which a wrapped note must not do. In the note, ${done.join("; ")}. Change the template so that it no longer links to the PDF.`;
}

/**
 * The link target of a property value that is one link and nothing else (`[[t]]`, `![[t]]`, `[x](t)`, `![x](t)`),
 * else null. A value with anything before or after the link is not one.
 */
function wholeLinkTarget(value: string): string | null {
	let v = value.trim();
	if (v.startsWith("!")) v = v.slice(1);
	if (v.startsWith("[[")) {
		// A wikilink: its first `]` begins the `]]` that ends the value, and no further `[` is inside.
		const close = v.indexOf("]");
		if (close !== v.length - 2 || v[close + 1] !== "]") return null;
		const inner = v.slice(2, close);
		return inner.includes("[") ? null : wikilinkParts(inner).target;
	}
	if (!v.startsWith("[") || !v.endsWith(")")) return null;
	// A markdown link: the first `[` closes right before the `(` that closes at the last character.
	const closeOf = matchClosers(v);
	const textEnd = closeOf[0] ?? -1;
	if (textEnd < 0 || v[textEnd + 1] !== "(" || closeOf[textEnd + 1] !== v.length - 1) return null;
	return markdownTarget(v.slice(textEnd + 2, -1));
}

/** `folder/A.pdf#page=2|alias` → target `folder/A.pdf`, alias `alias`. A pipe escaped for a table (`\|`) ends the target too. */
function wikilinkParts(inner: string): { target: string; alias: string } {
	const pipe = inner.indexOf("|");
	let target = pipe < 0 ? inner : inner.slice(0, pipe);
	if (target.endsWith("\\")) target = target.slice(0, -1);
	const hash = target.indexOf("#");
	if (hash >= 0) target = target.slice(0, hash);
	return { target: target.trim(), alias: pipe < 0 ? "" : inner.slice(pipe + 1).trim() };
}

// What may follow a markdown link's target inside the parentheses: nothing, or a title.
const AFTER_TARGET = /^(?:\s+(?:"[^"]*"|'[^']*'|\([^()]*\)))?$/;

/**
 * `<folder/A B.pdf>`, `folder/A%20B.pdf#page=2 "title"` → `folder/A B.pdf`. Null when the target is followed by
 * anything other than a title, or the `>` of the `<…>` form is missing: that is not a link.
 */
function markdownTarget(inner: string): string | null {
	const trimmed = inner.trim();
	const angled = trimmed.startsWith("<");
	const end = angled ? trimmed.indexOf(">") : trimmed.search(/\s|$/);
	if (end < 0 || !AFTER_TARGET.test(trimmed.slice(angled ? end + 1 : end))) return null;
	let target = trimmed.slice(angled ? 1 : 0, end);
	const hash = target.indexOf("#");
	if (hash >= 0) target = target.slice(0, hash);
	try {
		return decodeURIComponent(target);
	} catch {
		return target;
	}
}

/** The fence a line opens: three or more backticks or tildes, indented at most three spaces. */
function openingFence(line: string): { char: string; length: number } | null {
	const match = /^ {0,3}(`{3,}|~{3,})(.*)$/.exec(line);
	const run = match?.[1];
	if (run === undefined) return null;
	const char = run.charAt(0);
	// The info string of a backtick fence cannot hold a backtick; such a line is inline code.
	if (char === "`" && (match?.[2] ?? "").includes("`")) return null;
	return { char, length: run.length };
}

function closesFence(line: string, fence: { char: string; length: number }): boolean {
	const run = /^ {0,3}(`{3,}|~{3,})[ \t]*$/.exec(line)?.[1];
	return run !== undefined && run.charAt(0) === fence.char && run.length >= fence.length;
}

/**
 * One line outside a fenced code block. `parts` is the line cut at each embed of an own target (one more part than
 * embeds), with each plain link to an own target already replaced by its display text. Inline code and escaped
 * characters are copied as written. A wikilink to anything else is copied whole, so what follows it is never read
 * as the target of a markdown link (`[[B.pdf]](A.pdf)` stays as written).
 */
function scanLine(line: string, own: Set<string>): { parts: string[]; links: number } {
	if (!line.includes("[")) return { parts: [line], links: 0 };
	const n = line.length;
	const closeOf = line.includes("](") ? matchClosers(line) : null;
	const parts: string[] = [];
	const unclosedCode = new Set<number>();
	// The first `]` at or after the last place looked from (-2 before any look, -1 when there is none), and the last
	// `[` before it: a wikilink's `[[` is the last `[` before its `]]`.
	let nextBracket = -2;
	let lastOpen = -1;
	let buffer = "";
	let links = 0;
	let i = 0;
	while (i < n) {
		const ch = line[i];
		if (ch === "\\") {
			buffer += line.slice(i, i + 2);
			i += 2;
			continue;
		}
		if (ch === "`") {
			let runEnd = i;
			while (line[runEnd] === "`") runEnd++;
			const length = runEnd - i;
			const end = unclosedCode.has(length) ? -1 : codeSpanEnd(line, runEnd, length);
			if (end < 0) unclosedCode.add(length);
			const stop = end < 0 ? runEnd : end;
			buffer += line.slice(i, stop);
			i = stop;
			continue;
		}
		const embed = ch === "!" && line[i + 1] === "[";
		const open = embed ? i + 1 : i;
		if (line[open] !== "[") {
			buffer += ch;
			i++;
			continue;
		}
		let end = -1;
		let display = "";
		if (line[open + 1] === "[") {
			// Wikilink: no `]` between `[[` and `]]`.
			if (nextBracket !== -1 && nextBracket < open + 2) {
				nextBracket = line.indexOf("]", open + 2);
				lastOpen = nextBracket < 0 ? -1 : line.lastIndexOf("[", nextBracket);
			}
			if (nextBracket >= 0 && line[nextBracket + 1] === "]" && lastOpen === open + 1) {
				const { target, alias } = wikilinkParts(line.slice(open + 2, nextBracket));
				if (!own.has(target)) {
					buffer += line.slice(i, nextBracket + 2);
					i = nextBracket + 2;
					continue;
				}
				end = nextBracket + 2;
				display = alias !== "" ? alias : filename(target);
			}
		}
		if (end < 0 && closeOf !== null) {
			// Markdown link: `[text](target)`, the text's brackets and the target's parentheses balanced.
			const textEnd = closeOf[open] ?? -1;
			const targetEnd = textEnd >= 0 && line[textEnd + 1] === "(" ? (closeOf[textEnd + 1] ?? -1) : -1;
			if (targetEnd >= 0 && targetEnd - textEnd - 2 <= MAX_TARGET) {
				const target = markdownTarget(line.slice(textEnd + 2, targetEnd));
				if (target !== null && own.has(target)) {
					end = targetEnd + 1;
					const text = line.slice(open + 1, textEnd).trim();
					display = text !== "" ? text : filename(target);
				}
			}
		}
		if (end < 0) {
			buffer += ch;
			i++;
		} else if (embed) {
			parts.push(buffer);
			buffer = "";
			i = end;
		} else {
			buffer += display;
			links++;
			i = end;
		}
	}
	parts.push(buffer);
	return { parts, links };
}

/** Where the code span opened by a run of `length` backticks ending at `from` ends (after its closing run), or -1. */
function codeSpanEnd(line: string, from: number, length: number): number {
	let j = line.indexOf("`", from);
	while (j >= 0) {
		let runEnd = j;
		while (line[runEnd] === "`") runEnd++;
		if (runEnd - j === length) return runEnd;
		j = line.indexOf("`", runEnd);
	}
	return -1;
}

/** For each unescaped `[` and `(` in the line, the position of the `]` or `)` that closes it, else -1. */
function matchClosers(line: string): Int32Array {
	const closeOf = new Int32Array(line.length).fill(-1);
	const brackets: number[] = [];
	const parens: number[] = [];
	for (let k = 0; k < line.length; k++) {
		const ch = line[k];
		if (ch === "\\") k++;
		else if (ch === "[") brackets.push(k);
		else if (ch === "(") parens.push(k);
		else if (ch === "]" || ch === ")") {
			const o = (ch === "]" ? brackets : parens).pop();
			if (o !== undefined) closeOf[o] = k;
		}
	}
	return closeOf;
}

/** Joins a line's parts with the block between them, the block on its own lines with a blank line to any text beside it. */
function withBlocks(parts: string[], eol: string): string {
	if (parts.length === 1) return parts[0] ?? "";
	const block = BLOCK_TEXT.replace(/\n/g, eol);
	const pieces: string[] = [];
	parts.forEach((part, index) => {
		if (index > 0) pieces.push(block);
		const text = index === 0 ? part.trimEnd() : index === parts.length - 1 ? part.trimStart() : part.trim();
		if (text.trim() !== "") pieces.push(text);
	});
	return pieces.join(eol + eol);
}
