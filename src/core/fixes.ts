import { noteBesidePdf } from "./attention.ts";
import { classify } from "./classify.ts";
import { basename, dirname, filename, isInFolder, isNote, joinPath, pairKey } from "./paths.ts";
import type { Action, AttentionItem, AttentionKind, Classification, FixId, Snapshot } from "./types.ts";

const FIXES: Record<AttentionKind, FixId[]> = {
	"missing": ["choose-pdf", "remove-claim"],
	"misnamed": ["rename-pdf-to-note", "rename-note-to-pdf"],
	"displaced": ["move-pdf-to-note"],
	"extra-claim": ["copy-pdf-for-note", "remove-claim"],
	"contested": ["move-pdf-to-note", "copy-pdf-for-note", "remove-claim"],
	"note-removed": ["keep-plain", "wrap", "delete-pdf"],
	"unwrapped": ["wrap"],
};

/** The fixes an item of this kind offers; the first is the default. */
export function fixesFor(kind: AttentionKind): FixId[] {
	return [...FIXES[kind]];
}

/**
 * The Needs attention list. With `includeUnwrapped`, unclaimed PDFs are listed too, except those in the attachment
 * folder and those with a same-name note beside them in `notePaths` (ignoring letter case): such a PDF cannot be
 * wrapped, so listing it would only nag.
 */
export function buildAttention(
	c: Classification,
	pendingRemoved: string[],
	opts: { includeUnwrapped: boolean; attachmentFolder: string | null; notePaths?: string[] },
): AttentionItem[] {
	const items: AttentionItem[] = [];
	for (const pair of c.pairs) {
		if (pair.state === "healthy") continue;
		items.push({ kind: pair.state, notePath: pair.notePath, pdfPath: pair.pdfPath, rawTarget: pair.rawTarget });
	}
	const removed = new Set<string>();
	for (const pdfPath of pendingRemoved) {
		if (removed.has(pdfPath) || !c.unwrappedPdfs.includes(pdfPath)) continue;
		removed.add(pdfPath);
		items.push({ kind: "note-removed", notePath: null, pdfPath, rawTarget: null });
	}
	if (opts.includeUnwrapped) {
		const noteKeys = new Set((opts.notePaths ?? []).filter(isNote).map(pairKey));
		for (const pdfPath of c.unwrappedPdfs) {
			if (removed.has(pdfPath)) continue;
			if (opts.attachmentFolder !== null && isInFolder(pdfPath, opts.attachmentFolder)) continue;
			if (noteKeys.has(pairKey(pdfPath))) continue;
			items.push({ kind: "unwrapped", notePath: null, pdfPath, rawTarget: null });
		}
	}
	return items;
}

/** Unclaimed PDFs a note whose PDF is missing could be pointed at: beside the note first, then same-named ones elsewhere. */
export function candidatesForMissing(item: AttentionItem, c: Classification): string[] {
	if (item.notePath === null) return [];
	const folder = dirname(item.notePath);
	const names = new Set([basename(item.notePath)]);
	if (item.rawTarget !== null) names.add(basename(item.rawTarget));
	const exactFirst = (paths: string[]) => [
		...paths.filter((p) => basename(p) === basename(item.notePath ?? "")),
		...paths.filter((p) => basename(p) !== basename(item.notePath ?? "")),
	];
	const beside = c.unwrappedPdfs.filter((p) => dirname(p) === folder);
	const elsewhere = c.unwrappedPdfs.filter((p) => dirname(p) !== folder && names.has(basename(p)));
	return [...exactFirst(beside), ...exactFirst(elsewhere)];
}

/** The extension of the file's own name, case preserved, with the dot; empty when none. */
function ownExtension(path: string): string {
	return filename(path).slice(basename(path).length);
}

/** Where `partner` must live to pair with `anchor`, keeping the partner's own extension case. */
function partnerDestination(anchor: string, partner: string): string {
	return joinPath(dirname(anchor), `${basename(anchor)}${ownExtension(partner)}`);
}

/** True when a PDF or note other than `self` already has this path, ignoring letter case. */
function isTaken(path: string, snapshot: Snapshot, self: string | null): boolean {
	const wanted = path.toLowerCase();
	const clash = (p: string) => p !== self && p.toLowerCase() === wanted;
	return snapshot.pdfPaths.some(clash) || snapshot.notePaths.some(clash);
}

function namesOf(path: string): string[] {
	return [path, filename(path), basename(path)];
}

/** What embeds in the note may currently point at: the PDF's previous path (when it moves or is copied) and the note's raw target. */
function oldTargetsOf(item: AttentionItem, movedFrom: string | null): string[] {
	const names = [...(movedFrom === null ? [] : namesOf(movedFrom)), ...(item.rawTarget === null ? [] : namesOf(item.rawTarget))];
	return [...new Set(names)];
}

const STALE: Action[] = [{ type: "notice", message: "This has changed since it was listed. Check the list again." }];

/**
 * True when the item still describes the vault: its pair is in the same state with the same PDF, or its PDF is still
 * unclaimed. `precomputed` is `classify(snapshot)` when the caller already has it.
 */
