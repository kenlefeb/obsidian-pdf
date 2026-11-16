import { expect, test } from "vitest";
import type { ListItem, MarkedNote, VaultSnapshot } from "../../src/core/model.ts";
import { pairUp } from "../../src/core/pairing.ts";
import {
	autoWrapChecker,
	buildList,
	bulkWrapChecker,
	copyCandidates,
	describeConvert,
	isBulkConvertible,
	isBulkWrappable,
	isCurrentItem,
	noteBesidePdf,
	pdfCandidates,
	planRepair,
	renameCandidates,
	repairsFor,
	shouldAutoWrap,
} from "../../src/core/repairs.ts";

const m = (notePath: string, more: Partial<MarkedNote> = {}): MarkedNote =>
	({ notePath, markerLink: null, linkedPdf: null, ownTargets: [], ...more });
/** Every marked note is also in notePaths; `plain` adds unmarked notes. */
const snap = (marked: MarkedNote[], pdfPaths: string[], plain: string[] = []): VaultSnapshot =>
	({ notePaths: [...marked.map((note) => note.notePath), ...plain], pdfPaths, marked });
const notFound = (notePath: string): ListItem => ({ kind: "pdf-not-found", notePath, pdfPath: null });
const unwrapped = (pdfPath: string): ListItem => ({ kind: "unwrapped", notePath: null, pdfPath });
const removed = (pdfPath: string): ListItem => ({ kind: "note-removed", notePath: null, pdfPath });
/** The list entry for `notePath`, as buildList gives it for this snapshot. */
const notice = (message: string) => [{ type: "notice", message }];
const gone = (pdf: string) => notice(`${pdf} is no longer available. Pick again.`);
const NOT_CHOSEN = notice("No PDF was chosen.");
const NOT_OFFERED = notice("That cannot be done for this entry. Check the list again.");
const listed = (s: VaultSnapshot, notePath: string): ListItem => {
	const item = buildList(pairUp(s), [], null).find((entry) => entry.notePath === notePath);
	if (item === undefined) throw new Error(`${notePath} is not listed`);
	return item;
};

// buildList

test("a healthy pair whose note links to its PDF in the body is listed as links-own-pdf", () => {
	const s = snap([m("a/S.md", { ownTargets: ["S.pdf"] })], ["a/S.pdf"]);
	expect(buildList(pairUp(s), [], null)).toEqual([{
		kind: "links-own-pdf", notePath: "a/S.md", pdfPath: "a/S.pdf",
		links: { markerLink: null, linkedPdf: null, ownTargets: ["S.pdf"] },
	}]);
});
test("a marked note without a PDF and without links is listed as pdf-not-found", () => {
	const s = snap([m("a/S.md")], []);
	expect(buildList(pairUp(s), [], null)).toEqual([{ kind: "pdf-not-found", notePath: "a/S.md", pdfPath: null }]);
});
test("a healthy pair that does not link to its PDF is not listed", () => {
	const s = snap([m("a/S.md")], ["a/S.pdf"]);
	expect(buildList(pairUp(s), [], null)).toEqual([]);
});
test("a note that links to its PDF is listed once, as links-own-pdf, even when the PDF is not beside it", () => {
	const s = snap([m("a/S.md", { markerLink: "x/Old.pdf", linkedPdf: "x/Old.pdf", ownTargets: ["x/Old.pdf"] })], ["x/Old.pdf"]);
	expect(buildList(pairUp(s), [], null)).toEqual([{
		kind: "links-own-pdf", notePath: "a/S.md", pdfPath: null,
		links: { markerLink: "x/Old.pdf", linkedPdf: "x/Old.pdf", ownTargets: ["x/Old.pdf"] },
	}]);
});
test("a link-valued marker that resolves to nothing still lists the note as links-own-pdf", () => {
	const s = snap([m("a/S.md", { markerLink: "Gone.pdf" })], []);
	expect(buildList(pairUp(s), [], null).map((item) => item.kind)).toEqual(["links-own-pdf"]);
});
test("a pending removal is listed while its PDF is still unwrapped, and not a second time as unwrapped", () => {
	const s = snap([], ["a/S.pdf", "a/T.pdf"]);
	expect(buildList(pairUp(s), ["a/S.pdf", "a/S.pdf"], null)).toEqual([removed("a/S.pdf"), unwrapped("a/T.pdf")]);
});
test("a pending removal whose PDF is gone, or wrapped again, is dropped", () => {
	expect(buildList(pairUp(snap([], [])), ["a/S.pdf"], null)).toEqual([]);
	expect(buildList(pairUp(snap([m("a/S.md")], ["a/S.pdf"])), ["a/S.pdf"], null)).toEqual([]);
});
test("unwrapped PDFs inside the attachment folder are left out, at any depth", () => {
	const p = pairUp(snap([], ["att/S.pdf", "att/deep/T.pdf", "attic/U.pdf"]));
	expect(buildList(p, [], "att").map((item) => item.pdfPath)).toEqual(["attic/U.pdf"]);
});
test("a PDF protected by a link-valued marker is not listed as unwrapped", () => {
	const s = snap([m("a/S.md", { markerLink: "x/Old.pdf", linkedPdf: "x/Old.pdf", ownTargets: ["x/Old.pdf"] })], ["x/Old.pdf", "x/Z.pdf"]);
	expect(buildList(pairUp(s), [], null).filter((item) => item.kind === "unwrapped")).toEqual([unwrapped("x/Z.pdf")]);
});
test("unwrapped PDFs are listed only when asked", () => {
	const p = pairUp(snap([m("a/N.md")], ["b/S.pdf"]));
	expect(buildList(p, [], null, { includeUnwrapped: false })).toEqual([notFound("a/N.md")]);
	expect(buildList(p, [], null, { includeUnwrapped: true })).toEqual([notFound("a/N.md"), unwrapped("b/S.pdf")]);
});
test("an unwrapped PDF with a same-name note beside it is left out, ignoring letter case", () => {
	const s = snap([], ["a/S.pdf", "a/T.pdf", "a/U.pdf"], ["a/s.MD", "b/T.md", "a/U 1.md"]);
	expect(buildList(pairUp(s), [], null, { notePaths: s.notePaths }).map((item) => item.pdfPath)).toEqual(["a/T.pdf", "a/U.pdf"]);
});
test("a note-removed PDF whose note is back unmarked is still listed", () => {
	const s = snap([], ["a/S.pdf"], ["a/S.md"]);
	expect(buildList(pairUp(s), ["a/S.pdf"], null, { notePaths: s.notePaths })).toEqual([removed("a/S.pdf")]);
});

