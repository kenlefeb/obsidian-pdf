import { expect, test } from "vitest";
import { bodyOffset, findFrontmatter } from "../../src/core/frontmatter.ts";

test("no frontmatter: the body starts at 0", () => {
	expect(bodyOffset("")).toBe(0);
	expect(bodyOffset("text\n---\nmore")).toBe(0);
	expect(bodyOffset("\n---\na: 1\n---\n")).toBe(0);
});

test("the body starts after the closing fence line", () => {
	const t = "---\na: 1\n---\nbody";
	expect(t.slice(bodyOffset(t))).toBe("body");
});

test("CRLF fences", () => {
	const t = "---\r\na: 1\r\n---\r\nbody";
	expect(t.slice(bodyOffset(t))).toBe("body");
});

test("a closing fence at the end of the text leaves an empty body", () => {
	expect(bodyOffset("---\na: 1\n---")).toBe("---\na: 1\n---".length);
});

test("an unclosed fence is not frontmatter", () => {
	expect(bodyOffset("---\na: 1\nbody")).toBe(0);
});

test("a leading BOM is skipped", () => {
	const t = "\uFEFF---\na: 1\n---\nbody";
	expect(t.slice(bodyOffset(t))).toBe("body");
});

test("findFrontmatter gives the block and body offsets", () => {
	expect(findFrontmatter("---\na: 1\n---\nbody")).toEqual({ blockStart: 4, blockEnd: 9, bodyStart: 13 });
	expect(findFrontmatter("---\r\n---\r\nbody")).toEqual({ blockStart: 5, blockEnd: 5, bodyStart: 10 });
	expect(findFrontmatter("---\na: 1\n---")).toEqual({ blockStart: 4, blockEnd: 9, bodyStart: 12 });
	expect(findFrontmatter("---\na: 1\nbody")).toBeNull();
	expect(findFrontmatter("text")).toBeNull();
});

test("findFrontmatter does not skip a BOM; bodyOffset does", () => {
	expect(findFrontmatter("\uFEFF---\na: 1\n---\n")).toBeNull();
	expect(bodyOffset("\uFEFF---\na: 1\n---\nbody")).toBe(14);
});
