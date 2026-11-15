import { expect, test } from "vitest";
import { withoutPath } from "../../src/core/snapshot.ts";
import type { Snapshot } from "../../src/core/types.ts";

const snapshot: Snapshot = {
	notePaths: ["A.md", "B.md"],
	pdfPaths: ["A.pdf", "B.pdf"],
	claims: [
		{ notePath: "A.md", rawTarget: "A.pdf", pdfPath: "A.pdf" },
		{ notePath: "B.md", rawTarget: "B.pdf", pdfPath: "B.pdf" },
	],
};

test("removes a deleted note and its claim, keeps everything else", () => {
	expect(withoutPath(snapshot, "A.md")).toEqual({
		notePaths: ["B.md"],
		pdfPaths: ["A.pdf", "B.pdf"],
		claims: [{ notePath: "B.md", rawTarget: "B.pdf", pdfPath: "B.pdf" }],
	});
});

test("removes a deleted PDF from the PDF list but keeps claims on it", () => {
	expect(withoutPath(snapshot, "A.pdf")).toEqual({
		notePaths: ["A.md", "B.md"],
		pdfPaths: ["B.pdf"],
		claims: snapshot.claims,
	});
});

test("an unknown path changes nothing and the input is not modified", () => {
	const copy = structuredClone(snapshot);
	expect(withoutPath(snapshot, "C.md")).toEqual(snapshot);
	withoutPath(snapshot, "A.md");
	expect(snapshot).toEqual(copy);
});