// Candidates and repairsFor

test("pdfCandidates lists unwrapped PDFs of the note's folder first, then same-named ones elsewhere", () => {
	const s = snap([m("a/N.md"), m("c/W.md")], ["z/N.pdf", "a/Scan.pdf", "z/Other.pdf", "c/W.pdf", "a/Two.pdf"]);
	expect(pdfCandidates(notFound("a/N.md"), pairUp(s))).toEqual(["a/Scan.pdf", "a/Two.pdf", "z/N.pdf"]);
});
test("pdfCandidates leaves out a wrapped PDF and one a link-valued marker protects", () => {
	const s = snap([m("a/N.md"), m("a/W.md"), m("b/L.md", { markerLink: "a/Held.pdf", linkedPdf: "a/Held.pdf", ownTargets: ["a/Held.pdf"] })],
		["a/W.pdf", "a/Held.pdf", "a/Free.pdf"]);
	expect(pdfCandidates(notFound("a/N.md"), pairUp(s))).toEqual(["a/Free.pdf"]);
});
test("renameCandidates lists the unwrapped PDFs in the note's folder only", () => {
	const s = snap([m("a/N.md"), m("a/W.md")], ["z/N.pdf", "a/Scan.pdf", "a/W.pdf"]);
	expect(renameCandidates(notFound("a/N.md"), pairUp(s))).toEqual(["a/Scan.pdf"]);
});
test("copyCandidates lists the PDFs of healthy pairs", () => {
	const s = snap([m("a/N.md"), m("a/W.md"), m("b/V.md")], ["a/W.pdf", "b/V.PDF", "a/Scan.pdf"]);
	expect(copyCandidates(notFound("a/N.md"), pairUp(s))).toEqual(["a/W.pdf", "b/V.PDF"]);
});
test("candidates are empty for an entry that is not pdf-not-found", () => {
	const s = snap([m("a/W.md")], ["a/W.pdf", "a/Scan.pdf"]);
	const p = pairUp(s);
	for (const item of [unwrapped("a/Scan.pdf"), removed("a/Scan.pdf")]) {
		expect([pdfCandidates(item, p), renameCandidates(item, p), copyCandidates(item, p)]).toEqual([[], [], []]);
	}
});
test("repairsFor offers each choosing repair only when it has candidates", () => {
	const alone = pairUp(snap([m("a/N.md")], []));
	expect(repairsFor(notFound("a/N.md"), alone)).toEqual(["remove-marker"]);
	const elsewhere = pairUp(snap([m("a/N.md")], ["z/N.pdf"]));
	expect(repairsFor(notFound("a/N.md"), elsewhere)).toEqual(["use-pdf", "remove-marker"]);
	const all = pairUp(snap([m("a/N.md"), m("b/W.md")], ["a/Scan.pdf", "b/W.pdf"]));
	expect(repairsFor(notFound("a/N.md"), all)).toEqual(["use-pdf", "rename-note-to-pdf", "copy-pdf", "remove-marker"]);
	const copyOnly = pairUp(snap([m("a/N.md"), m("b/W.md")], ["b/W.pdf"]));
	expect(repairsFor(notFound("a/N.md"), copyOnly)).toEqual(["copy-pdf", "remove-marker"]);
});
test("repairsFor for the other kinds", () => {
	const s = snap([m("a/S.md", { ownTargets: ["S.pdf"] })], ["a/S.pdf", "b/T.pdf"]);
	const p = pairUp(s);
	expect(repairsFor(listed(s, "a/S.md"), p)).toEqual(["convert"]);
	expect(repairsFor(removed("b/T.pdf"), p)).toEqual(["keep-plain", "wrap", "delete-pdf"]);
	expect(repairsFor(unwrapped("b/T.pdf"), p)).toEqual(["wrap"]);
});

