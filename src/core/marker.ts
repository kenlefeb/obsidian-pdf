import type { MarkedNote } from "./model.ts";
import { isInFolder, isPdf } from "./paths.ts";

// [[target]], [[target|alias]], [[target#subpath]] or [[target#subpath|alias]]
const LINK = /^\[\[([^[\]|#]+)(?:#[^[\]|]*)?(?:\|[^[\]]*)?\]\]$/;

/**
 * True when a marker property value marks its note: anything other than false, empty or null. The plugin writes
 * `true`; a link (the earlier format) still counts. A list counts when one of its entries does.
 */
export function isMarked(value: unknown): boolean {
	if (value === null || value === undefined || value === false) return false;
	if (typeof value === "string") {
		const text = value.trim().toLowerCase();
		return text !== "" && text !== "false";
	}
	if (Array.isArray(value)) return value.some(isMarked);
	return true;
}

/** The PDF link target in a marker value (the earlier format), without alias or #subpath, or null if it is not one. */
export function markerLinkTarget(value: unknown): string | null {
	const text: unknown = Array.isArray(value) ? (value.length === 1 ? (value[0] as unknown) : null) : value;
	if (typeof text !== "string") return null;
	const match = LINK.exec(text.trim());
	if (!match) return null;
	const target = match[1]!.trim();
	return isPdf(target) ? target : null;
}

/** True when the note still refers to its PDF by name: a link-valued marker, or a link to the PDF anywhere in it. */
export function selfLinked(note: MarkedNote): boolean {
	return note.markerLink !== null || note.ownTargets.length > 0;
}

/** What a marked note links to; compared to tell whether the note has changed since it was last read. */
export type OwnLinks = Pick<MarkedNote, "markerLink" | "linkedPdf" | "ownTargets">;

function sameSet(a: string[], b: string[]): boolean {
	const inA = new Set(a);
	const inB = new Set(b);
	return inA.size === inB.size && [...inA].every((entry) => inB.has(entry));
}

/** Own targets are compared as sets: the order they were read in never makes a difference. */
export function sameLinks(a: OwnLinks, b: OwnLinks): boolean {
	return a.markerLink === b.markerLink
		&& a.linkedPdf === b.linkedPdf
		&& sameSet(a.ownTargets, b.ownTargets);
}

/**
 * True when a note, as read now, differs from how the list last saw it: it became marked, stopped being marked, or
 * its marker link, the PDF that link resolves to, or its links to its own PDF changed. Null means not marked. Used to
 * skip refreshes for edits that touch none of these.
 */
export function markedChanged(listed: MarkedNote | null, current: MarkedNote | null): boolean {
	if (listed === null || current === null) return listed !== current;
	return !sameLinks(listed, current);
}

export interface TemplateLocations {
	/** The configured template file, with or without ".md". */
	templatePath: string;
	templaterFolder: string | null;
	coreTemplatesFolder: string | null;
}

function withoutMd(path: string): string {
	return path.toLowerCase().endsWith(".md") ? path.slice(0, -3) : path;
}

/**
 * True for the configured template file and for anything inside the Templater or core Templates folder. Templates are
 * not documents: pairing ignores them. A folder that is empty or "/" (the whole vault) is not a template folder.
 */
export function isTemplatePath(path: string, where: TemplateLocations): boolean {
	if (where.templatePath !== "" && withoutMd(path) === withoutMd(where.templatePath)) return true;
	return [where.templaterFolder, where.coreTemplatesFolder]
		.some((folder) => folder !== null && folder !== "" && folder !== "/" && isInFolder(path, folder));
}
