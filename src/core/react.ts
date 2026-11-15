import { basename, dirname, filename, isInFolder, isNote, isPdf, joinPath, pairKey, samePair } from "./paths.ts";
import type { Action, NoteClaim, Reaction, Snapshot, VaultEvent } from "./types.ts";

const nothing = (recheck = false, pendingRemoved: string | null = null): Reaction => ({ actions: [], recheck, pendingRemoved });

/** The extension of the file's own name, case preserved, without the dot. */
function ownExtension(path: string): string {
	const name = filename(path);
	return name.slice(name.lastIndexOf(".") + 1);
}

/** Where the partner of `anchor` must live to pair with it, keeping the partner's own extension case. */
function partnerDestination(anchor: string, partner: string): string {
	return joinPath(dirname(anchor), `${basename(anchor)}.${ownExtension(partner)}`);
}

/** Free means in neither list ignoring letter case; the partner's own current path does not count against itself. */
function isFree(path: string, partner: string, snapshot: Snapshot): boolean {
	const wanted = path.toLowerCase();
	return ![...snapshot.pdfPaths, ...snapshot.notePaths].some((p) => p !== partner && p.toLowerCase() === wanted);
}

/**
 * Renames `partner` so it pairs with `anchor` (which has just been renamed or moved) and records the new claim.
 * `oldPdfPath` is the path the claim's links used to point at.
 */
function followRename(
	anchor: string,
	partner: string,
	oldPdfPath: string,
	local: boolean,
	snapshot: Snapshot,
	claimOf: (partnerNewPath: string) => { notePath: string; pdfPath: string },
): Reaction {
	if (!local) return nothing(true);
	const to = partnerDestination(anchor, partner);
	if (!isFree(to, partner, snapshot)) {
		return {
			actions: [{ type: "notice", message: `Could not rename ${partner} to match ${anchor}: a file with that name already exists.` }],
			recheck: true,
			pendingRemoved: null,
		};
	}
	const { notePath, pdfPath } = claimOf(to);
	const actions: Action[] = [
		{ type: "rename", from: partner, to },
		{ type: "setClaim", notePath, pdfPath, oldTargets: [oldPdfPath, filename(oldPdfPath), basename(oldPdfPath)] },
	];
	return { actions, recheck: false, pendingRemoved: null };
}

function reactToNoteRename(path: string, oldPath: string, local: boolean, snapshot: Snapshot): Reaction {
	const claim = snapshot.claims.find((c) => c.notePath === path);
	if (!claim) return nothing();
	if (claim.pdfPath !== null && samePair(path, claim.pdfPath)) {
		if (!local) return nothing(true);
		return { actions: [{ type: "setClaim", notePath: path, pdfPath: claim.pdfPath, oldTargets: [] }], recheck: false, pendingRemoved: null };
	}
	if (claim.pdfPath !== null && samePair(oldPath, claim.pdfPath)) {
		const pdf = claim.pdfPath;
		const ownedByAnother = snapshot.claims.some((c) => c.notePath !== path && c.pdfPath === pdf && samePair(c.notePath, pdf));
		if (ownedByAnother) return nothing(true);
		return followRename(path, pdf, pdf, local, snapshot, (to) => ({ notePath: path, pdfPath: to }));
	}
	return nothing(true);
}

function findNoteOfRenamedPdf(path: string, oldPath: string, snapshot: Snapshot): NoteClaim | null {
	for (const notePath of snapshot.notePaths) {
		if (!samePair(notePath, oldPath)) continue;
		const claim = snapshot.claims.find((c) => c.notePath === notePath);
		if (!claim) continue;
		if (claim.pdfPath === path) return claim;
		if (claim.pdfPath === null && (claim.rawTarget === oldPath || claim.rawTarget === filename(oldPath))) return claim;
	}
	return null;
}

function reactToPdfRename(path: string, oldPath: string, local: boolean, snapshot: Snapshot): Reaction {
	const claim = findNoteOfRenamedPdf(path, oldPath, snapshot);
	if (!claim) return nothing();
	const note = claim.notePath;
	if (samePair(note, path)) {
		if (!local) return nothing(true);
		return { actions: [{ type: "setClaim", notePath: note, pdfPath: path, oldTargets: [] }], recheck: false, pendingRemoved: null };
	}
	return followRename(path, note, oldPath, local, snapshot, (to) => ({ notePath: to, pdfPath: path }));
}

function reactToNoteDelete(path: string, local: boolean, claimedPdf: string | null, linkedElsewhere: boolean, snapshot: Snapshot): Reaction {
	if (claimedPdf === null || !samePair(path, claimedPdf) || !snapshot.pdfPaths.includes(claimedPdf)) return nothing();
	if (snapshot.claims.some((c) => c.pdfPath === claimedPdf)) return nothing();
	if (!local) return nothing(true, claimedPdf);
	// Other notes embed or link the PDF (for example a merge moved the embed into another note): the user deleted
	// the note, not necessarily the document. Keep the PDF and list it, as for a delete that is not local.
	if (linkedElsewhere) {
		return {
			actions: [{ type: "notice", message: `Kept ${filename(claimedPdf)}: other notes still link to it.` }],
			recheck: true,
			pendingRemoved: claimedPdf,
		};
	}
	return { actions: [{ type: "delete", path: claimedPdf }], recheck: false, pendingRemoved: null };
}

function decide(event: VaultEvent, snapshot: Snapshot): Reaction {
	switch (event.kind) {
		case "rename":
			if (isNote(event.path)) return reactToNoteRename(event.path, event.oldPath, event.local, snapshot);
			if (isPdf(event.path)) return reactToPdfRename(event.path, event.oldPath, event.local, snapshot);
			return nothing();
		case "delete":
			return isNote(event.path)
				? reactToNoteDelete(event.path, event.local, event.claimedPdf, event.linkedElsewhere !== false, snapshot)
				: nothing();
		case "create":
			return nothing();
	}
}

const isPairFile = (path: string): boolean => isNote(path) || isPdf(path);

/** Decides what to do about one vault event. `snapshot` is taken AFTER the event. */
export function react(event: VaultEvent, snapshot: Snapshot): Reaction {
	const reaction = decide(event, snapshot);
	if (reaction.actions.length > 0) return reaction;
	// An event touching a note or PDF always deserves a recheck unless something was acted on.
	const touchesPair = isPairFile(event.path) || (event.kind === "rename" && isPairFile(event.oldPath));
	return { ...reaction, recheck: reaction.recheck || touchesPair };
}

/** True for a PDF nobody claims and no note sits beside, outside the attachment folder. */
export function shouldAutoWrap(pdfPath: string, snapshot: Snapshot, attachmentFolder: string | null): boolean {
	return autoWrapChecker(snapshot, attachmentFolder)(pdfPath);
}

/**
 * `shouldAutoWrap` for many PDFs of one snapshot: indexes the snapshot once (PDF paths, claimed PDFs, and the
 * lower-cased folder and base name of every note), so each check takes constant time.
 */
export function autoWrapChecker(snapshot: Snapshot, attachmentFolder: string | null): (pdfPath: string) => boolean {
	const pdfs = new Set(snapshot.pdfPaths);
	const claimed = new Set<string>();
	for (const claim of snapshot.claims) if (claim.pdfPath !== null) claimed.add(claim.pdfPath);
	const notes = new Set(snapshot.notePaths.filter(isNote).map(pairKey));
	return (pdfPath) => pdfs.has(pdfPath)
		&& !claimed.has(pdfPath)
		&& !notes.has(pairKey(pdfPath))
		&& (attachmentFolder === null || !isInFolder(pdfPath, attachmentFolder));
}
