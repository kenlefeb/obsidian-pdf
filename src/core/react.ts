import { basename, dirname, filename, findPathIgnoringCase, isInFolder, isNote, isPdf, joinPath, samePair } from "./paths.ts";
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

function isFree(path: string, snapshot: Snapshot): boolean {
	return findPathIgnoringCase(snapshot.pdfPaths, path) === null
		&& findPathIgnoringCase(snapshot.notePaths, path) === null;
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
	if (!isFree(to, snapshot)) {
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
		return { actions: [{ type: "setClaim", notePath: path, pdfPath: claim.pdfPath, oldTargets: [] }], recheck: false, pendingRemoved: null };
	}
	if (claim.pdfPath !== null && samePair(oldPath, claim.pdfPath)) {
		const pdf = claim.pdfPath;
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
		return { actions: [{ type: "setClaim", notePath: note, pdfPath: path, oldTargets: [] }], recheck: false, pendingRemoved: null };
	}
	return followRename(path, note, oldPath, local, snapshot, (to) => ({ notePath: to, pdfPath: path }));
}

function reactToNoteDelete(path: string, local: boolean, claimedPdf: string | null, snapshot: Snapshot): Reaction {
	if (claimedPdf === null || !samePair(path, claimedPdf) || !snapshot.pdfPaths.includes(claimedPdf)) return nothing();
	if (snapshot.claims.some((c) => c.pdfPath === claimedPdf)) return nothing();
	if (local) return { actions: [{ type: "delete", path: claimedPdf }], recheck: false, pendingRemoved: null };
	return nothing(true, claimedPdf);
}

/** Decides what to do about one vault event. `snapshot` is taken AFTER the event. */
export function react(event: VaultEvent, snapshot: Snapshot): Reaction {
	switch (event.kind) {
		case "rename":
			if (isNote(event.path)) return reactToNoteRename(event.path, event.oldPath, event.local, snapshot);
			if (isPdf(event.path)) return reactToPdfRename(event.path, event.oldPath, event.local, snapshot);
			return nothing();
		case "delete":
			if (isNote(event.path)) return reactToNoteDelete(event.path, event.local, event.claimedPdf, snapshot);
			return isPdf(event.path) ? nothing(true) : nothing();
		case "create":
			return nothing(isNote(event.path) || isPdf(event.path));
	}
}

/** True for a PDF nobody claims and no note sits beside, outside the attachment folder. */
export function shouldAutoWrap(pdfPath: string, snapshot: Snapshot, attachmentFolder: string | null): boolean {
	return snapshot.pdfPaths.includes(pdfPath)
		&& !snapshot.claims.some((c) => c.pdfPath === pdfPath)
		&& !snapshot.notePaths.some((n) => samePair(n, pdfPath))
		&& (attachmentFolder === null || !isInFolder(pdfPath, attachmentFolder));
}
