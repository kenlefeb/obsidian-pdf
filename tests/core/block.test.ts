import { expect, test } from "vitest";
import { BLOCK_LANGUAGE, BLOCK_TEXT, hasBlock, noPdfMessage } from "../../src/core/block.ts";

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
