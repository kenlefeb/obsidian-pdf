import { filename, isPdf } from "./paths.ts";

// [[target]], [[target|alias]], [[target#subpath]] or [[target#subpath|alias]]
const LINK = /^\[\[([^[\]|#]+)(?:#[^[\]|]*)?(?:\|[^[\]]*)?\]\]$/;

/** The PDF link target in a marker value, without alias or #subpath, or null if it is not a claim. */
export function parseClaim(value: unknown): string | null {
	const text: unknown = Array.isArray(value) ? (value.length === 1 ? (value[0] as unknown) : null) : value;
	if (typeof text !== "string") return null;
	const match = LINK.exec(text.trim());
	if (!match) return null;
	const target = match[1]!.trim();
	return isPdf(target) ? target : null;
}

export function formatClaim(pdfPath: string): string {
	return `[[${pdfPath}|${filename(pdfPath)}]]`;
}

/** False when the path holds characters that cannot appear in a wikilink target, so a claim could not round-trip. */
export function isLinkSafeName(path: string): boolean {
	return !/[[\]|#^]/.test(path);
}
