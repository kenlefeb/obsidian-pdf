import { afterEach, expect, test, vi } from "vitest";
import { ExplorerStyle } from "../../src/obsidian/explorer-style.ts";

class FakeSheet {
	text = "";
	replaced = 0;
	replaceSync(text: string): void {
		this.text = text;
		this.replaced++;
	}
}

function fakeDoc(): { adoptedStyleSheets: FakeSheet[] } {
	return { adoptedStyleSheets: [] };
}

const pairs = [{ notePath: "A.md", pdfPath: "A.pdf" }];

afterEach(() => {
	vi.unstubAllGlobals();
	vi.restoreAllMocks();
});

test("adds one sheet, rewrites it only when the rules change, and removes it", () => {
	vi.stubGlobal("CSSStyleSheet", FakeSheet);
	const doc = fakeDoc();
	const style = new ExplorerStyle(doc as unknown as Document);
	style.update(pairs, true);
	style.update(pairs, true);
	expect(doc.adoptedStyleSheets).toHaveLength(1);
	const sheet = doc.adoptedStyleSheets[0]!;
	expect(sheet.replaced).toBe(1);
	expect(sheet.text).toContain('data-path="A.pdf"');
	expect(sheet.text).toContain("display: none");

	style.update(pairs, false);
	expect(sheet.replaced).toBe(2);
	expect(sheet.text).not.toContain("display: none");
	expect(sheet.text).toContain('data-path="A.md"');

	style.update([], true);
	expect(sheet.text).toBe("");

	style.remove();
	expect(doc.adoptedStyleSheets).toHaveLength(0);
});

test("keeps other adopted sheets when removing", () => {
	vi.stubGlobal("CSSStyleSheet", FakeSheet);
	const other = new FakeSheet();
	const doc = { adoptedStyleSheets: [other] };
	const style = new ExplorerStyle(doc as unknown as Document);
	expect(doc.adoptedStyleSheets).toHaveLength(2);
	style.remove();
	expect(doc.adoptedStyleSheets).toEqual([other]);
});

test("does nothing, with one warning, when constructable stylesheets are unavailable", () => {
	vi.stubGlobal("CSSStyleSheet", class {
		constructor() {
			throw new Error("unsupported");
		}
	});
	const warn = vi.spyOn(console, "warn").mockImplementation(() => undefined);
	const doc = fakeDoc();
	const style = new ExplorerStyle(doc as unknown as Document);
	style.update(pairs, true);
	style.update(pairs, false);
	style.remove();
	expect(doc.adoptedStyleSheets).toHaveLength(0);
	expect(warn).toHaveBeenCalledTimes(1);
	expect(String(warn.mock.calls[0]![0])).toMatch(/^PDF Wrapper:/);
});

test("a replaceSync failure disables the sheet with one warning", () => {
	class Broken extends FakeSheet {
		replaceSync(): void {
			throw new Error("bad");
		}
	}
	vi.stubGlobal("CSSStyleSheet", Broken);
	const warn = vi.spyOn(console, "warn").mockImplementation(() => undefined);
	const style = new ExplorerStyle(fakeDoc() as unknown as Document);
	style.update(pairs, true);
	style.update(pairs, false);
	expect(warn).toHaveBeenCalledTimes(1);
});
