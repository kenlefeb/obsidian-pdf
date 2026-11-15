import { filename, isPdf } from "./paths.ts";
import type { NoteClaim } from "./types.ts";

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

/**
 * True when a note's claim now differs from the one last listed for it: it appeared, disappeared, or its target or
 * the PDF that target resolves to changed. Null means the note has no claim. Used to skip refreshes for edits that do
 * not touch the claim.
 */
export function claimChanged(listed: NoteClaim | null, current: NoteClaim | null): boolean {
	if (listed === null || current === null) return listed !== current;
	return listed.rawTarget !== current.rawTarget || listed.pdfPath !== current.pdfPath;
}
