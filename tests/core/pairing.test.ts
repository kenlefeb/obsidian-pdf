import { expect, test } from "vitest";
import type { MarkedNote } from "../../src/core/model.ts";
import { findNoteBeside, findPdfBeside, healthyPairs, pairOfNote, pairUp, withoutFile } from "../../src/core/pairing.ts";

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

test("a PDF pairs whatever the case of its extension, under its real path", () => {
	const p = pairUp({ notePaths: ["a/S.md"], pdfPaths: ["a/S.PDF", "a/T.PDF"], marked: [note("a/S.md")] });
	expect(p.pairs).toEqual([{ note: note("a/S.md"), pdfPath: "a/S.PDF", state: "healthy" }]);
	expect(healthyPairs(p)).toEqual([{ notePath: "a/S.md", pdfPath: "a/S.PDF" }]);
	expect(p.unwrappedPdfs).toEqual(["a/T.PDF"]);
});

test("pairUp picks the same PDF as findPdfBeside when two differ only in extension case", () => {
	const pdfPaths = ["a/S.PDF", "a/S.pdf"];
	const p = pairUp({ notePaths: ["a/S.md"], pdfPaths, marked: [note("a/S.md")] });
	expect(pairOfNote(p, "a/S.md")?.pdfPath).toBe(findPdfBeside("a/S.md", pdfPaths));
	expect(p.unwrappedPdfs).toEqual(["a/S.pdf"]);
});

test("findPdfBeside", () => {
	const pdfs = ["a/S.PDF", "b/S.pdf", "T.pdf", "a/u.pdf"];
	expect(findPdfBeside("a/S.md", pdfs)).toBe("a/S.PDF");
	expect(findPdfBeside("b/S.md", pdfs)).toBe("b/S.pdf");
	expect(findPdfBeside("T.MD", pdfs)).toBe("T.pdf");
	expect(findPdfBeside("c/S.md", pdfs)).toBeNull(); // other folder
	expect(findPdfBeside("a/U.md", pdfs)).toBeNull(); // base name differs in case
	expect(findPdfBeside("a/S.txt", pdfs)).toBeNull(); // not a note
	expect(findPdfBeside("a/S.md", [])).toBeNull();
});

test("findNoteBeside", () => {
	const notes = ["a/S.md", "T.MD", "a/u.md", "a/S.pdf"];
	expect(findNoteBeside("a/S.PDF", notes)).toBe("a/S.md");
	expect(findNoteBeside("T.pdf", notes)).toBe("T.MD");
	expect(findNoteBeside("b/S.pdf", notes)).toBeNull();
	expect(findNoteBeside("a/U.pdf", notes)).toBeNull();
	expect(findNoteBeside("a/S.md", notes)).toBeNull(); // not a PDF
});

test("withoutFile removes every trace of a deleted file and leaves the rest", () => {
	const s = { notePaths: ["a/A.md", "a/B.md"], pdfPaths: ["a/A.pdf", "a/B.pdf"], marked: [note("a/A.md"), note("a/B.md", "a/A.pdf")] };
	expect(withoutFile(s, "a/A.md")).toEqual({ notePaths: ["a/B.md"], pdfPaths: ["a/A.pdf", "a/B.pdf"], marked: [note("a/B.md", "a/A.pdf")] });
	expect(withoutFile(s, "a/A.pdf")).toEqual({ notePaths: ["a/A.md", "a/B.md"], pdfPaths: ["a/B.pdf"], marked: s.marked });
	expect(withoutFile(s, "a/Other.md")).toEqual(s);
	// The snapshot handed in is not changed.
	expect(s.notePaths).toEqual(["a/A.md", "a/B.md"]);
});
