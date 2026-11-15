import { expect, test } from "vitest";
import { basename, dirname, extension, filename, isInFolder, isNote, findPathIgnoringCase, isPdf, joinPath, samePair } from "../../src/core/paths.ts";

test("root-level files", () => {
	expect(dirname("Statement.pdf")).toBe("");
	expect(joinPath("", "a.md")).toBe("a.md");
	expect(samePair("Statement.md", "Statement.pdf")).toBe(true);
});

test("nested", () => {
	expect(dirname("a/b/S.pdf")).toBe("a/b");
	expect(filename("a/b/S.pdf")).toBe("S.pdf");
	expect(basename("a/b/S.pdf")).toBe("S");
	expect(joinPath("a/b", "S.md")).toBe("a/b/S.md");
});

test("dots in names and case of extension", () => {
	expect(basename("2024.01 Bank.v2.PDF")).toBe("2024.01 Bank.v2");
	expect(extension("x.PDF")).toBe("pdf");
	expect(isPdf("x.PDF")).toBe(true);
	expect(isNote("x.MD")).toBe(true);
	expect(isPdf("x.pdf.md")).toBe(false);
	expect(samePair("a/S.md", "a/S.PDF")).toBe(true);
});

test("samePair rejects different folder, name, or kinds", () => {
	expect(samePair("a/S.md", "b/S.pdf")).toBe(false);
	expect(samePair("a/S.md", "a/T.pdf")).toBe(false);
	expect(samePair("a/S.pdf", "a/S.pdf")).toBe(false);
	expect(samePair("a/S.md", "a/s.pdf")).toBe(false);
});

test("isInFolder", () => {
	expect(isInFolder("att/x.pdf", "att")).toBe(true);
	expect(isInFolder("att/sub/x.pdf", "att")).toBe(true);
	expect(isInFolder("att", "att")).toBe(true);
	expect(isInFolder("attic/x.pdf", "att")).toBe(false);
	expect(isInFolder("x.pdf", "att")).toBe(false);
});

test("findPathIgnoringCase", () => {
	expect(findPathIgnoringCase(["a/s.md", "a/T.pdf"], "a/S.md")).toBe("a/s.md");
	expect(findPathIgnoringCase(["a/S.md"], "a/S.md")).toBe("a/S.md");
	expect(findPathIgnoringCase(["a/S.pdf", "b/S.md"], "a/S.md")).toBeNull();
	expect(findPathIgnoringCase([], "a/S.md")).toBeNull();
});
