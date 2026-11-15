import type { App, TFile } from "obsidian";
import { formatClaim, parseClaim } from "../core/claims.ts";
import { rewriteEmbeds } from "../core/embeds.ts";
import { isNote, isPdf } from "../core/paths.ts";
import type { NoteClaim, Snapshot } from "../core/types.ts";

/**
 * The note's claim, read from the metadata cache. Null when the marker property is absent
 * (exact, case-sensitive key match) or does not hold a single link to a PDF.
 */
export function readClaim(app: App, note: TFile, markerProperty: string): NoteClaim | null {
	const frontmatter = app.metadataCache.getFileCache(note)?.frontmatter;
	if (!frontmatter || !Object.prototype.hasOwnProperty.call(frontmatter, markerProperty)) return null;
	const rawTarget = parseClaim(frontmatter[markerProperty]);
	if (rawTarget === null) return null;
	const pdfPath = app.metadataCache.getFirstLinkpathDest(rawTarget, note.path)?.path ?? null;
	return { notePath: note.path, rawTarget, pdfPath };
}

export function gatherSnapshot(app: App, markerProperty: string): Snapshot {
	const notePaths: string[] = [];
	const pdfPaths: string[] = [];
	const claims: NoteClaim[] = [];
	for (const file of app.vault.getFiles()) {
		if (isPdf(file.path)) {
			pdfPaths.push(file.path);
		} else if (isNote(file.path)) {
			notePaths.push(file.path);
			const claim = readClaim(app, file, markerProperty);
			if (claim) claims.push(claim);
		}
	}
	return { notePaths, pdfPaths, claims };
}

/**
 * Sets the marker property to the canonical claim for `pdfPath` (creating the frontmatter block if the note
 * has none), then points embeds of any of `oldTargets`, and template placeholders, at `pdfPath`.
 * The two writes run one after the other so they cannot overwrite each other.
 */
export async function writeClaim(
	app: App,
	note: TFile,
	markerProperty: string,
	pdfPath: string,
	oldTargets: string[],
): Promise<void> {
	await app.fileManager.processFrontMatter(note, (frontmatter: Record<string, unknown>) => {
		frontmatter[markerProperty] = formatClaim(pdfPath);
	});
	await app.vault.process(note, (text) => rewriteEmbeds(text, oldTargets, pdfPath));
}
