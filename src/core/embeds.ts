const EMBED = /!\[\[([^\]|#]*)(#[^\]|]*)?(\|[^\]]*)?\]\]/g;
const PLACEHOLDER = /^\{\{(?:file|title)\}\}(?:\.pdf)?$/i;

/**
 * Rewrites embeds of any of `oldTargets` (vault paths or bare file names of the PDF as it was) to `pdfPath`,
 * plus the template placeholders ![[{{title}}.pdf]], ![[{{file}}.pdf]], ![[{{title}}]], ![[{{file}}]].
 * Keeps any #subpath and |alias. Returns the input unchanged when nothing matches.
 */
export function rewriteEmbeds(content: string, oldTargets: string[], pdfPath: string): string {
	const targets = new Set(oldTargets);
	return content.replace(EMBED, (whole, target: string, subpath?: string, alias?: string) => {
		if (!targets.has(target) && !PLACEHOLDER.test(target)) return whole;
		return `![[${pdfPath}${subpath ?? ""}${alias ?? ""}]]`;
	});
}
