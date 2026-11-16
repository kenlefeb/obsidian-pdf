import { BLOCK_LANGUAGE } from "./block.ts";
import { isFree, partnerDestination } from "./follow.ts";
import { sameLinks, selfLinked, type OwnLinks } from "./marker.ts";
import type { FileAction, ListItem, MarkedNote, Pair, Pairing, RepairId, VaultSnapshot } from "./model.ts";
import { healthyPairs, pairOfNote, pairUp } from "./pairing.ts";
import { basename, dirname, filename, findPathIgnoringCase, isInFolder, isLinkSafeName, isNote, noteBeside, pairKey, pdfBeside } from "./paths.ts";

function linksOf(note: MarkedNote): OwnLinks {
	return { markerLink: note.markerLink, linkedPdf: note.linkedPdf, ownTargets: [...note.ownTargets] };
}

/**
 * The Needs attention list. At most one entry per marked note: links-own-pdf when the note still refers to its PDF by
 * name (whether or not its PDF is beside it), else pdf-not-found when it has none. Then the PDFs kept after their
 * note was deleted, while still unwrapped. Then, unless `includeUnwrapped` is false, the other unwrapped PDFs, except
 * those in the attachment folder and those with a same-name note beside them in `notePaths` (ignoring letter case):
 * such a PDF cannot be wrapped, so listing it would only nag.
 */
export function buildList(
	pairing: Pairing,
	pendingRemoved: string[],
	attachmentFolder: string | null,
	opts: { includeUnwrapped?: boolean; notePaths?: string[] } = {},
): ListItem[] {
	const items: ListItem[] = [];
	for (const pair of pairing.pairs) {
		if (selfLinked(pair.note)) {
			items.push({ kind: "links-own-pdf", notePath: pair.note.notePath, pdfPath: pair.pdfPath, links: linksOf(pair.note) });
		} else if (pair.pdfPath === null) {
			items.push({ kind: "pdf-not-found", notePath: pair.note.notePath, pdfPath: null });
		}
	}
	const unwrapped = new Set(pairing.unwrappedPdfs);
	const removed = new Set<string>();
	for (const pdfPath of pendingRemoved) {
		if (removed.has(pdfPath) || !unwrapped.has(pdfPath)) continue;
		removed.add(pdfPath);
		items.push({ kind: "note-removed", notePath: null, pdfPath });
	}
	if (opts.includeUnwrapped !== false) {
		const noteKeys = new Set((opts.notePaths ?? []).filter(isNote).map(pairKey));
		for (const pdfPath of pairing.unwrappedPdfs) {
			if (removed.has(pdfPath)) continue;
			if (attachmentFolder !== null && isInFolder(pdfPath, attachmentFolder)) continue;
			if (noteKeys.has(pairKey(pdfPath))) continue;
			items.push({ kind: "unwrapped", notePath: null, pdfPath });
		}
	}
	return items;
}

/** The note of a pdf-not-found entry, or null for any other entry. */
function noteWithoutPdf(item: ListItem): string | null {
	return item.kind === "pdf-not-found" ? item.notePath : null;
}

/** For "Use a PDF": the unwrapped PDFs in the note's folder first, then those with the note's base name elsewhere. */
export function pdfCandidates(item: ListItem, pairing: Pairing): string[] {
	const notePath = noteWithoutPdf(item);
	if (notePath === null) return [];
	const folder = dirname(notePath);
	const name = basename(notePath);
	return [
		...pairing.unwrappedPdfs.filter((pdf) => dirname(pdf) === folder),
		...pairing.unwrappedPdfs.filter((pdf) => dirname(pdf) !== folder && basename(pdf) === name),
	];
}

/** For "Rename note to match": the unwrapped PDFs in the note's folder. */
export function renameCandidates(item: ListItem, pairing: Pairing): string[] {
	const notePath = noteWithoutPdf(item);
	if (notePath === null) return [];
	const folder = dirname(notePath);
	return pairing.unwrappedPdfs.filter((pdf) => dirname(pdf) === folder);
}

/** For "Copy another document's PDF": the PDFs of the healthy pairs. */
export function copyCandidates(item: ListItem, pairing: Pairing): string[] {
	return noteWithoutPdf(item) === null ? [] : healthyPairs(pairing).map((pair) => pair.pdfPath);
}