// planRepair: use-pdf

test("use-pdf moves and renames the chosen PDF to the note's name", () => {
	const s = snap([m("a/N.md")], ["x/N.pdf", "a/Scan.pdf"]);
	expect(planRepair(notFound("a/N.md"), "use-pdf", s, "a/Scan.pdf")).toEqual([{ type: "rename", from: "a/Scan.pdf", to: "a/N.pdf" }]);
	expect(planRepair(notFound("a/N.md"), "use-pdf", s, "x/N.pdf")).toEqual([{ type: "rename", from: "x/N.pdf", to: "a/N.pdf" }]);
});
test("use-pdf keeps the chosen PDF's own spelling of its extension", () => {
	const s = snap([m("a/N.md")], ["x/N.PDF"]);
	expect(planRepair(notFound("a/N.md"), "use-pdf", s, "x/N.PDF")).toEqual([{ type: "rename", from: "x/N.PDF", to: "a/N.PDF" }]);
});
test("use-pdf into the vault root joins without a leading slash", () => {
	const s = snap([m("N.md")], ["x/N.pdf"]);
	expect(planRepair(notFound("N.md"), "use-pdf", s, "x/N.pdf")).toEqual([{ type: "rename", from: "x/N.pdf", to: "N.pdf" }]);
});
test("use-pdf is refused for a PDF that is not a candidate, or without a chosen PDF", () => {
	const s = snap([m("a/N.md"), m("b/W.md")], ["b/W.pdf", "z/Other.pdf", "a/Scan.pdf"]);
	expect(planRepair(notFound("a/N.md"), "use-pdf", s, "b/W.pdf")).toEqual(gone("b/W.pdf"));         // another document's PDF
	expect(planRepair(notFound("a/N.md"), "use-pdf", s, "z/Other.pdf")).toEqual(gone("z/Other.pdf")); // elsewhere under another name
	expect(planRepair(notFound("a/N.md"), "use-pdf", s, "gone.pdf")).toEqual(gone("gone.pdf"));
	expect(planRepair(notFound("a/N.md"), "use-pdf", s)).toEqual(NOT_CHOSEN);
});
test("use-pdf is refused when the destination is taken, even by a name that differs only by letter case", () => {
	const s: VaultSnapshot = { notePaths: ["a/N.md", "a/n.PDF"], pdfPaths: ["x/N.pdf"], marked: [m("a/N.md")] };
	expect(planRepair(notFound("a/N.md"), "use-pdf", s, "x/N.pdf")).toEqual(
		notice("Could not move x/N.pdf to a/N.pdf: a file with that name already exists."));
});
test("use-pdf may rename a PDF that differs from its destination only by letter case", () => {
	const s = snap([m("a/N.md")], ["a/n.pdf"]);
	expect(planRepair(notFound("a/N.md"), "use-pdf", s, "a/n.pdf")).toEqual([{ type: "rename", from: "a/n.pdf", to: "a/N.pdf" }]);
});

// planRepair: rename-note-to-pdf

test("rename-note-to-pdf gives the note the chosen PDF's name", () => {
	const s = snap([m("a/N.md")], ["a/Scan.pdf"]);
	expect(planRepair(notFound("a/N.md"), "rename-note-to-pdf", s, "a/Scan.pdf")).toEqual([{ type: "rename", from: "a/N.md", to: "a/Scan.md" }]);
});
test("rename-note-to-pdf keeps the note's own spelling of its extension", () => {
	const s = snap([m("a/N.MD")], ["a/Scan.PDF"]);
	expect(planRepair(notFound("a/N.MD"), "rename-note-to-pdf", s, "a/Scan.PDF")).toEqual([{ type: "rename", from: "a/N.MD", to: "a/Scan.MD" }]);
});
test("rename-note-to-pdf is refused for a PDF in another folder, a wrapped PDF, or no chosen PDF", () => {
	const s = snap([m("a/N.md"), m("a/W.md")], ["z/N.pdf", "a/W.pdf", "a/Scan.pdf"]);
	expect(planRepair(notFound("a/N.md"), "rename-note-to-pdf", s, "z/N.pdf")).toEqual(gone("z/N.pdf"));
	expect(planRepair(notFound("a/N.md"), "rename-note-to-pdf", s, "a/W.pdf")).toEqual(gone("a/W.pdf"));
	expect(planRepair(notFound("a/N.md"), "rename-note-to-pdf", s)).toEqual(NOT_CHOSEN);
});
test("rename-note-to-pdf is refused when a note of that name exists, ignoring letter case", () => {
	const s = snap([m("a/N.md")], ["a/Scan.pdf"], ["a/scan.md"]);
	expect(planRepair(notFound("a/N.md"), "rename-note-to-pdf", s, "a/Scan.pdf")).toEqual(
		notice("Could not rename a/N.md to a/Scan.md: a file with that name already exists."));
});

