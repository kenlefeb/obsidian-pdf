import { BLOCK_TEXT, hasBlock } from "./block.ts";
import { findFrontmatter } from "./frontmatter.ts";
import { joinPath } from "./paths.ts";

export const DEFAULT_TEMPLATE_NAME = "Wrapped PDF.md";
export const DEFAULT_TEMPLATE_FOLDER = "Templates";

/** Frontmatter with the marker set, and the block the plugin shows the PDF in. */
export function defaultTemplate(markerProperty: string): string {
	return `---\n${markerProperty}: true\n---\n\n${BLOCK_TEXT}\n`;
}

function usableFolder(folder: string | null): string | null {
	if (folder === null) return null;
	const cleaned = folder.trim().replace(/^\/+|\/+$/g, "");
	return cleaned === "" ? null : cleaned;
}

export function defaultTemplatePath(folders: { templater: string | null; coreTemplates: string | null }): string {
	const folder = usableFolder(folders.templater) ?? usableFolder(folders.coreTemplates) ?? DEFAULT_TEMPLATE_FOLDER;
	return joinPath(folder, DEFAULT_TEMPLATE_NAME);
}

export function templatePathWithExtension(templatePath: string): string {
	return templatePath.toLowerCase().endsWith(".md") ? templatePath : `${templatePath}.md`;
}

export interface TemplateCheck {
	text: string;
	/** The parts that were missing and were inserted. */
	added: ("marker" | "block")[];
	/** The marker line was there, empty or holding the placeholder link of the earlier format, and now reads `true`. */
	markerSet: boolean;
	/** A placeholder embed of the PDF was replaced by the block. */
	replacedEmbed: boolean;
}

function stripCr(line: string): string {
	return line.endsWith("\r") ? line.slice(0, -1) : line;
}

