import { bodyOffset } from "./frontmatter.ts";

const EMBED = /!\[\[([^\]|#]*)(#[^\]|]*)?(\|[^\]]*)?\]\]/g;
const PLACEHOLDER = /^\{\{(?:file|title)\}\}(?:\.pdf)?$/i;

/**
 * Rewrites embeds of any of `oldTargets` (vault paths or bare file names of the PDF as it was) to `pdfPath`,
 * plus the template placeholders ![[{{title}}.pdf]], ![[{{file}}.pdf]], ![[{{title}}]], ![[{{file}}]].
 * Targets match case-insensitively and ignore surrounding whitespace, as Obsidian's link resolution does.
 * Keeps any #subpath and |alias. Returns the input unchanged when nothing matches.
 */
export function rewriteEmbeds(content: string, oldTargets: string[], pdfPath: string): string {
	const targets = new Set(oldTargets.map((t) => t.trim().toLowerCase()));
	return content.replace(EMBED, (whole, target: string, subpath?: string, alias?: string) => {
		const name = target.trim();
		if (!targets.has(name.toLowerCase()) && !PLACEHOLDER.test(name)) return whole;
		return `![[${pdfPath}${subpath ?? ""}${alias ?? ""}]]`;
	});
}

/** `rewriteEmbeds` applied to the body only; the frontmatter block is kept byte for byte. */
export function rewriteBodyEmbeds(content: string, oldTargets: string[], pdfPath: string): string {
	const offset = bodyOffset(content);
	return content.slice(0, offset) + rewriteEmbeds(content.slice(offset), oldTargets, pdfPath);
}
