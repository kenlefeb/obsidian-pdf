import { basename, dirname, filename, isInFolder, joinPath } from "./paths.ts";
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

export function buildAttention(
	c: Classification,
	pendingRemoved: string[],
	opts: { includeUnwrapped: boolean; attachmentFolder: string | null },
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
		for (const pdfPath of c.unwrappedPdfs) {
			if (removed.has(pdfPath)) continue;
			if (opts.attachmentFolder !== null && isInFolder(pdfPath, opts.attachmentFolder)) continue;
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
	const beside = c.unwrappedPdfs.filter((p) => dirname(p) === folder);
	const elsewhere = c.unwrappedPdfs.filter((p) => dirname(p) !== folder && names.has(basename(p)));
	return [...beside, ...elsewhere];
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

function oldTargetsOf(pdfPath: string): string[] {
	return [pdfPath, filename(pdfPath), basename(pdfPath)];
}

function need(value: string | null | undefined, what: string, fix: FixId): string {
	if (value === null || value === undefined) throw new Error(`${fix} needs ${what}`);
	return value;
}

function taken(verb: string, from: string, to: string): Action[] {
	return [{ type: "notice", message: `Could not ${verb} ${from} to ${to}: a file with that name already exists.` }];
}

/** The file actions a fix performs. Never overwrites: a taken destination yields a single notice. */
export function planFix(item: AttentionItem, fix: FixId, snapshot: Snapshot, chosenPdf?: string): Action[] {
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
				{ type: "setClaim", notePath, pdfPath: to, oldTargets: oldTargetsOf(from) },
			];
		}
		case "rename-note-to-pdf": {
			const from = need(item.notePath, "a note", fix);
			const pdfPath = need(item.pdfPath, "a PDF", fix);
			const to = partnerDestination(pdfPath, from);
			if (isTaken(to, snapshot, from)) return taken("rename", from, to);
			return [
				{ type: "rename", from, to },
				{ type: "setClaim", notePath: to, pdfPath, oldTargets: [] },
			];
		}
		case "copy-pdf-for-note": {
			const notePath = need(item.notePath, "a note", fix);
			const from = need(item.pdfPath, "a PDF", fix);
			const to = partnerDestination(notePath, from);
			if (isTaken(to, snapshot, null)) return taken("copy", from, to);
			return [
				{ type: "copy", from, to },
				{ type: "setClaim", notePath, pdfPath: to, oldTargets: oldTargetsOf(from) },
			];
		}
		case "choose-pdf": {
			const notePath = need(item.notePath, "a note", fix);
			const from = need(chosenPdf, "a chosen PDF", fix);
			const to = partnerDestination(notePath, from);
			if (to === from) return [{ type: "setClaim", notePath, pdfPath: to, oldTargets: [] }];
			if (isTaken(to, snapshot, from)) return taken("move", from, to);
			return [
				{ type: "rename", from, to },
				{ type: "setClaim", notePath, pdfPath: to, oldTargets: oldTargetsOf(from) },
			];
		}
	}
}

/** True when the default fix can be applied in a batch: a lone claim, a free destination, no copying. */
export function isBulkFixable(item: AttentionItem, snapshot: Snapshot): boolean {
	if ((item.kind !== "misnamed" && item.kind !== "displaced") || item.notePath === null || item.pdfPath === null) return false;
	const claims = snapshot.claims.filter((claim) => claim.pdfPath === item.pdfPath);
	if (claims.length !== 1) return false;
	return !isTaken(partnerDestination(item.notePath, item.pdfPath), snapshot, item.pdfPath);
}

/** `a/S.pdf` becomes `a/S 1.pdf`, then `a/S 2.pdf` and so on, skipping `taken` paths (compared ignoring letter case). */
export function copyPath(path: string, taken: ReadonlySet<string>): string {
	const lowered = new Set([...taken].map((p) => p.toLowerCase()));
	const dir = dirname(path);
	const base = basename(path);
	const ext = ownExtension(path);
	for (let n = 1; ; n++) {
		const candidate = joinPath(dir, `${base} ${n}${ext}`);
		if (!lowered.has(candidate.toLowerCase())) return candidate;
	}
}
