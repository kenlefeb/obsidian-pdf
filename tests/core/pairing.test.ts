import { expect, test } from "vitest";
import type { MarkedNote } from "../../src/core/model.ts";
import { healthyPairs, pairOfNote, pairUp } from "../../src/core/pairing.ts";

const note = (notePath: string, linkedPdf: string | null = null): MarkedNote =>
	({ notePath, markerLink: linkedPdf, linkedPdf, ownTargets: linkedPdf ? [linkedPdf] : [] });

test("pairs by name and folder only", () => {
	const p = pairUp({ notePaths: ["a/A.md", "a/B.md", "b/A.md"], pdfPaths: ["a/A.pdf", "c/B.pdf", "c/Z.pdf", "c/Old.pdf"],
		marked: [note("a/A.md"), note("a/B.md", "c/Old.pdf")] });
	expect(healthyPairs(p)).toEqual([{ notePath: "a/A.md", pdfPath: "a/A.pdf" }]);
	expect(pairOfNote(p, "a/B.md")?.state).toBe("pdf-not-found");
	expect(p.unwrappedPdfs).toEqual(["c/B.pdf", "c/Z.pdf"]); // c/Old.pdf is protected by the link-valued marker
});

test("every marked note gets one pair; a missing PDF has no path", () => {
	const p = pairUp({ notePaths: ["A.md", "B.md"], pdfPaths: ["A.pdf"], marked: [note("A.md"), note("B.md")] });
	expect(p.pairs).toEqual([
		{ note: note("A.md"), pdfPath: "A.pdf", state: "healthy" },
		{ note: note("B.md"), pdfPath: null, state: "pdf-not-found" },
	]);
	expect(p.unwrappedPdfs).toEqual([]);
});

test("an unmarked note beside a PDF is not a pair", () => {
	const p = pairUp({ notePaths: ["A.md"], pdfPaths: ["A.pdf"], marked: [] });
	expect(p.pairs).toEqual([]);
	expect(pairOfNote(p, "A.md")).toBeNull();
	expect(p.unwrappedPdfs).toEqual(["A.pdf"]);
});

test("pairing is case-sensitive", () => {
	const p = pairUp({ notePaths: ["a/S.md"], pdfPaths: ["a/s.pdf"], marked: [note("a/S.md")] });
	expect(healthyPairs(p)).toEqual([]);
	expect(p.unwrappedPdfs).toEqual(["a/s.pdf"]);
});

test("a healthy pair whose marker still links to its PDF", () => {
	const p = pairUp({ notePaths: ["A.md"], pdfPaths: ["A.pdf"], marked: [note("A.md", "A.pdf")] });
	expect(healthyPairs(p)).toEqual([{ notePath: "A.md", pdfPath: "A.pdf" }]);
	expect(p.unwrappedPdfs).toEqual([]);
});