// planRepair: copy-pdf

test("copy-pdf copies a wrapped document's PDF under the note's name, with a lower-case extension", () => {
	const s = snap([m("a/N.md"), m("b/W.md")], ["b/W.PDF"]);
	expect(planRepair(notFound("a/N.md"), "copy-pdf", s, "b/W.PDF")).toEqual([{ type: "copy", from: "b/W.PDF", to: "a/N.pdf" }]);
});
test("copy-pdf is refused for a PDF that is not a wrapped document's, or without a chosen PDF", () => {
	const s = snap([m("a/N.md"), m("b/W.md")], ["b/W.pdf", "a/Scan.pdf"]);
	expect(planRepair(notFound("a/N.md"), "copy-pdf", s, "a/Scan.pdf")).toEqual(gone("a/Scan.pdf"));
	expect(planRepair(notFound("a/N.md"), "copy-pdf", s, "gone.pdf")).toEqual(gone("gone.pdf"));
	expect(planRepair(notFound("a/N.md"), "copy-pdf", s)).toEqual(NOT_CHOSEN);
});
test("copy-pdf is refused when the destination is taken, ignoring letter case", () => {
	const s: VaultSnapshot = { notePaths: ["a/N.md", "b/W.md", "a/n.PDF"], pdfPaths: ["b/W.pdf"], marked: [m("a/N.md"), m("b/W.md")] };
	expect(planRepair(notFound("a/N.md"), "copy-pdf", s, "b/W.pdf")).toEqual(
		notice("Could not copy b/W.pdf to a/N.pdf: a file with that name already exists."));
});

// planRepair: remove-marker, wrap, delete-pdf, keep-plain

test("remove-marker removes the marker of a note whose PDF is not found", () => {
	const s = snap([m("a/N.md")], []);
	expect(planRepair(notFound("a/N.md"), "remove-marker", s)).toEqual([{ type: "removeMarker", notePath: "a/N.md" }]);
});
test("delete-pdf and keep-plain for a PDF kept after its note was deleted", () => {
	const s = snap([], ["a/S.pdf"]);
	expect(planRepair(removed("a/S.pdf"), "delete-pdf", s)).toEqual([{ type: "delete", path: "a/S.pdf" }]);
	expect(planRepair(removed("a/S.pdf"), "keep-plain", s)).toEqual([]);
});
test("wrap, for a removed note and for an unwrapped PDF", () => {
	const s = snap([], ["a/S.pdf"]);
	expect(planRepair(removed("a/S.pdf"), "wrap", s)).toEqual([{ type: "wrap", pdfPath: "a/S.pdf" }]);
	expect(planRepair(unwrapped("a/S.pdf"), "wrap", s)).toEqual([{ type: "wrap", pdfPath: "a/S.pdf" }]);
});
test("a repair that a current entry does not offer is refused with one notice", () => {
	const s = snap([m("a/N.md"), m("a/L.md", { ownTargets: ["L.pdf"] })], ["b/S.pdf", "a/L.pdf"]);
	expect(planRepair(unwrapped("b/S.pdf"), "delete-pdf", s)).toEqual(NOT_OFFERED);
	expect(planRepair(unwrapped("b/S.pdf"), "keep-plain", s)).toEqual(NOT_OFFERED);
	expect(planRepair(unwrapped("b/S.pdf"), "remove-marker", s)).toEqual(NOT_OFFERED);
	expect(planRepair(unwrapped("b/S.pdf"), "use-pdf", s, "b/S.pdf")).toEqual(NOT_OFFERED);
	expect(planRepair(unwrapped("b/S.pdf"), "copy-pdf", s, "a/L.pdf")).toEqual(NOT_OFFERED);
	expect(planRepair(notFound("a/N.md"), "convert", s)).toEqual(NOT_OFFERED);
	expect(planRepair(notFound("a/N.md"), "wrap", s)).toEqual(NOT_OFFERED);
	expect(planRepair(listed(s, "a/L.md"), "remove-marker", s)).toEqual(NOT_OFFERED);
	expect(planRepair(listed(s, "a/L.md"), "rename-note-to-pdf", s, "b/S.pdf")).toEqual(NOT_OFFERED);
});

// planRepair: convert

