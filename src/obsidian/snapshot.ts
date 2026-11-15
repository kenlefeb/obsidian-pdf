import type { App, TFile } from "obsidian";
import { formatClaim, parseClaim } from "../core/claims.ts";
import { rewriteBodyEmbeds } from "../core/embeds.ts";
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
 * Thrown by `writeClaim` when the claim was written but rewriting the body's PDF embeds failed:
 * the note does carry the claim. `cause` holds the underlying error.
 */
export class EmbedUpdateError extends Error {
	constructor(readonly cause: unknown) {
		super(cause instanceof Error ? cause.message : String(cause));
		this.name = "EmbedUpdateError";
	}
}

/**
 * Sets the marker property to the canonical claim for `pdfPath` (creating the frontmatter block if the note
 * has none), then points embeds of any of `oldTargets`, and template placeholders, in the note body at `pdfPath`.
 * The frontmatter is left as `processFrontMatter` wrote it. The two writes run one after the other so they
 * cannot overwrite each other. A failure of the first write is thrown as is (no claim written); a failure of
 * the second is thrown as an `EmbedUpdateError` (claim written).
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
	try {
		await app.vault.process(note, (text) => rewriteBodyEmbeds(text, oldTargets, pdfPath));
	} catch (e) {
		throw new EmbedUpdateError(e);
	}
}