/** The repairs an entry offers; the first is the default. A repair that needs a choice is offered only when there is one. */
export function repairsFor(item: ListItem, pairing: Pairing): RepairId[] {
	switch (item.kind) {
		case "pdf-not-found": {
			const repairs: RepairId[] = [];
			if (pdfCandidates(item, pairing).length > 0) repairs.push("use-pdf");
			if (renameCandidates(item, pairing).length > 0) repairs.push("rename-note-to-pdf");
			if (copyCandidates(item, pairing).length > 0) repairs.push("copy-pdf");
			repairs.push("remove-marker");
			return repairs;
		}
		case "links-own-pdf":
			return ["convert"];
		case "note-removed":
			return ["keep-plain", "wrap", "delete-pdf"];
		case "unwrapped":
			return ["wrap"];
	}
}

/**
 * True when the entry still describes the vault: its PDF is still unwrapped, or its note is still marked and in the
 * same state, with the same PDF beside it and (for links-own-pdf) the same links as when it was listed. `pairing` is
 * `pairUp(snapshot)` when the caller already has it.
 */
export function isCurrentItem(item: ListItem, snapshot: VaultSnapshot, pairing?: Pairing): boolean {
	const p = pairing ?? pairUp(snapshot);
	if (item.kind === "note-removed" || item.kind === "unwrapped") {
		return item.pdfPath !== null && p.unwrappedPdfs.includes(item.pdfPath);
	}
	if (item.notePath === null) return false;
	const pair = pairOfNote(p, item.notePath);
	if (pair === null || pair.pdfPath !== item.pdfPath) return false;
	if (item.kind === "pdf-not-found") return !selfLinked(pair.note);
	return selfLinked(pair.note) && item.links !== undefined && sameLinks(item.links, linksOf(pair.note));
}

/** The PDF the note's marker links to, when it is not the PDF beside the note; else null. It may no longer exist. */
function linkedPdfElsewhere(pair: Pair): string | null {
	const linked = pair.note.linkedPdf;
	return linked !== null && linked !== pair.pdfPath ? linked : null;
}

/** The note of another healthy pair whose PDF this is: such a PDF is that document's and is never moved away from it. */
function otherOwner(pdfPath: string, notePath: string, pairing: Pairing): string | null {
	return pairing.pairs.find((other) => other.pdfPath === pdfPath && other.note.notePath !== notePath)?.note.notePath ?? null;
}

/**
 * The linked PDF that Convert moves beside the note first: only for a note with no PDF beside it, and never a PDF that
 * is another wrapped document's. Otherwise null, and the note is converted as it is.
 */
function pdfToMove(pair: Pair, pairing: Pairing): string | null {
	const linked = pair.pdfPath === null ? linkedPdfElsewhere(pair) : null;
	return linked !== null && otherOwner(linked, pair.note.notePath, pairing) === null ? linked : null;
}

function planConvert(pair: Pair, snapshot: VaultSnapshot, pairing: Pairing): FileAction[] {
	const note = pair.note;
	const notePath = note.notePath;
	const actions: FileAction[] = [];
	const from = pdfToMove(pair, pairing);
	if (from !== null && snapshot.pdfPaths.includes(from)) {
		const refused = (why: string): FileAction[] => [{ type: "notice", message: `Could not convert ${filename(notePath)}: ${why}` }];
		const to = partnerDestination(notePath, from);
		if (!isFree(to, from, snapshot)) {
			return refused(`its marker points to ${from}, but a file named ${filename(to)} already exists beside the note.`);
		}
		const other = snapshot.marked.find((m) => m.notePath !== notePath && m.linkedPdf === from);
		if (other !== undefined) return refused(`the marker of ${other.notePath} points to ${from} too.`);
		actions.push({ type: "rename", from, to });
	}
	const ownTargets = [...new Set([...note.ownTargets, ...(note.markerLink === null ? [] : [note.markerLink])])];
	actions.push({ type: "convert", notePath, ownTargets });
	return actions;
}

const NOT_OFFERED: FileAction[] = [{ type: "notice", message: "That cannot be done for this entry. Check the list again." }];

const told = (message: string): FileAction[] => [{ type: "notice", message }];

const taken = (verb: string, from: string, to: string): FileAction[] =>
	told(`Could not ${verb} ${from} to ${to}: a file with that name already exists.`);

