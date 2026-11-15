import { joinPath } from "./paths.ts";

export const DEFAULT_TEMPLATE_NAME = "Wrapped PDF.md";
export const DEFAULT_TEMPLATE_FOLDER = "Templates";
export const EMBED_LINE = "![[{{title}}.pdf]]";

export function defaultTemplate(markerProperty: string): string {
	return `---\n${markerProperty}:\n---\n\n${EMBED_LINE}\n`;
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
	added: ("marker" | "embed")[];
}

interface Frontmatter {
	/** Offset just after the opening fence line, including its line ending. */
	blockStart: number;
	/** Offset where the closing fence line starts. */
	blockEnd: number;
	/** Offset just after the closing fence line, including its line ending. */
	bodyStart: number;
}

function stripCr(line: string): string {
	return line.endsWith("\r") ? line.slice(0, -1) : line;
}

function findFrontmatter(text: string): Frontmatter | null {
	const firstEnd = text.indexOf("\n");
	if (firstEnd < 0 || stripCr(text.slice(0, firstEnd)) !== "---") return null;
	let pos = firstEnd + 1;
	while (pos <= text.length) {
		const next = text.indexOf("\n", pos);
		const lineEnd = next < 0 ? text.length : next;
		if (stripCr(text.slice(pos, lineEnd)) === "---") {
			return { blockStart: firstEnd + 1, blockEnd: pos, bodyStart: next < 0 ? text.length : next + 1 };
		}
		if (next < 0) break;
		pos = next + 1;
	}
	return null;
}

function escapeRegExp(s: string): string {
	return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function hasMarker(block: string, marker: string): boolean {
	const re = new RegExp(`^${escapeRegExp(marker)}\\s*:`);
	return block.split("\n").some((line) => re.test(stripCr(line)));
}

function hasEmbed(body: string): boolean {
	for (const m of body.matchAll(/!\[\[(.*?)\]\]/g)) {
		const target = (m[1] ?? "").split(/[|#]/)[0] ?? "";
		if (/\.pdf\s*$/i.test(target) || target.includes("{{") || target.includes("<%")) return true;
	}
	return false;
}

/**
 * Makes sure a template has the marker property and a PDF embed. Only inserts text;
 * everything else stays byte-for-byte, because templates may hold Templater code.
 */
export function ensureTemplateComponents(text: string, markerProperty: string): TemplateCheck {
	const eol = text.includes("\r\n") ? "\r\n" : "\n";
	const added: ("marker" | "embed")[] = [];
	const fm = findFrontmatter(text);
	const originalBody = fm ? text.slice(fm.bodyStart) : text;

	let result = text;
	if (fm === null) {
		result = `---${eol}${markerProperty}:${eol}---${eol}${eol}${text}`;
		added.push("marker");
	} else if (!hasMarker(text.slice(fm.blockStart, fm.blockEnd), markerProperty)) {
		result = text.slice(0, fm.blockStart) + `${markerProperty}:${eol}` + text.slice(fm.blockStart);
		added.push("marker");
	}

	if (!hasEmbed(originalBody)) {
		if (originalBody !== "" && !result.endsWith(eol + eol)) {
			result += result.endsWith(eol) ? eol : eol + eol;
		}
		result += EMBED_LINE + eol;
		added.push("embed");
	}

	return { text: added.length === 0 ? text : result, added };
}
