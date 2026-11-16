import { expect, test } from "vitest";
import { bulkResultMessage, listNotice, nextPendingRemoved, repairLabel, rowFile, stateLine } from "../../src/core/list-text.ts";
import type { ListItem, MarkedNote, RepairId, VaultSnapshot } from "../../src/core/model.ts";
import { pairUp } from "../../src/core/pairing.ts";

const m = (notePath: string, more: Partial<MarkedNote> = {}): MarkedNote =>
	({ notePath, markerLink: null, linkedPdf: null, ownTargets: [], ...more });
const snap = (marked: MarkedNote[], pdfPaths: string[]): VaultSnapshot =>
	({ notePaths: marked.map((note) => note.notePath), pdfPaths, marked });
const item = (kind: ListItem["kind"], notePath: string | null, pdfPath: string | null): ListItem => ({ kind, notePath, pdfPath });

test("stateLine gives the entry's name for each kind", () => {
	const p = pairUp(snap([m("a/N.md"), m("a/S.md", { ownTargets: ["S.pdf"] })], ["a/S.pdf", "b/T.pdf"]));
	expect(stateLine(item("pdf-not-found", "a/N.md", null), p)).toBe("PDF not found");
	expect(stateLine(item("links-own-pdf", "a/S.md", "a/S.pdf"), p)).toBe("Links to its own PDF");
	expect(stateLine(item("note-removed", null, "b/T.pdf"), p)).toBe("Its note was deleted; the PDF was kept");
	expect(stateLine(item("unwrapped", null, "b/T.pdf"), p)).toBe("Not wrapped");
});
test("stateLine says where the PDF is when a note links to one that is not beside it", () => {
	const p = pairUp(snap([
		m("a/S.md", { markerLink: "x/Old.pdf", linkedPdf: "x/Old.pdf", ownTargets: ["x/Old.pdf"] }),
		m("a/U.md", { markerLink: "Gone.pdf" }),
	], ["x/Old.pdf"]));
	expect(stateLine(item("links-own-pdf", "a/S.md", null), p)).toBe("Links to its own PDF, which is at x/Old.pdf");
	expect(stateLine(item("links-own-pdf", "a/U.md", null), p)).toBe("Links to its own PDF, which was not found");
	// An entry the pairing no longer knows keeps the plain name.
	expect(stateLine(item("links-own-pdf", "a/Gone.md", null), p)).toBe("Links to its own PDF");
});

test("rowFile shows the note when there is one, else the PDF, with its folder", () => {
	expect(rowFile(item("pdf-not-found", "a/b/S.md", null))).toEqual({ name: "S.md", folder: "a/b" });
	expect(rowFile(item("links-own-pdf", "a/b/S.md", "a/b/S.pdf"))).toEqual({ name: "S.md", folder: "a/b" });
	expect(rowFile(item("unwrapped", null, "c/X.pdf"))).toEqual({ name: "X.pdf", folder: "c" });
	expect(rowFile(item("unwrapped", null, "X.pdf"))).toEqual({ name: "X.pdf", folder: "/" });
});

test("repairLabel gives the specified label for every repair", () => {
	const labels: Record<RepairId, string> = {
		"use-pdf": "Use a PDF",
		"rename-note-to-pdf": "Rename note to match",
		"copy-pdf": "Copy another document's PDF",
		"remove-marker": "Remove the marker",
		"convert": "Convert",
		"delete-pdf": "Delete the PDF",
		"wrap": "Wrap",
		"keep-plain": "Keep as a plain PDF",
	};
	for (const [repair, label] of Object.entries(labels)) expect([repair, repairLabel(repair as RepairId)]).toEqual([repair, label]);
});

test("nextPendingRemoved adds new paths and keeps only those still unwrapped, without duplicates", () => {
	const unwrapped = ["a/S.pdf", "b/T.pdf", "c/U.pdf"];
	expect(nextPendingRemoved(["a/S.pdf", "gone.pdf"], ["b/T.pdf", "a/S.pdf", "wrapped.pdf"], unwrapped))
		.toEqual(["a/S.pdf", "b/T.pdf"]);
});
test("nextPendingRemoved keeps the saved order and leaves an unchanged list equal", () => {
	expect(nextPendingRemoved(["b/T.pdf", "a/S.pdf"], [], ["a/S.pdf", "b/T.pdf"])).toEqual(["b/T.pdf", "a/S.pdf"]);
	expect(nextPendingRemoved([], [], ["a/S.pdf"])).toEqual([]);
});

test("bulkResultMessage reports how many were done, and says so when it stopped early", () => {
	expect(bulkResultMessage("convert", 3, false)).toBe("Converted 3 documents.");
	expect(bulkResultMessage("convert", 1, false)).toBe("Converted 1 document.");
	expect(bulkResultMessage("convert", 2, true)).toBe("Stopped after converting 2 documents.");
	expect(bulkResultMessage("wrap", 4, false)).toBe("Wrapped 4 PDFs.");
	expect(bulkResultMessage("wrap", 1, false)).toBe("Wrapped 1 PDF.");
	expect(bulkResultMessage("wrap", 0, true)).toBe("Stopped after wrapping 0 PDFs.");
});

test("listNotice says how many documents need attention", () => {
	expect(listNotice(3)).toBe("3 documents need attention");
	expect(listNotice(1)).toBe("1 document needs attention");
});
