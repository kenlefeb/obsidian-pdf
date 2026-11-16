import { BLOCK_LANGUAGE } from "./block.ts";
import { isFree, partnerDestination } from "./follow.ts";
import { selfLinked } from "./marker.ts";
import type { FileAction, ListItem, MarkedNote, Pair, Pairing, RepairId, VaultSnapshot } from "./model.ts";
import { healthyPairs, pairOfNote, pairUp } from "./pairing.ts";
import { basename, dirname, filename, isInFolder, isNote, pairKey, pdfBeside } from "./paths.ts";

type OwnLinks = NonNullable<ListItem["links"]>;

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

function sameLinks(a: OwnLinks, b: OwnLinks): boolean {
	return a.markerLink === b.markerLink
		&& a.linkedPdf === b.linkedPdf
		&& a.ownTargets.length === b.ownTargets.length
		&& a.ownTargets.every((target, i) => target === b.ownTargets[i]);
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

function planConvert(pair: Pair, snapshot: VaultSnapshot): FileAction[] {
	const note = pair.note;
	const notePath = note.notePath;
	const actions: FileAction[] = [];
	const from = linkedPdfElsewhere(pair);
	if (from !== null && snapshot.pdfPaths.includes(from)) {
		const refused = (why: string): FileAction[] => [{ type: "notice", message: `Could not convert ${filename(notePath)}: ${why}` }];
		const to = partnerDestination(notePath, from);
		if (pair.pdfPath !== null || !isFree(to, from, snapshot)) {
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

/**
 * The file actions a repair performs. Nothing (an empty list) when the entry no longer describes the vault, does not
 * offer the repair, the chosen PDF is not one of its candidates, or the destination is taken (ignoring letter case):
 * nothing is ever overwritten. A rename keeps the renamed file's own spelling of its extension. Convert that cannot
 * move its PDF returns a single notice. `pairing` is `pairUp(snapshot)` when the caller already has it.
 */
export function planRepair(item: ListItem, repair: RepairId, snapshot: VaultSnapshot, chosenPdf?: string, pairing?: Pairing): FileAction[] {
	const p = pairing ?? pairUp(snapshot);
	if (!isCurrentItem(item, snapshot, p) || !repairsFor(item, p).includes(repair)) return [];
	switch (repair) {
		case "keep-plain":
			return [];
		case "wrap":
			return item.pdfPath === null ? [] : [{ type: "wrap", pdfPath: item.pdfPath }];
		case "delete-pdf":
			return item.pdfPath === null ? [] : [{ type: "delete", path: item.pdfPath }];
		case "remove-marker":
			return item.notePath === null ? [] : [{ type: "removeMarker", notePath: item.notePath }];
		case "use-pdf": {
			if (item.notePath === null || chosenPdf === undefined || !pdfCandidates(item, p).includes(chosenPdf)) return [];
			const to = partnerDestination(item.notePath, chosenPdf);
			return isFree(to, chosenPdf, snapshot) ? [{ type: "rename", from: chosenPdf, to }] : [];
		}
		case "rename-note-to-pdf": {
			if (item.notePath === null || chosenPdf === undefined || !renameCandidates(item, p).includes(chosenPdf)) return [];
			const to = partnerDestination(chosenPdf, item.notePath);
			return isFree(to, item.notePath, snapshot) ? [{ type: "rename", from: item.notePath, to }] : [];
		}
		case "copy-pdf": {
			if (item.notePath === null || chosenPdf === undefined || !copyCandidates(item, p).includes(chosenPdf)) return [];
			const to = pdfBeside(item.notePath);
			return isFree(to, null, snapshot) ? [{ type: "copy", from: chosenPdf, to }] : [];
		}
		case "convert": {
			const pair = item.notePath === null ? null : pairOfNote(p, item.notePath);
			return pair === null ? [] : planConvert(pair, snapshot);
		}
	}
}

/** What Convert will do to this entry's note, shown before it runs. Empty when the note is not in the pairing. */
export function describeConvert(item: ListItem, pairing: Pairing): string {
	const pair = item.kind === "links-own-pdf" && item.notePath !== null ? pairOfNote(pairing, item.notePath) : null;
	if (pair === null) return "";
	const notePath = pair.note.notePath;
	// With a PDF already beside the note there is nowhere to move a linked one: planRepair refuses with a notice.
	const from = pair.pdfPath === null ? linkedPdfElsewhere(pair) : null;
	const sentences: string[] = [];
	if (from !== null) sentences.push(`${from} is moved to ${partnerDestination(notePath, from)}.`);
	sentences.push(`Convert ${filename(notePath)}: the marker property is set to true, links to the PDF are removed from its other properties, `
		+ `each embed of the PDF in the text becomes the ${BLOCK_LANGUAGE} block (a page or size set on the embed is lost), `
		+ "and each link to it becomes plain text.");
	if (pair.pdfPath === null && from === null) {
		sentences.push(`No PDF named ${filename(pdfBeside(notePath))} is beside this note, so it will then be listed as PDF not found.`);
	}
	return sentences.join(" ");
}

/**
 * True when "Convert all" covers this entry: its PDF is already beside the note under its name and its marker does not
 * point to another PDF, so converting it never moves a file.
 */
export function isBulkConvertible(item: ListItem, pairing: Pairing): boolean {
	if (item.kind !== "links-own-pdf" || item.notePath === null) return false;
	const pair = pairOfNote(pairing, item.notePath);
	return pair !== null && pair.pdfPath !== null && linkedPdfElsewhere(pair) === null;
}

/** True when a PDF should be wrapped automatically: it exists, is unwrapped, has no note of its name, and is outside the attachment folder. */
export function shouldAutoWrap(pdfPath: string, snapshot: VaultSnapshot, attachmentFolder: string | null): boolean {
	return autoWrapChecker(snapshot, attachmentFolder)(pdfPath);
}

/**
 * `shouldAutoWrap` for many PDFs of one snapshot: indexes the snapshot once (PDF paths, the PDFs that link-valued
 * markers point to, and the lower-cased folder and base name of every note), so each check takes constant time. A
 * healthy pair's PDF has its note beside it, so the note check covers it.
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

/** False when the path holds characters that cannot appear in a wikilink target; wrapping refuses such a PDF. */
function isLinkSafeName(path: string): boolean {
	return !/[[\]|#^]/.test(path);
}

/**
 * True when "Wrap all" would try this entry: an unwrapped PDF that is still unwrapped, whose name can be linked, and
 * that has no same-name note beside it in the snapshot's note list (ignoring letter case). A PDF whose name cannot be
 * linked is left to its own Wrap button, which explains why. `pairing` is `pairUp(snapshot)` when the caller already
 * has it.
 */
export function isBulkWrappable(item: ListItem, snapshot: VaultSnapshot, pairing?: Pairing): boolean {
	if (item.kind !== "unwrapped" || item.pdfPath === null) return false;
	const key = pairKey(item.pdfPath);
	return isLinkSafeName(item.pdfPath)
		&& !snapshot.notePaths.some((note) => isNote(note) && pairKey(note) === key)
		&& isCurrentItem(item, snapshot, pairing);
}
