import { expect, test } from 'vitest';
import { textLinksToPdf } from '../../src/core/links.ts';

const links = (text: string, pdfPath = 'folder/A.pdf') => textLinksToPdf(text, pdfPath);

test('an embed or wikilink of the PDF by file name', () => {
	expect(links('Merged:\n![[A.pdf]]\n')).toBe(true);
	expect(links('See [[A.pdf]].')).toBe(true);
	expect(links('See [[A.pdf|alias]].')).toBe(true);
});
test('an embed by path with a subpath', () => {
	expect(links('![[folder/A.pdf#page=2]]')).toBe(true);
	expect(links('![[folder/A.pdf#page=2|300]]')).toBe(true);
});
test('a wikilink in frontmatter (a merged claim)', () => {
	expect(links('---\nwrapped-pdf: "[[folder/A.pdf|A.pdf]]"\n---\nBody')).toBe(true);
});
test('the base name alone in a wikilink, which Obsidian may resolve to the PDF', () => {
	expect(links('![[A]]')).toBe(true);
	expect(links('[[folder/A|the statement]]')).toBe(true);
});
test('a markdown link or embed by file name or path', () => {
	expect(links('[x](A.pdf)')).toBe(true);
	expect(links('[x](folder/A.pdf)')).toBe(true);
	expect(links('![x](folder/A.pdf#page=3)')).toBe(true);
	expect(links('[x](<folder/A.pdf>)')).toBe(true);
	expect(links('[x](A.pdf "title")')).toBe(true);
});
test('a URL-encoded markdown link target', () => {
	expect(links('[x](A%20B.pdf)', 'A B.pdf')).toBe(true);
	expect(links('[x](folder/A%20B.pdf)', 'folder/A B.pdf')).toBe(true);
});
test('a malformed percent-encoding is compared as written', () => {
	expect(links('[x](A%ZZ.pdf)', 'A%ZZ.pdf')).toBe(true);
	expect(links('[x](B%ZZ.pdf)', 'A.pdf')).toBe(false);
});
test('letter case does not matter', () => {
	expect(links('![[a.PDF]]')).toBe(true);
	expect(links('[x](FOLDER/a.pdf)')).toBe(true);
	expect(links('[[a]]')).toBe(true);
});
test('a bare mention in prose is not a link', () => {
	expect(links('The statement A.pdf was merged here. folder/A.pdf')).toBe(false);
});
test('a different PDF whose name merely contains this one is not a link to it', () => {
	expect(links('![[AA.pdf]] [[folder/AA.pdf]] [x](AA.pdf) [[AA]] [[A.pdf.bak]]')).toBe(false);
	expect(links('![[BA.pdf]] [x](folder/BA.pdf)')).toBe(false);
});
test('links to other files are not links to it', () => {
	expect(links('[[B.pdf]] ![[other/C.pdf]] [x](https://example.com/page)')).toBe(false);
	expect(links('')).toBe(false);
});
test('a markdown link to a PDF whose name contains parentheses, percent-encoded or in angle brackets', () => {
	expect(links('[x](A%20(1).pdf)', 'folder/A (1).pdf')).toBe(true);
	expect(links('[x](folder/A%20(1).pdf#page=2 "t")', 'folder/A (1).pdf')).toBe(true);
	expect(links('[x](<A (1).pdf>)', 'folder/A (1).pdf')).toBe(true);
	expect(links('![x](<folder/A (1).pdf>) and more (text)', 'folder/A (1).pdf')).toBe(true);
	expect(links('[x](A%20(2).pdf)', 'folder/A (1).pdf')).toBe(false);
});
test('a wikilink with an escaped pipe, as in a table', () => {
	expect(links('| doc | [[A.pdf\\|alias]] |')).toBe(true);
	expect(links('| doc | ![[folder/A.pdf\\|300]] |')).toBe(true);
});
test('a markdown link whose text holds brackets', () => {
	expect(links('[see [1]](A.pdf)')).toBe(true);
	expect(links('[see [1] and [2]](folder/A.pdf)')).toBe(true);
});
test('a 200 KB line of unclosed markdown links is read quickly, and a real link after it is still found', () => {
	const junk = '[x]('.repeat(50_000);
	const started = Date.now();
	expect(links(`${junk}\nSee [the statement](folder/A.pdf).`)).toBe(true);
	expect(links(junk)).toBe(false);
	expect(Date.now() - started).toBeLessThan(1000);
});
test('a 200 KB line of unclosed wikilinks is read quickly, and a real link after it is still found', () => {
	const junk = '[[x'.repeat(70_000);
	const started = Date.now();
	expect(links(`${junk}\n![[A.pdf]]`)).toBe(true);
	expect(links(junk)).toBe(false);
	expect(Date.now() - started).toBeLessThan(1000);
});
test('a markdown link target longer than 2048 characters counts as a link only if it holds the file name', () => {
	expect(links(`[x](${'d/'.repeat(1000)}A.pdf)`)).toBe(true);
	expect(links(`[x](${'d/'.repeat(1100)}A.pdf)`)).toBe(true);
	expect(links(`[x](${'d/'.repeat(1100)}a.PDF#page=2)`)).toBe(true);
	expect(links(`[x](${'d/'.repeat(1100)}A%20B.pdf)`, 'A B.pdf')).toBe(true);
	expect(links(`[x](${'d/'.repeat(1100)}B.pdf)`)).toBe(false);
	expect(links(`[x](<${'d/'.repeat(1100)}A.pdf>)`)).toBe(true);
});
