import { expect, test } from "vitest";
import { buildExplorerCss, cssAttrValue } from "../../src/core/explorer-css.ts";

test("empty", () => expect(buildExplorerCss([], { hide: true })).toBe(""));

test("hides the PDF row and marks the note", () => {
	const css = buildExplorerCss([{ notePath: "a/S.md", pdfPath: "a/S.pdf" }], { hide: true });
	expect(css).toContain('.nav-file:has(> .nav-file-title[data-path="a/S.pdf"])');
	expect(css).toContain("display: none");
	expect(css).toContain('[data-path="a/S.md"]');
});

test("hide off keeps the marker but emits no hiding rule", () => {
	const css = buildExplorerCss([{ notePath: "a/S.md", pdfPath: "a/S.pdf" }], { hide: false });
	expect(css).not.toContain("display: none");
	expect(css).toContain('[data-path="a/S.md"]');
});

test("escapes quotes and backslashes", () => {
	expect(cssAttrValue('a/say "hi"\\x.pdf')).toBe('a/say \\"hi\\"\\\\x.pdf');
	expect(buildExplorerCss([{ notePath: 'a/q"q.md', pdfPath: 'a/q"q.pdf' }], { hide: true })).toContain('[data-path="a/q\\"q.pdf"]');
});

test("output parses as a stylesheet with two rules per pair", () => {
	const pairs = [1, 2, 3].map((n) => ({ notePath: `d/N${n}.md`, pdfPath: `d/N${n}.pdf` }));
	const css = buildExplorerCss(pairs, { hide: true });
	// Rule blocks are not nested, so every "{" opens exactly one rule and each is closed by a "}".
	expect(css.match(/\{/g)?.length).toBe(6);
	expect(css.match(/\}/g)?.length).toBe(6);
	expect(buildExplorerCss(pairs, { hide: false }).match(/\{/g)?.length).toBe(3);
});