test("convert of a healthy pair only converts, with the marker link among the own targets, without duplicates", () => {
	const s = snap([m("a/S.md", { markerLink: "S.pdf", linkedPdf: "a/S.pdf", ownTargets: ["S.pdf", "a/S.pdf"] })], ["a/S.pdf"]);
	expect(planRepair(listed(s, "a/S.md"), "convert", s)).toEqual([{ type: "convert", notePath: "a/S.md", ownTargets: ["S.pdf", "a/S.pdf"] }]);
});
test("convert adds a marker link that is not among the own targets", () => {
	const s = snap([m("a/S.md", { markerLink: "Gone.pdf", ownTargets: ["S.pdf"] })], ["a/S.pdf"]);
	expect(planRepair(listed(s, "a/S.md"), "convert", s)).toEqual([{ type: "convert", notePath: "a/S.md", ownTargets: ["S.pdf", "Gone.pdf"] }]);
});
test("convert first moves a linked PDF that is elsewhere, then converts", () => {
	const s = snap([m("a/S.md", { markerLink: "x/Old.pdf", linkedPdf: "x/Old.pdf", ownTargets: ["x/Old.pdf"] })], ["x/Old.pdf"]);
	expect(planRepair(listed(s, "a/S.md"), "convert", s)).toEqual([
		{ type: "rename", from: "x/Old.pdf", to: "a/S.pdf" },
		{ type: "convert", notePath: "a/S.md", ownTargets: ["x/Old.pdf"] },
	]);
});
test("convert keeps the moved PDF's own spelling of its extension", () => {
	const s = snap([m("a/S.md", { markerLink: "x/Old.PDF", linkedPdf: "x/Old.PDF", ownTargets: ["x/Old.PDF"] })], ["x/Old.PDF"]);
	expect(planRepair(listed(s, "a/S.md"), "convert", s)[0]).toEqual({ type: "rename", from: "x/Old.PDF", to: "a/S.PDF" });
});
test("convert of a note that has its PDF beside it never moves or refuses, even when its marker points to another PDF", () => {
	const linked = { markerLink: "x/Old.pdf", linkedPdf: "x/Old.pdf", ownTargets: ["x/Old.pdf", "S.pdf"] };
	const s = snap([m("a/S.md", linked), m("b/T.md", linked)], ["x/Old.pdf", "a/S.pdf"]);
	expect(planRepair(listed(s, "a/S.md"), "convert", s)).toEqual([{ type: "convert", notePath: "a/S.md", ownTargets: ["x/Old.pdf", "S.pdf"] }]);
});
test("convert is refused with one notice when the linked PDF's destination is taken", () => {
	const linked = { markerLink: "x/Old.pdf", linkedPdf: "x/Old.pdf", ownTargets: ["x/Old.pdf"] };
	// No PDF is beside the note, but a file whose name differs only by letter case is in the way.
	const s: VaultSnapshot = { notePaths: ["a/S.md", "a/s.PDF"], pdfPaths: ["x/Old.pdf"], marked: [m("a/S.md", linked)] };
	expect(planRepair(listed(s, "a/S.md"), "convert", s)).toEqual(
		notice("Could not convert S.md: its marker points to x/Old.pdf, but a file named S.pdf already exists beside the note."));
});
test("convert is refused with one notice when another marked note's marker points to the same PDF", () => {
	const linked = { markerLink: "x/Old.pdf", linkedPdf: "x/Old.pdf", ownTargets: ["x/Old.pdf"] };
	const s = snap([m("a/S.md", linked), m("b/T.md", linked)], ["x/Old.pdf"]);
	expect(planRepair(listed(s, "a/S.md"), "convert", s)).toEqual([
		{ type: "notice", message: "Could not convert S.md: the marker of b/T.md points to x/Old.pdf too." }]);
});
test("convert of a note whose linked PDF is missing only converts", () => {
	const unresolved = snap([m("a/S.md", { markerLink: "Gone.pdf" })], []);
	expect(planRepair(listed(unresolved, "a/S.md"), "convert", unresolved)).toEqual([{ type: "convert", notePath: "a/S.md", ownTargets: ["Gone.pdf"] }]);
	// Resolved when the note was read, but no longer in the vault.
	const gone = snap([m("a/S.md", { markerLink: "x/Old.pdf", linkedPdf: "x/Old.pdf", ownTargets: ["x/Old.pdf"] })], []);
	expect(planRepair(listed(gone, "a/S.md"), "convert", gone)).toEqual([{ type: "convert", notePath: "a/S.md", ownTargets: ["x/Old.pdf"] }]);
});
test("convert treats a linked PDF beside the note under another spelling of its extension as in place", () => {
	const s = snap([m("a/S.md", { markerLink: "S.PDF", linkedPdf: "a/S.PDF", ownTargets: ["S.PDF"] })], ["a/S.PDF"]);
	expect(planRepair(listed(s, "a/S.md"), "convert", s)).toEqual([{ type: "convert", notePath: "a/S.md", ownTargets: ["S.PDF"] }]);
});

// Stale entries