export function isCurrent(item: AttentionItem, snapshot: Snapshot, precomputed?: Classification): boolean {
	const c = precomputed ?? classify(snapshot);
	if (item.kind === "note-removed" || item.kind === "unwrapped") {
		return item.pdfPath !== null && c.unwrappedPdfs.includes(item.pdfPath);
	}
	if (item.notePath === null) return false;
	const pair = c.pairs.find((p) => p.notePath === item.notePath);
	return pair !== undefined && pair.state === item.kind && pair.pdfPath === item.pdfPath;
}

function need(value: string | null | undefined, what: string, fix: FixId): string {
	if (value === null || value === undefined) throw new Error(`${fix} needs ${what}`);
	return value;
}

function taken(verb: string, from: string, to: string): Action[] {
	return [{ type: "notice", message: `Could not ${verb} ${from} to ${to}: a file with that name already exists.` }];
}

/**
 * The file actions a fix performs. Never overwrites: a taken destination yields a single notice.
 * `precomputed` is `classify(snapshot)` when the caller already has it.
 */
export function planFix(item: AttentionItem, fix: FixId, snapshot: Snapshot, chosenPdf?: string, precomputed?: Classification): Action[] {
	const c = precomputed ?? classify(snapshot);
	if (!fixesFor(item.kind).includes(fix) || !isCurrent(item, snapshot, c)) return STALE;
	switch (fix) {
		case "keep-plain":
			return [];
		case "wrap":
			return [{ type: "wrap", pdfPath: need(item.pdfPath, "a PDF", fix) }];
		case "delete-pdf":
			return [{ type: "delete", path: need(item.pdfPath, "a PDF", fix) }];
		case "remove-claim":
			return [{ type: "removeClaim", notePath: need(item.notePath, "a note", fix) }];
		case "rename-pdf-to-note":
		case "move-pdf-to-note": {
			const notePath = need(item.notePath, "a note", fix);
			const from = need(item.pdfPath, "a PDF", fix);
			const to = partnerDestination(notePath, from);
			if (isTaken(to, snapshot, from)) return taken(fix === "move-pdf-to-note" ? "move" : "rename", from, to);
			return [
				{ type: "rename", from, to },
				{ type: "setClaim", notePath, pdfPath: to, oldTargets: oldTargetsOf(item, from) },
			];
		}
		case "rename-note-to-pdf": {
			const from = need(item.notePath, "a note", fix);
			const pdfPath = need(item.pdfPath, "a PDF", fix);
			const to = partnerDestination(pdfPath, from);
			if (isTaken(to, snapshot, from)) return taken("rename", from, to);
			return [
				{ type: "rename", from, to },
				{ type: "setClaim", notePath: to, pdfPath, oldTargets: oldTargetsOf(item, null) },
			];
		}
		case "copy-pdf-for-note": {
			const notePath = need(item.notePath, "a note", fix);
			const from = need(item.pdfPath, "a PDF", fix);
			const to = partnerDestination(notePath, from);
			if (isTaken(to, snapshot, null)) return taken("copy", from, to);
			return [
				{ type: "copy", from, to },
				{ type: "setClaim", notePath, pdfPath: to, oldTargets: oldTargetsOf(item, from) },
			];
		}
		case "choose-pdf": {
			const notePath = need(item.notePath, "a note", fix);
			const from = need(chosenPdf, "a chosen PDF", fix);
			if (!c.unwrappedPdfs.includes(from)) {
				return [{ type: "notice", message: `${from} is no longer available. Pick again.` }];
			}
			const to = partnerDestination(notePath, from);
			if (to === from) return [{ type: "setClaim", notePath, pdfPath: to, oldTargets: oldTargetsOf(item, null) }];
			if (isTaken(to, snapshot, from)) return taken("move", from, to);
			return [
				{ type: "rename", from, to },
				{ type: "setClaim", notePath, pdfPath: to, oldTargets: oldTargetsOf(item, from) },
			];
		}
	}
}

/**
 * True when the default fix can be applied in a batch: a lone claim, a free destination, no copying.
 * `precomputed` is `classify(snapshot)` when the caller already has it.
 */
export function isBulkFixable(item: AttentionItem, snapshot: Snapshot, precomputed?: Classification): boolean {
	if ((item.kind !== "misnamed" && item.kind !== "displaced") || item.notePath === null || item.pdfPath === null) return false;
	if (!isCurrent(item, snapshot, precomputed)) return false;
	const claims = snapshot.claims.filter((claim) => claim.pdfPath === item.pdfPath);
	if (claims.length !== 1 || claims[0]?.notePath !== item.notePath) return false;
	return !isTaken(partnerDestination(item.notePath, item.pdfPath), snapshot, item.pdfPath);
}

/**
 * True when "Wrap all" would try this entry: an unwrapped PDF that is still unclaimed and has no same-name note beside
 * it in the snapshot's note list (the vault's file list, which does not lag as the metadata cache can).
 */
export function isBulkWrappable(item: AttentionItem, snapshot: Snapshot, c?: Classification): boolean {
	if (item.kind !== "unwrapped" || item.pdfPath === null) return false;
	return noteBesidePdf(item.pdfPath, snapshot.notePaths) === null && isCurrent(item, snapshot, c);
}
