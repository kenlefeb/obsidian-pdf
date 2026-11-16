import { getLinkpath, type App, type TFile } from "obsidian";
import { convertBody, convertProperties } from "../core/convert.ts";
import { isMarked, isTemplatePath, markerLinkTarget, type TemplateLocations } from "../core/marker.ts";
import type { MarkedNote, VaultSnapshot } from "../core/model.ts";
import { isNote, isPdf, samePair } from "../core/paths.ts";
import type { PdfWrapperSettings } from "../core/settings-data.ts";
import { getCoreTemplatesFolder, getTemplaterFolder } from "../pdf-wrapper.ts";

/** A folder setting as a vault path: no surrounding spaces or slashes. "/" (the whole vault) becomes "". */
function folderPath(folder: string | null): string | null {
	return folder === null ? null : folder.trim().replace(/^\/+|\/+$/g, "");
}

/** Where templates live: the configured template file, and the Templater and core Templates folders. */
export function templateLocations(app: App, settings: PdfWrapperSettings): TemplateLocations {
	return {
		templatePath: settings.templatePath.trim().replace(/^\/+/, ""),
		templaterFolder: folderPath(getTemplaterFolder(app)),
		coreTemplatesFolder: folderPath(getCoreTemplatesFolder(app)),
	};
}

/**
 * Every spelling the note uses, in its properties and its body, for a file `isOwn` accepts: the link targets in the
 * metadata cache's record of the note, each without its `#subpath`, otherwise as written, without repeats. Empty
 * while the note is not indexed.
 */
function linkedTargets(app: App, note: TFile, isOwn: (path: string) => boolean): string[] {
	const cache = app.metadataCache.getFileCache(note);
	const targets = new Set<string>();
	for (const reference of [...(cache?.links ?? []), ...(cache?.embeds ?? []), ...(cache?.frontmatterLinks ?? [])]) {
		const target = getLinkpath(reference.link).trim();
		if (target === "") continue;
		const destination = app.metadataCache.getFirstLinkpathDest(target, note.path);
		if (destination && isOwn(destination.path)) targets.add(target);
	}
	return [...targets];
}

/**
 * The note as a marked note, read from the metadata cache. Null when the marker property is absent (exact,
 * case-sensitive key match) or its value does not mark the note, and, when `templates` is given, for a template.
 */
export function readMarked(app: App, note: TFile, markerProperty: string, templates?: TemplateLocations): MarkedNote | null {
	if (templates && isTemplatePath(note.path, templates)) return null;
	const frontmatter = app.metadataCache.getFileCache(note)?.frontmatter;
	if (!frontmatter || !Object.prototype.hasOwnProperty.call(frontmatter, markerProperty)) return null;
	const value: unknown = frontmatter[markerProperty];
	if (!isMarked(value)) return null;
	const markerLink = markerLinkTarget(value);
	const linked = markerLink === null ? null : app.metadataCache.getFirstLinkpathDest(markerLink, note.path);
	const linkedPdf = linked && isPdf(linked.path) ? linked.path : null;
	const ownTargets = linkedTargets(app, note, (path) => samePair(note.path, path) || path === linkedPdf);
	if (markerLink !== null && linkedPdf !== null && !ownTargets.includes(markerLink)) ownTargets.push(markerLink);
	return { notePath: note.path, markerLink, linkedPdf, ownTargets };
}

/** The vault as the core sees it: every note, every PDF, and the marked notes that are not templates. */
export function gatherVault(app: App, settings: PdfWrapperSettings): VaultSnapshot {
	const templates = templateLocations(app, settings);
	const snapshot: VaultSnapshot = { notePaths: [], pdfPaths: [], marked: [] };
	for (const file of app.vault.getFiles()) {
		if (isPdf(file.path)) {
			snapshot.pdfPaths.push(file.path);
		} else if (isNote(file.path)) {
			snapshot.notePaths.push(file.path);
			const marked = readMarked(app, file, settings.markerProperty, templates);
			if (marked) snapshot.marked.push(marked);
		}
	}
	return snapshot;
}

/**
 * The spellings by which a note just made for `pdf` may link to it: the PDF's file name and its vault path, each only
 * if Obsidian resolves it from the note to this PDF and to no other file, plus whatever the metadata cache already
 * lists for the note. The note may not be indexed yet, so this does not depend on the cache.
 */
export function ownTargetsFor(app: App, note: TFile, pdf: TFile): string[] {
	const targets = [pdf.name, pdf.path]
		.filter((target) => app.metadataCache.getFirstLinkpathDest(target, note.path)?.path === pdf.path);
	return [...new Set([...targets, ...linkedTargets(app, note, (path) => path === pdf.path)])];
}

/**
 * Thrown by `convertNote` when the properties were written (the marker is `true`) but changing the body failed.
 * `cause` holds the underlying error.
 */
export class BodyConvertError extends Error {
	constructor(readonly cause: unknown) {
		super(cause instanceof Error ? cause.message : String(cause));
		this.name = "BodyConvertError";
	}
}

/**
 * Takes the links to the note's own PDF out of the note: the marker becomes `true` and the PDF is removed from every
 * other property (`convertProperties`, through `processFrontMatter`, which creates the frontmatter block if the note
 * has none); then, in the body, embeds of it become the block and plain links to it become text (`convertBody`). The
 * two writes run one after the other so they cannot overwrite each other. Returns what was changed, for the message.
 * A failure of the first write is thrown as it is (nothing written); a failure of the second as a `BodyConvertError`.
 */
export async function convertNote(
	app: App,
	note: TFile,
	markerProperty: string,
	ownTargets: string[],
): Promise<{ properties: string[]; embeds: number; links: number }> {
	let properties: string[] = [];
	await app.fileManager.processFrontMatter(note, (frontmatter: Record<string, unknown>) => {
		properties = convertProperties(frontmatter, markerProperty, ownTargets);
	});
	let embeds = 0;
	let links = 0;
	try {
		await app.vault.process(note, (text) => {
			const converted = convertBody(text, ownTargets);
			embeds = converted.embeds;
			links = converted.links;
			return converted.text;
		});
	} catch (e) {
		throw new BodyConvertError(e);
	}
	return { properties, embeds, links };
}