test("an entry that no longer describes the vault does nothing", () => {
	// The PDF has arrived: the pair is healthy now.
	const healthy = snap([m("a/N.md")], ["a/N.pdf", "a/Scan.pdf"]);
	expect(planRepair(notFound("a/N.md"), "remove-marker", healthy)).toEqual([]);
	expect(planRepair(notFound("a/N.md"), "use-pdf", healthy, "a/Scan.pdf")).toEqual([]);
	// The note is gone or no longer marked.
	expect(planRepair(notFound("a/N.md"), "remove-marker", snap([], [], ["a/N.md"]))).toEqual([]);
	// The PDF is gone, or wrapped again.
	expect(planRepair(removed("a/S.pdf"), "delete-pdf", snap([], []))).toEqual([]);
	expect(planRepair(removed("a/S.pdf"), "delete-pdf", snap([m("a/S.md")], ["a/S.pdf"]))).toEqual([]);
	expect(planRepair(unwrapped("a/S.pdf"), "wrap", snap([m("a/S.md")], ["a/S.pdf"]))).toEqual([]);
});
test("a links-own-pdf entry is stale once the note's links have changed", () => {
	const before = snap([m("a/S.md", { markerLink: "S.pdf", linkedPdf: "a/S.pdf", ownTargets: ["S.pdf"] })], ["a/S.pdf", "x/Old.pdf"]);
	const item = listed(before, "a/S.md");
	expect(isCurrentItem(item, before)).toBe(true);
	const variants: Partial<MarkedNote>[] = [
		{ markerLink: "Old.pdf", linkedPdf: "a/S.pdf", ownTargets: ["S.pdf"] },
		{ markerLink: "S.pdf", linkedPdf: "x/Old.pdf", ownTargets: ["S.pdf"] },
		{ markerLink: "S.pdf", linkedPdf: "a/S.pdf", ownTargets: ["S.pdf", "a/S.pdf"] },
		{},
	];
	for (const variant of variants) {
		const after = snap([m("a/S.md", variant)], ["a/S.pdf", "x/Old.pdf"]);
		expect([variant, isCurrentItem(item, after)]).toEqual([variant, false]);
		expect([variant, planRepair(item, "convert", after)]).toEqual([variant, []]);
	}
	// Its PDF beside it has gone.
	expect(isCurrentItem(item, { ...before, pdfPaths: ["x/Old.pdf"] })).toBe(false);
});
test("isCurrentItem", () => {
	const s = snap([m("a/N.md"), m("a/L.md", { ownTargets: ["L.pdf"] })], ["a/L.pdf", "b/S.pdf"]);
	expect(isCurrentItem(notFound("a/N.md"), s)).toBe(true);
	expect(isCurrentItem(notFound("a/L.md"), s)).toBe(false);   // it is links-own-pdf now
	expect(isCurrentItem(notFound("a/Gone.md"), s)).toBe(false);
	expect(isCurrentItem(unwrapped("b/S.pdf"), s)).toBe(true);
	expect(isCurrentItem(removed("b/S.pdf"), s)).toBe(true);
	expect(isCurrentItem(unwrapped("a/L.pdf"), s)).toBe(false); // wrapped
	expect(isCurrentItem({ kind: "unwrapped", notePath: null, pdfPath: null }, s)).toBe(false);
	expect(isCurrentItem({ kind: "pdf-not-found", notePath: null, pdfPath: null }, s)).toBe(false);
	// A links-own-pdf entry that does not say what the note linked to cannot be checked.
	expect(isCurrentItem({ kind: "links-own-pdf", notePath: "a/L.md", pdfPath: "a/L.pdf" }, s)).toBe(false);
});
test("isCurrentItem and planRepair use a pairing that is handed in", () => {
	const s = snap([m("a/N.md")], ["a/Scan.pdf"]);
	const empty = pairUp(snap([], []));
	expect(isCurrentItem(notFound("a/N.md"), s, empty)).toBe(false);
	expect(planRepair(notFound("a/N.md"), "remove-marker", s, undefined, empty)).toEqual([]);
	expect(planRepair(notFound("a/N.md"), "use-pdf", s, "a/Scan.pdf", pairUp(s))).toEqual([{ type: "rename", from: "a/Scan.pdf", to: "a/N.pdf" }]);
});

// describeConvert, isBulkConvertible

