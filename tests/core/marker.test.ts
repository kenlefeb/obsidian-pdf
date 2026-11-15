import { expect, test } from "vitest";
import { isMarked, isTemplatePath, markerLinkTarget, selfLinked } from "../../src/core/marker.ts";
import type { MarkedNote } from "../../src/core/model.ts";

test.each([true, "true", "yes", 1, "[[A.pdf]]", ["[[A.pdf]]"]])("marked: %j", (v) => expect(isMarked(v)).toBe(true));
test.each([false, "false", " False ", "", "  ", null, undefined, []])("not marked: %j", (v) => expect(isMarked(v)).toBe(false));

test("a list counts as marked only if one of its entries does", () => {
	expect(isMarked([false, ""])).toBe(false);
	expect(isMarked(["", true])).toBe(true);
});

test("link target only for PDF links", () => {
	expect(markerLinkTarget("[[sub/A.pdf|scan]]")).toBe("sub/A.pdf");
	expect(markerLinkTarget(true)).toBeNull();
	expect(markerLinkTarget("[[A.md]]")).toBeNull();
});

test("link target without subpath, from a one-entry list, not from a longer list", () => {
	expect(markerLinkTarget(" [[A.pdf#page=2]] ")).toBe("A.pdf");
	expect(markerLinkTarget(["[[A.pdf]]"])).toBe("A.pdf");
	expect(markerLinkTarget(["[[A.pdf]]", "[[B.pdf]]"])).toBeNull();
	expect(markerLinkTarget("A.pdf")).toBeNull();
});

test("self-linked when the marker is a link or the note links to its PDF", () => {
	const plain: MarkedNote = { notePath: "a/A.md", markerLink: null, linkedPdf: null, ownTargets: [] };
	expect(selfLinked(plain)).toBe(false);
	expect(selfLinked({ ...plain, ownTargets: ["A.pdf"] })).toBe(true);
	// A link-valued marker counts even when it resolves to nothing.
	expect(selfLinked({ ...plain, markerLink: "Gone.pdf" })).toBe(true);
});

test("template locations", () => {
	const where = { templatePath: "T/Wrapped PDF", templaterFolder: "T", coreTemplatesFolder: "" };
	expect(isTemplatePath("T/Wrapped PDF.md", where)).toBe(true);
	expect(isTemplatePath("T/deep/x.md", where)).toBe(true);
	expect(isTemplatePath("Notes/x.md", where)).toBe(false);
	expect(isTemplatePath("Notes/x.md", { templatePath: "", templaterFolder: "/", coreTemplatesFolder: "" })).toBe(false);
});

test("template path with its extension, and the core Templates folder", () => {
	const where = { templatePath: "Meta/Wrapped PDF.md", templaterFolder: null, coreTemplatesFolder: "Core" };
	expect(isTemplatePath("Meta/Wrapped PDF.md", where)).toBe(true);
	expect(isTemplatePath("Meta/Other.md", where)).toBe(false);
	expect(isTemplatePath("Core/x.md", where)).toBe(true);
	expect(isTemplatePath("Core2/x.md", where)).toBe(false);
});
