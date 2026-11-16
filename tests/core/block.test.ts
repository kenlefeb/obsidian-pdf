import { expect, test } from "vitest";
import { BLOCK_LANGUAGE, BLOCK_TEXT, hasBlock, noPdfMessage, blockView, sameBlockView } from "../../src/core/block.ts";

test("block", () => {
	expect(hasBlock("x\n```wrapped-pdf\n```\n")).toBe(true);
	expect(hasBlock("~~~~wrapped-pdf\n~~~~")).toBe(true);
	expect(hasBlock("```wrapped-pdf-x\n```")).toBe(false);
	expect(noPdfMessage("a/My doc.md")).toBe("No PDF named My doc.pdf beside this note.");
});

test("the block text is itself a block", () => {
	expect(BLOCK_LANGUAGE).toBe("wrapped-pdf");
	expect(hasBlock(BLOCK_TEXT)).toBe(true);
	expect(hasBlock(`---\nwrapped-pdf: true\n---\n\n${BLOCK_TEXT}\n`)).toBe(true);
});

test("fence variants", () => {
	expect(hasBlock("``` wrapped-pdf \r\n```\r\n")).toBe(true);
	expect(hasBlock("   ```wrapped-pdf\n   ```")).toBe(true);
	expect(hasBlock("``wrapped-pdf\n``")).toBe(false);
	expect(hasBlock("```js\nwrapped-pdf\n```")).toBe(false);
	expect(hasBlock("```wrapped-pdf x\n```")).toBe(false);
	expect(hasBlock("text ```wrapped-pdf\n```")).toBe(false);
	expect(hasBlock("wrapped-pdf: true")).toBe(false);
});

test("blockView shows the PDF with the note's name among the paths of its folder", () => {
	expect(blockView("a/S.md", ["a/S.md", "a/T.pdf", "a/S.pdf"])).toEqual({ pdfPath: "a/S.pdf" });
	expect(blockView("S.md", ["S.PDF"])).toEqual({ pdfPath: "S.PDF" });
});

test("blockView gives the message when no PDF has the note's name beside it", () => {
	expect(blockView("a/S.md", ["a/S.md", "a/T.pdf", "b/S.pdf", "a/s.pdf"])).toEqual({
		pdfPath: null,
		message: "No PDF named S.pdf beside this note.",
	});
	expect(blockView("a/S.canvas", ["a/S.pdf"])).toEqual({
		pdfPath: null,
		message: "No PDF named S.pdf beside this note.",
	});
});

test("sameBlockView: unchanged PDF path, or the same missing-PDF message", () => {
	expect(sameBlockView({ pdfPath: "a/S.pdf" }, { pdfPath: "a/S.pdf" })).toBe(true);
	expect(sameBlockView({ pdfPath: "a/S.pdf" }, { pdfPath: "b/S.pdf" })).toBe(false);
	expect(sameBlockView({ pdfPath: "a/S.pdf" }, blockView("a/S.md", []))).toBe(false);
	expect(sameBlockView(blockView("a/S.md", []), { pdfPath: "a/S.pdf" })).toBe(false);
	expect(sameBlockView(blockView("a/S.md", []), blockView("b/S.md", []))).toBe(true);
	expect(sameBlockView(blockView("a/S.md", []), blockView("a/T.md", []))).toBe(false);
});