test("describeConvert says what Convert will do to a healthy pair's note", () => {
	const s = snap([m("a/S.md", { ownTargets: ["S.pdf"] })], ["a/S.pdf"]);
	const text = describeConvert(listed(s, "a/S.md"), pairUp(s));
	expect(text).toBe("Convert S.md: the marker property is set to true, links to the PDF are removed from its other properties, "
		+ "each embed of the PDF in the text becomes the wrapped-pdf block (a page or size set on the embed is lost), "
		+ "and each link to it becomes plain text.");
});
test("describeConvert says first that a linked PDF elsewhere is moved and renamed", () => {
	const s = snap([m("a/S.md", { markerLink: "x/Old.PDF", linkedPdf: "x/Old.PDF", ownTargets: ["x/Old.PDF"] })], ["x/Old.PDF"]);
	expect(describeConvert(listed(s, "a/S.md"), pairUp(s))).toMatch(/^x\/Old\.PDF is moved to a\/S\.PDF\. Convert S\.md: /);
});
test("describeConvert says that another PDF the marker points to stays where it is", () => {
	const s = snap([m("a/S.md", { markerLink: "x/Old.pdf", linkedPdf: "x/Old.pdf", ownTargets: ["x/Old.pdf"] })], ["x/Old.pdf", "a/S.pdf"]);
	const text = describeConvert(listed(s, "a/S.md"), pairUp(s));
	expect(text).toMatch(/^Convert S\.md: /);
	expect(text).toMatch(/ S\.pdf beside the note is its PDF; x\/Old\.pdf, which the marker points to, stays where it is and is not wrapped\.$/);
});
test("describeConvert says when the note will then have no PDF", () => {
	const s = snap([m("a/S.md", { markerLink: "Gone.pdf" })], []);
	expect(describeConvert(listed(s, "a/S.md"), pairUp(s))).toMatch(/ No PDF named S\.pdf is beside this note, so it will then be listed as PDF not found\.$/);
});
test("describeConvert is empty for an entry that is not listed in the pairing", () => {
	expect(describeConvert(notFound("a/N.md"), pairUp(snap([], [])))).toBe("");
});
test("isBulkConvertible is true for every links-own-pdf entry whose PDF is beside the note", () => {
	const linked = { markerLink: "x/Old.pdf", linkedPdf: "x/Old.pdf", ownTargets: ["x/Old.pdf"] };
	const s = snap([
		m("a/S.md", { markerLink: "S.pdf", linkedPdf: "a/S.pdf", ownTargets: ["S.pdf"] }),
		m("a/Body.md", { ownTargets: ["Body.pdf"] }),
		m("a/Moved.md", linked),
		m("a/Both.md", { markerLink: "y/Other.pdf", linkedPdf: "y/Other.pdf", ownTargets: ["y/Other.pdf"] }),
		m("a/N.md"),
	], ["a/S.pdf", "a/Body.pdf", "x/Old.pdf", "a/Both.pdf", "y/Other.pdf"]);
	const p = pairUp(s);
	expect(isBulkConvertible(listed(s, "a/S.md"), p)).toBe(true);
	expect(isBulkConvertible(listed(s, "a/Body.md"), p)).toBe(true);
	expect(isBulkConvertible(listed(s, "a/Moved.md"), p)).toBe(false); // the PDF is elsewhere
	expect(isBulkConvertible(listed(s, "a/Both.md"), p)).toBe(true);   // its marker points elsewhere, but nothing moves
	expect(isBulkConvertible(notFound("a/N.md"), p)).toBe(false);
	expect(isBulkConvertible(listed(s, "a/S.md"), pairUp(snap([], [])))).toBe(false);
});

// shouldAutoWrap, autoWrapChecker

test("shouldAutoWrap", () => {
	const s = snap([m("a/S.md")], ["a/S.pdf", "a/N.pdf", "a/New.pdf", "att/x.pdf"], ["a/N.md"]);
	expect(shouldAutoWrap("a/New.pdf", s, "att")).toBe(true);
	expect(shouldAutoWrap("a/S.pdf", s, "att")).toBe(false);   // wrapped
	expect(shouldAutoWrap("a/N.pdf", s, "att")).toBe(false);   // note of that name exists
	expect(shouldAutoWrap("att/x.pdf", s, "att")).toBe(false); // attachment folder
	expect(shouldAutoWrap("att/x.pdf", s, null)).toBe(true);
	expect(shouldAutoWrap("gone.pdf", s, null)).toBe(false);
});
test("shouldAutoWrap treats a note of that name as present ignoring case", () => {
	expect(shouldAutoWrap("a/N.pdf", snap([], ["a/N.pdf"], ["a/n.md"]), null)).toBe(false);
});
test("autoWrapChecker gives the expected answer for every PDF of one snapshot, per attachment folder", () => {
	const s = snap([m("a/S.md"), m("S.md", { markerLink: "a/New.pdf", linkedPdf: "a/New.pdf", ownTargets: ["a/New.pdf"] })],
		["a/S.pdf", "a/N.pdf", "a/New.pdf", "att/x.pdf", "b/X.pdf", "S.pdf", "a/Q.pdf", "A/n.PDF"],
		["a/N.md", "b/x.MD", "a/Q.txt"]);
	// a/S.pdf: wrapped. a/N.pdf: note beside it. a/New.pdf: a link-valued marker points to it. b/X.pdf: note beside it
	// in another letter case. S.pdf: note beside it at the root. A/n.PDF: folder differs only by case. a/Q.pdf: a .txt
	// of that name is not a note. gone.pdf: not in the vault. The attachment folder "" is the whole vault.
	const expected: Record<string, [boolean, boolean, boolean]> = {
		//               null   "att"  ""
		"a/S.pdf":      [false, false, false],
		"a/N.pdf":      [false, false, false],
		"a/New.pdf":    [false, false, false],
		"att/x.pdf":    [true, false, false],
		"b/X.pdf":      [false, false, false],
		"S.pdf":        [false, false, false],
		"a/Q.pdf":      [true, true, false],
		"A/n.PDF":      [false, false, false],
		"gone.pdf":     [false, false, false],
	};
	const folders = [null, "att", ""];
	folders.forEach((folder, i) => {
		const check = autoWrapChecker(s, folder);
		for (const [pdf, answers] of Object.entries(expected)) {
			expect([pdf, folder, check(pdf)]).toEqual([pdf, folder, answers[i]]);
			expect([pdf, folder, shouldAutoWrap(pdf, s, folder)]).toEqual([pdf, folder, answers[i]]);
		}
	});
});

