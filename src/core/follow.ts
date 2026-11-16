import type { FileAction, FollowEvent, FollowResult, VaultSnapshot } from "./model.ts";
import { findNoteBeside, findPdfBeside } from "./pairing.ts";
import { basename, dirname, filename, isNote, isPdf, joinPath, pdfBeside } from "./paths.ts";

const nothing = (recheck = false, pendingRemoved: string | null = null): FollowResult => ({ actions: [], recheck, pendingRemoved });

const done = (action: FileAction): FollowResult => ({ actions: [action], recheck: false, pendingRemoved: null });

const told = (message: string, pendingRemoved: string | null = null): FollowResult =>
	({ actions: [{ type: "notice", message }], recheck: true, pendingRemoved });

/** The extension of the file's own name, case preserved, without the dot. */
function ownExtension(path: string): string {
	const name = filename(path);
	return name.slice(name.lastIndexOf(".") + 1);
}

/** Where the partner of `anchor` must live to pair with it, keeping the partner's own spelling of its extension. */
export function partnerDestination(anchor: string, partner: string): string {
	return joinPath(dirname(anchor), `${basename(anchor)}.${ownExtension(partner)}`);
}

/**
 * Free means in neither list ignoring letter case. `exempt` (the partner being renamed) does not count against
 * itself; null exempts nothing.
 */
export function isFree(path: string, exempt: string | null, snapshot: VaultSnapshot): boolean {
	const wanted = path.toLowerCase();
	return ![...snapshot.pdfPaths, ...snapshot.notePaths].some((p) => p !== exempt && p.toLowerCase() === wanted);
}

function isMarked(notePath: string, snapshot: VaultSnapshot): boolean {
	return snapshot.marked.some((note) => note.notePath === notePath);
}

/** Renames `partner` so it pairs with `anchor`, which has just been renamed or moved. Nothing else is touched. */
function renamePartner(anchor: string, partner: string, local: boolean, snapshot: VaultSnapshot): FollowResult {
	const to = partnerDestination(anchor, partner);
	// Only the anchor's extension changed: the two still pair.
	if (to === partner) return nothing(true);
	if (!local) return nothing(true);
	if (!isFree(to, partner, snapshot)) {
		return told(`Could not rename ${partner} to match ${anchor}: a file with that name already exists.`);
	}
	return done({ type: "rename", from: partner, to });
}

function followNoteRename(path: string, oldPath: string, local: boolean, snapshot: VaultSnapshot): FollowResult {
	if (!isMarked(path, snapshot)) return nothing();
	// Healthy before the rename: a PDF with the note's old name is still at the old place. When both files moved
	// with a folder it is not, and there is nothing to do.
	const pdf = findPdfBeside(oldPath, snapshot.pdfPaths);
	if (pdf === null) return nothing(true);
	// Another marked note sits beside that PDF now: it is that note's PDF.
	if (snapshot.marked.some((note) => note.notePath !== path && findPdfBeside(note.notePath, [pdf]) !== null)) return nothing(true);
	return renamePartner(path, pdf, local, snapshot);
}

function followPdfRename(path: string, oldPath: string, local: boolean, snapshot: VaultSnapshot): FollowResult {
	const note = findNoteBeside(oldPath, snapshot.notePaths);
	if (note === null || !isMarked(note, snapshot)) return nothing();
	// The note still has a PDF beside it (this one under another spelling of its extension, or another file).
	if (findPdfBeside(note, snapshot.pdfPaths) !== null) return nothing(true);
	return renamePartner(path, note, local, snapshot);
}

function followNoteDelete(path: string, local: boolean, wasMarked: boolean, linkedElsewhere: boolean, snapshot: VaultSnapshot): FollowResult {
	if (!wasMarked) return nothing();
	const pdf = findPdfBeside(path, snapshot.pdfPaths);
	if (pdf === null) return nothing();
	// A note of that name is still there (under another spelling of its extension): the PDF is not left alone.
	if (findNoteBeside(pdf, snapshot.notePaths) !== null) return nothing();
	if (!local) return nothing(true, pdf);
	// Other notes embed or link the PDF, or nobody checked: the user deleted the note, not necessarily the document.
	// Keep the PDF and list it, as for a delete that is not local.
	if (linkedElsewhere) return told(`Kept ${filename(pdf)}: other notes still link to it.`, pdf);
	return done({ type: "delete", path: pdf });
}

/**
 * A marked note made inside Obsidian with no PDF beside it, known to be a copy of a healthy pair's note (Obsidian's
 * own copy action copies only the note): copy that pair's PDF beside it, under its name.
 */
function followNoteCreate(path: string, local: boolean, copiedFrom: string | null, snapshot: VaultSnapshot): FollowResult {
	if (!local || copiedFrom === null || copiedFrom === path) return nothing();
	if (!isMarked(path, snapshot) || findPdfBeside(path, snapshot.pdfPaths) !== null) return nothing();
	if (!isMarked(copiedFrom, snapshot)) return nothing();
	const pdf = findPdfBeside(copiedFrom, snapshot.pdfPaths);
	if (pdf === null) return nothing();
	const to = pdfBeside(path);
	if (!isFree(to, null, snapshot)) {
		return told(`Copied ${filename(path)}, but could not copy its PDF: a file named ${filename(to)} already exists. `
			+ "The copy is listed under documents needing attention.");
	}
	return done({ type: "copy", from: pdf, to });
}

function decide(event: FollowEvent, snapshot: VaultSnapshot): FollowResult {
	switch (event.kind) {
		case "rename":
			if (isNote(event.path)) return followNoteRename(event.path, event.oldPath, event.local, snapshot);
			if (isPdf(event.path)) return followPdfRename(event.path, event.oldPath, event.local, snapshot);
			return nothing();
		case "delete":
			return isNote(event.path)
				? followNoteDelete(event.path, event.local, event.wasMarked, event.linkedElsewhere !== false, snapshot)
				: nothing();
		case "create":
			return isNote(event.path) ? followNoteCreate(event.path, event.local, event.copiedFrom, snapshot) : nothing();
	}
}

const isPairFile = (path: string): boolean => isNote(path) || isPdf(path);

/**
 * Decides what to do about one vault event: rename, copy or delete the partner file, and nothing else. No note is
 * edited. `snapshot` is the vault AFTER the event.
 */
export function follow(event: FollowEvent, snapshot: VaultSnapshot): FollowResult {
	const result = decide(event, snapshot);
	if (result.actions.length > 0) return result;
	// An event touching a note or PDF always deserves a recheck unless something was acted on.
	const touchesPair = isPairFile(event.path) || (event.kind === "rename" && isPairFile(event.oldPath));
	return { ...result, recheck: result.recheck || touchesPair };
}

/** The one candidate whose text equals newText exactly; null for none or several. */
export function copySourceByText(newText: string, candidates: { notePath: string; text: string }[]): string | null {
	const same = candidates.filter((candidate) => candidate.text === newText);
	return same.length === 1 ? same[0]!.notePath : null;
}