/** The chosen PDF when it is one of `candidates`; else the notice that refuses it. */
function chosenFrom(candidates: string[], chosenPdf: string | undefined): string | FileAction[] {
	if (chosenPdf === undefined) return told("No PDF was chosen.");
	return candidates.includes(chosenPdf) ? chosenPdf : told(`${chosenPdf} is no longer available. Pick again.`);
}

/**
 * The file actions a repair performs. Nothing (an empty list) when the entry no longer describes the vault. A repair
 * refused on a current entry returns a single notice saying why: the entry does not offer it, the chosen PDF is not
 * one of its candidates, the destination is taken (ignoring letter case; nothing is ever overwritten), or Convert
 * cannot move its PDF. A rename keeps the renamed file's own spelling of its extension. `pairing` is
 * `pairUp(snapshot)` when the caller already has it.
 */
export function planRepair(item: ListItem, repair: RepairId, snapshot: VaultSnapshot, chosenPdf?: string, pairing?: Pairing): FileAction[] {
	const p = pairing ?? pairUp(snapshot);
	if (!isCurrentItem(item, snapshot, p)) return [];
	const offered = repairsFor(item, p).includes(repair);
	switch (repair) {
		case "keep-plain":
			return offered ? [] : NOT_OFFERED;
		case "wrap":
			return offered && item.pdfPath !== null ? [{ type: "wrap", pdfPath: item.pdfPath }] : NOT_OFFERED;
		case "delete-pdf":
			return offered && item.pdfPath !== null ? [{ type: "delete", path: item.pdfPath }] : NOT_OFFERED;
		case "remove-marker":
			return offered && item.notePath !== null ? [{ type: "removeMarker", notePath: item.notePath }] : NOT_OFFERED;
		case "use-pdf": {
			const notePath = noteWithoutPdf(item);
			if (notePath === null) return NOT_OFFERED;
			const from = chosenFrom(pdfCandidates(item, p), chosenPdf);
			if (typeof from !== "string") return from;
			const to = partnerDestination(notePath, from);
			return isFree(to, from, snapshot) ? [{ type: "rename", from, to }] : taken("move", from, to);
		}
		case "rename-note-to-pdf": {
			const notePath = noteWithoutPdf(item);
			if (notePath === null) return NOT_OFFERED;
			const pdf = chosenFrom(renameCandidates(item, p), chosenPdf);
			if (typeof pdf !== "string") return pdf;
			const to = partnerDestination(pdf, notePath);
			return isFree(to, notePath, snapshot) ? [{ type: "rename", from: notePath, to }] : taken("rename", notePath, to);
		}
		case "copy-pdf": {
			const notePath = noteWithoutPdf(item);
			if (notePath === null) return NOT_OFFERED;
			const from = chosenFrom(copyCandidates(item, p), chosenPdf);
			if (typeof from !== "string") return from;
			const to = pdfBeside(notePath);
			return isFree(to, null, snapshot) ? [{ type: "copy", from, to }] : taken("copy", from, to);
		}
		case "convert": {
			const pair = offered && item.notePath !== null ? pairOfNote(p, item.notePath) : null;
			return pair === null ? NOT_OFFERED : planConvert(pair, snapshot, p);
		}
	}
}

/** What converting a note does to it. */
const CONVERT_STEPS = "the marker property is set to true, links to the PDF are removed from its other properties, "
	+ `each embed of the PDF in the text becomes the ${BLOCK_LANGUAGE} block (a page or size set on the embed is lost), `
	+ "and each link to it becomes plain text.";

/** What "Convert all" will do to the `count` entries it covers, shown once before it runs. */
export function describeConvertAll(count: number): string {
	return `Convert ${count} ${count === 1 ? "document" : "documents"} whose PDF is already beside its note. `
		+ `No file is moved or renamed. In each note: ${CONVERT_STEPS}`;
}