function escapeRegExp(s: string): string {
	return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

// A marker value that is the placeholder link of the earlier format, quoted or not: [[{{title}}.pdf]] and its variants.
const PLACEHOLDER_LINK = /^(["']?)\[\[\s*\{\{(?:file|title)\}\}(?:\.pdf)?\s*\]\]\1$/i;

// ![[target]], ![[target#subpath]], ![[target|alias]]
const EMBED = /!\[\[([^\]|#]*)(?:#[^\]|]*)?(?:\|[^\]]*)?\]\]/g;

// An embed target whose file name (what follows the last "/") is the note's title and nothing else, as core Templates
// or Templater writes it, with or without ".pdf".
const TITLE_NAME = /(?:^|\/)(?:\{\{(?:file|title)\}\}|<%[-_]?\s*tp\.file\.title\s*[-_]?%>)(?:\.pdf)?$/i;

/**
 * True for an embed target that stands for the note's own PDF: its file name is the title placeholder, in any
 * folder. An embed of a fixed file, or of a name built from anything else (`{{date}}.pdf`), is not one.
 */
function isPlaceholderTarget(target: string): boolean {
	return TITLE_NAME.test(target.trim());
}

/**
 * The frontmatter block with its first marker line reading `<marker>: true`, when that line is empty or holds the
 * placeholder link; null when there is no marker line. A marker with any other value (a Templater expression, a real
 * link, `false`, a comment) comes back as it was, as does an empty one whose value follows on the next lines.
 */
function withMarkerSet(block: string, marker: string): { block: string; set: boolean } | null {
	const key = new RegExp(`^(["']?${escapeRegExp(marker)}["']?\\s*:)(.*)$`);
	const lines = block.split("\n");
	for (let i = 0; i < lines.length; i++) {
		const line = lines[i] ?? "";
		const match = key.exec(stripCr(line));
		if (!match) continue;
		const value = (match[2] ?? "").trim();
		const replace = value === "" ? !continuesBelow(lines, i) : PLACEHOLDER_LINK.test(value);
		if (!replace) return { block, set: false };
		lines[i] = `${match[1] ?? ""} true${line.endsWith("\r") ? "\r" : ""}`;
		return { block: lines.join("\n"), set: true };
	}
	return null;
}

/** True when the next line that is not blank or a comment is indented or a list entry: the value of the key above it. */
function continuesBelow(lines: string[], index: number): boolean {
	for (let i = index + 1; i < lines.length; i++) {
		const line = stripCr(lines[i] ?? "");
		if (line.trim() === "" || line.trimStart().startsWith("#")) continue;
		return /^(?:[ \t]|-(?:\s|$))/.test(line);
	}
	return false;
}

/**
 * The body with each placeholder embed of the PDF replaced by the block, on its own lines. Lines inside a fenced code
 * block are not touched.
 */
function replacePlaceholderEmbeds(body: string, eol: string): { text: string; replaced: boolean } {
	const block = BLOCK_TEXT.replace(/\n/g, eol);
	let fence: { char: string; length: number } | null = null;
	let replaced = false;
	const lines = body.split("\n").map((raw) => {
		const cr = raw.endsWith("\r") ? "\r" : "";
		const line = stripCr(raw);
		const run = /^ {0,3}(`{3,}|~{3,})(.*)$/.exec(line);
		if (fence !== null) {
			if (run && run[1]?.charAt(0) === fence.char && (run[1]?.length ?? 0) >= fence.length && (run[2] ?? "").trim() === "") {
				fence = null;
			}
			return raw;
		}
		if (run && !(run[1]?.charAt(0) === "`" && (run[2] ?? "").includes("`"))) {
			fence = { char: run[1]?.charAt(0) ?? "", length: run[1]?.length ?? 0 };
			return raw;
		}
		// The line cut at each placeholder embed: one more part than embeds.
		const parts: string[] = [];
		let from = 0;
		for (const match of line.matchAll(EMBED)) {
			if (!isPlaceholderTarget(match[1] ?? "")) continue;
			parts.push(line.slice(from, match.index));
			from = match.index + match[0].length;
		}
		if (parts.length === 0) return raw;
		parts.push(line.slice(from));
		replaced = true;
		const pieces: string[] = [];
		parts.forEach((part, index) => {
			if (index > 0) pieces.push(block);
			if (part.trim() !== "") pieces.push(part.trim());
		});
		return pieces.join(eol + eol) + cr;
	});
	return { text: replaced ? lines.join("\n") : body, replaced };
}

/**
 * Makes sure a template has the marker property and the `wrapped-pdf` block. Text-level only: it inserts a marker
 * line, sets a marker line that is empty or holds the placeholder link to `true`, replaces placeholder embeds of the
 * PDF by the block, and appends the block when there is none. Everything else stays byte-for-byte, because
 * templates may hold Templater code.
 */
export function ensureTemplateComponents(input: string, markerProperty: string): TemplateCheck {
	const bom = input.startsWith("\uFEFF") ? "\uFEFF" : "";
	const text = input.slice(bom.length);
	const added: ("marker" | "block")[] = [];
	const fm = findFrontmatter(text);
	const originalBody = fm ? text.slice(fm.bodyStart) : text;
	const eol = lineEnding(text);

	let head: string;
	let markerSet = false;
	if (fm === null) {
		head = `---${eol}${markerProperty}: true${eol}---${eol}${eol}`;
		added.push("marker");
	} else {
		const marked = withMarkerSet(text.slice(fm.blockStart, fm.blockEnd), markerProperty);
		if (marked === null) {
			head = text.slice(0, fm.blockStart) + `${markerProperty}: true${eol}` + text.slice(fm.blockStart, fm.bodyStart);
			added.push("marker");
		} else {
			head = text.slice(0, fm.blockStart) + marked.block + text.slice(fm.blockEnd, fm.bodyStart);
			markerSet = marked.set;
		}
	}

	const body = replacePlaceholderEmbeds(originalBody, eol);
	let result = head + body.text;
	if (!hasBlock(body.text)) {
		if (result !== "" && !result.endsWith("\n")) result += eol;
		if (originalBody !== "" && !/\n\r?\n$/.test(result)) result += eol;
		result += BLOCK_TEXT.replace(/\n/g, eol) + eol;
		added.push("block");
	}

	const changed = added.length > 0 || markerSet || body.replaced;
	return { text: changed ? bom + result : input, added, markerSet, replacedEmbed: body.replaced };
}

/** The first line ending in the text. With frontmatter, that is the opening fence's. */
function lineEnding(text: string): string {
	const firstEnd = text.indexOf("\n");
	return firstEnd > 0 && text[firstEnd - 1] === "\r" ? "\r\n" : "\n";
}