// isBulkWrappable

test("isBulkWrappable is true for a current unwrapped PDF with no note beside it", () => {
	const s = snap([], ["a/S.pdf"], ["b/S.md"]);
	expect(isBulkWrappable(unwrapped("a/S.pdf"), s)).toBe(true);
	expect(isBulkWrappable(unwrapped("a/S.pdf"), s, pairUp(s))).toBe(true);
});
test("isBulkWrappable is false when a same-name note sits beside the PDF, even unmarked or in another case", () => {
	expect(isBulkWrappable(unwrapped("a/S.pdf"), snap([], ["a/S.pdf"], ["a/S.md"]))).toBe(false);
	expect(isBulkWrappable(unwrapped("a/S.pdf"), snap([], ["a/S.pdf"], ["A/s.md"]))).toBe(false);
});
test("isBulkWrappable is false for a wrapped or protected PDF, a gone PDF and other kinds", () => {
	const linked = snap([m("b/T.md", { markerLink: "a/S.pdf", linkedPdf: "a/S.pdf", ownTargets: ["a/S.pdf"] })], ["a/S.pdf"]);
	expect(isBulkWrappable(unwrapped("a/S.pdf"), linked)).toBe(false);
	expect(isBulkWrappable(unwrapped("a/S.pdf"), snap([], []))).toBe(false);
	expect(isBulkWrappable(removed("a/S.pdf"), snap([], ["a/S.pdf"]))).toBe(false);
	expect(isBulkWrappable({ kind: "unwrapped", notePath: null, pdfPath: null }, snap([], ["a/S.pdf"]))).toBe(false);
});
test("isBulkWrappable is false for a PDF whose name cannot be linked", () => {
	for (const name of ["a/S [1].pdf", "a/S|x.pdf", "a/S#1.pdf", "a/S^1.pdf"]) {
		expect([name, isBulkWrappable(unwrapped(name), snap([], [name]))]).toEqual([name, false]);
	}
});

// bulkWrapChecker: the same test for every entry of one snapshot, indexed once

test("bulkWrapChecker and isBulkWrappable give the expected answer for each entry of one snapshot", () => {
	const s = snap([m("X.md", { markerLink: "e/Y.pdf", linkedPdf: "e/Y.pdf", ownTargets: ["e/Y.pdf"] })],
		["a/S.pdf", "a/T.pdf", "b/V.pdf", "c/U.pdf", "d/W [1].pdf", "X.pdf", "e/Y.pdf"],
		["a/s.MD", "b/T.md", "c/U.txt"]);
	const cases: [ListItem, boolean][] = [
		[unwrapped("a/S.pdf"), false],     // note beside it, other letter case
		[unwrapped("a/T.pdf"), true],      // the note of that name is in another folder
		[unwrapped("b/V.pdf"), true],
		[unwrapped("c/U.pdf"), true],      // a .txt of that name is not a note
		[unwrapped("d/W [1].pdf"), false], // name cannot be linked
		[unwrapped("X.pdf"), false],       // X.md is beside it, at the vault root
		[unwrapped("e/Y.pdf"), false],     // a link-valued marker points to it
		[unwrapped("gone.pdf"), false],    // not in the vault
		[removed("b/V.pdf"), false],       // other kinds
		[{ kind: "unwrapped", notePath: null, pdfPath: null }, false],
	];
	const check = bulkWrapChecker(s, pairUp(s));
	for (const [entry, expected] of cases) {
		expect([entry.pdfPath, entry.kind, check(entry)]).toEqual([entry.pdfPath, entry.kind, expected]);
		expect([entry.pdfPath, entry.kind, isBulkWrappable(entry, s)]).toEqual([entry.pdfPath, entry.kind, expected]);
	}
});
test("bulkWrapChecker works without a pairing handed in", () => {
	expect(bulkWrapChecker(snap([], ["a/S.pdf"]))(unwrapped("a/S.pdf"))).toBe(true);
});

// noteBesidePdf

test("noteBesidePdf finds the note that would pair with the PDF, ignoring letter case", () => {
	expect(noteBesidePdf("a/S.pdf", ["b/S.md", "a/S.md"])).toBe("a/S.md");
	expect(noteBesidePdf("a/S.PDF", ["A/s.MD"])).toBe("A/s.MD");
	expect(noteBesidePdf("S.pdf", ["S.md"])).toBe("S.md");
});
test("noteBesidePdf ignores notes in other folders, with other names, and non-notes", () => {
	expect(noteBesidePdf("a/S.pdf", ["b/S.md", "a/T.md", "a/S.txt", "a/S.pdf"])).toBeNull();
	expect(noteBesidePdf("a/S.pdf", [])).toBeNull();
});