/** What Convert will do to this entry's note, shown before it runs. Empty when the note is not in the pairing. */
export function describeConvert(item: ListItem, pairing: Pairing): string {
	const pair = item.kind === "links-own-pdf" && item.notePath !== null ? pairOfNote(pairing, item.notePath) : null;
	if (pair === null) return "";
	const notePath = pair.note.notePath;
	const linked = linkedPdfElsewhere(pair);
	const from = pdfToMove(pair, pairing);
	const sentences: string[] = [];
	if (from !== null) sentences.push(`${from} is moved to ${partnerDestination(notePath, from)}.`);
	sentences.push(`Convert ${filename(notePath)}: ${CONVERT_STEPS}`);
	if (pair.pdfPath !== null && linked !== null) {
		sentences.push(`${filename(pair.pdfPath)} beside the note is its PDF; ${linked}, which the marker points to, stays where it is and is not wrapped.`);
	}
	const owner = pair.pdfPath === null && linked !== null ? otherOwner(linked, notePath, pairing) : null;
	if (linked !== null && owner !== null) {
		sentences.push(`${linked}, which the marker points to, is the PDF of ${owner} and stays where it is.`);
	}
	if (pair.pdfPath === null && from === null) {
		sentences.push(`No PDF named ${filename(pdfBeside(notePath))} is beside this note, so it will then be listed as PDF not found.`);
	}
	return sentences.join(" ");
}

/** True when "Convert all" covers this entry: its PDF is already beside the note under its name, so converting it never moves a file. */
export function isBulkConvertible(item: ListItem, pairing: Pairing): boolean {
	return bulkConvertChecker(pairing)(item);
}

/**
 * The test behind `isBulkConvertible`, for every entry of one pairing: indexes the healthy pairs' notes once, so each
 * check takes constant time. For counting the entries of a whole list.
 */
export function bulkConvertChecker(pairing: Pairing): (item: ListItem) => boolean {
	const withPdf = new Set(healthyPairs(pairing).map((pair) => pair.notePath));
	return (item) => item.kind === "links-own-pdf" && item.notePath !== null && withPdf.has(item.notePath);
}

/**
 * The test for whether a PDF should be wrapped automatically: it exists, is unwrapped, has no note of its name, and is
 * outside the attachment folder. Indexes the snapshot once (PDF paths, the PDFs that link-valued markers point to, and
 * the lower-cased folder and base name of every note), so each check takes constant time. A healthy pair's PDF has its
 * note beside it, so the note check covers it.
 */
export function autoWrapChecker(snapshot: VaultSnapshot, attachmentFolder: string | null): (pdfPath: string) => boolean {
	const pdfs = new Set(snapshot.pdfPaths);
	const linked = new Set<string>();
	for (const note of snapshot.marked) if (note.linkedPdf !== null) linked.add(note.linkedPdf);
	const notes = new Set(snapshot.notePaths.filter(isNote).map(pairKey));
	return (pdfPath) => pdfs.has(pdfPath)
		&& !linked.has(pdfPath)
		&& !notes.has(pairKey(pdfPath))
		&& (attachmentFolder === null || !isInFolder(pdfPath, attachmentFolder));
}

/**
 * True when "Wrap all" would try this entry: an unwrapped PDF that is still unwrapped, whose name can be linked, and
 * that has no same-name note beside it in the snapshot's note list (ignoring letter case). A PDF whose name cannot be
 * linked is left to its own Wrap button, which explains why. `pairing` is `pairUp(snapshot)` when the caller already
 * has it.
 */
export function isBulkWrappable(item: ListItem, snapshot: VaultSnapshot, pairing?: Pairing): boolean {
	return bulkWrapChecker(snapshot, pairing)(item);
}

/**
 * The test behind `isBulkWrappable`, for every entry of one snapshot: indexes the snapshot once (the unwrapped PDFs, and the lower-cased
 * folder and base name of every note), so each check takes constant time. For counting the entries of a whole list.
 */
export function bulkWrapChecker(snapshot: VaultSnapshot, pairing?: Pairing): (item: ListItem) => boolean {
	const unwrapped = new Set((pairing ?? pairUp(snapshot)).unwrappedPdfs);
	const noteKeys = new Set(snapshot.notePaths.filter(isNote).map(pairKey));
	return (item) => item.kind === "unwrapped"
		&& item.pdfPath !== null
		&& isLinkSafeName(item.pdfPath)
		&& !noteKeys.has(pairKey(item.pdfPath))
		&& unwrapped.has(item.pdfPath);
}

/**
 * The note in `notePaths` that would pair with `pdfPath` (same folder, same base name, ignoring letter case as a
 * case-insensitive file system would), or null. Meant for the vault's file list, which does not lag as the
 * metadata cache can: "Delete the PDF" asks it before trashing anything.
 */
export function noteBesidePdf(pdfPath: string, notePaths: string[]): string | null {
	return findPathIgnoringCase(notePaths.filter(isNote), noteBeside(pdfPath));
}
