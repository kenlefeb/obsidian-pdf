import { expect, test } from 'vitest';
import {
	CTIME_SLACK_MS,
	isPlausibleTemplaterNote,
	newFiles,
	pathList,
	templaterOutcome,
} from '../../src/core/templater-outcome.ts';

// Stand-ins for TFile: identity is the object, as Obsidian keeps the TFile object across a rename.
interface F { path: string; stat: { ctime: number } }
const file = (path: string, ctime = 0): F => ({ path, stat: { ctime } });
const START = 1_000_000;

test('newFiles returns the files present after but not before, by identity, in their order after', () => {
	const a = file('a.md'); const b = file('b.md'); const c = file('c.md'); const d = file('d/e.md');
	expect(newFiles([a, b], [a, c, b, d])).toEqual([c, d]);
	expect(newFiles([a], [a])).toEqual([]);
	expect(newFiles([], [])).toEqual([]);
	expect(newFiles([a, b], [a])).toEqual([]);
});
test('newFiles: a renamed file is the same object, so it is not new', () => {
	const a = file('a.md');
	const before = [a];
	a.path = 'elsewhere/renamed.md';
	expect(newFiles(before, [a])).toEqual([]);
});
test('newFiles: a different object with an old path is new', () => {
	const a = file('a.md');
	const recreated = file('a.md');
	expect(newFiles([a], [recreated])).toEqual([recreated]);
});

test('templaterOutcome: no new note means none, whether or not the call was safe', () => {
	const x = file('x.md');
	expect(templaterOutcome([x], [x], START, true)).toEqual({ kind: 'none' });
	expect(templaterOutcome([x], [], START, true)).toEqual({ kind: 'none' });
	expect(templaterOutcome([x], [x], START, false)).toEqual({ kind: 'none' });
});
test('templaterOutcome: a note renamed during the call is not new, so it gives none', () => {
	const old = file('Notes/Old.md', START - 86_400_000);
	const before = [old];
	old.path = 'Notes/Renamed.md';
	expect(templaterOutcome(before, [old], START, true)).toEqual({ kind: 'none' });
});
test('templaterOutcome: exactly one new note created during the call, identified safely, is a candidate', () => {
	const x = file('x.md');
	expect(templaterOutcome([x], [x, file('elsewhere/S.md', START + 5)], START, true))
		.toEqual({ kind: 'candidate', path: 'elsewhere/S.md' });
	// Within the allowance for coarse file-system timestamps.
	expect(templaterOutcome([], [file('S.md', START - CTIME_SLACK_MS)], START, true))
		.toEqual({ kind: 'candidate', path: 'S.md' });
});
test('templaterOutcome: one new note created before the call started is unclear', () => {
	expect(templaterOutcome([], [file('synced/Old.md', START - CTIME_SLACK_MS - 1)], START, true))
		.toEqual({ kind: 'unclear', paths: ['synced/Old.md'] });
});
test('templaterOutcome: one new note that cannot be identified safely is unclear', () => {
	expect(templaterOutcome([], [file('elsewhere/S.md', START + 5)], START, false))
		.toEqual({ kind: 'unclear', paths: ['elsewhere/S.md'] });
});
test('templaterOutcome: several new notes are unclear and all are named', () => {
	expect(templaterOutcome([], [file('p.md', START), file('q.md', START)], START, true))
		.toEqual({ kind: 'unclear', paths: ['p.md', 'q.md'] });
});

test('pathList names up to three paths and counts the rest', () => {
	expect(pathList(['a.md'])).toBe('a.md');
	expect(pathList(['a.md', 'b.md', 'c.md'])).toBe('a.md, b.md, c.md');
	expect(pathList(['a.md', 'b.md', 'c.md', 'd.md'])).toBe('a.md, b.md, c.md and 1 more');
	expect(pathList(['a.md', 'b.md', 'c.md', 'd.md', 'e.md'])).toBe('a.md, b.md, c.md and 2 more');
});

// isPlausibleTemplaterNote: is a new note plausibly the one Templater just made for `a/S.pdf`?
const PDFS = ['a/S.pdf', 'b/Other.pdf', 'c/S.pdf'];
const plausible = (text: string, marker = 'wrapped-pdf') => isPlausibleTemplaterNote(text, marker, 'a/S.pdf', PDFS);

test('a marker with an empty value is plausible', () => {
	expect(plausible('---\nwrapped-pdf:\ntitle: S\n---\n![[S.pdf]]\n')).toBe(true);
	expect(plausible('---\nwrapped-pdf: ""\n---\n')).toBe(true);
	expect(plausible('---\nwrapped-pdf: \n---\n')).toBe(true);
});
test('a marker naming the PDF being wrapped is plausible, by path or by file name', () => {
	expect(plausible('---\nwrapped-pdf: "[[a/S.pdf|S.pdf]]"\n---\n')).toBe(true);
	expect(plausible('---\nwrapped-pdf: "[[S.pdf]]"\n---\n')).toBe(true);
	expect(plausible("---\nwrapped-pdf: '[[A/s.PDF]]'\n---\n")).toBe(true);
});
test('a marker naming another existing PDF is not plausible', () => {
	expect(plausible('---\nwrapped-pdf: "[[b/Other.pdf|Other.pdf]]"\n---\n')).toBe(false);
	expect(plausible('---\nwrapped-pdf: "[[Other.pdf]]"\n---\n')).toBe(false);
	expect(plausible('---\nwrapped-pdf: "[[c/S.pdf]]"\n---\n')).toBe(false); // same name, other folder, by path
});
test('a marker naming a PDF that does not exist, or no PDF at all, is plausible', () => {
	expect(plausible('---\nwrapped-pdf: "[[gone/Missing.pdf]]"\n---\n')).toBe(true);
	expect(plausible('---\nwrapped-pdf: some text\n---\n')).toBe(true);
});
test('a marker given as a one-item list is read like the inline value', () => {
	expect(plausible('---\nwrapped-pdf:\n  - "[[b/Other.pdf]]"\n---\n')).toBe(false);
	expect(plausible('---\nwrapped-pdf:\n  - "[[a/S.pdf]]"\n---\n')).toBe(true);
});
test('no frontmatter, or frontmatter without the marker, is not plausible', () => {
	expect(plausible('# Daily note\nwrapped-pdf:\n')).toBe(false);
	expect(plausible('---\ntitle: S\ntags: [x]\n---\nwrapped-pdf:\n')).toBe(false);
	expect(plausible('---\nwrapped-pdf-old:\n---\n')).toBe(false);
	expect(plausible('')).toBe(false);
});
test('a quoted marker key is recognised', () => {
	expect(plausible('---\n"wrapped-pdf": ""\n---\n')).toBe(true);
	expect(plausible("---\n'wrapped-pdf': \"[[b/Other.pdf]]\"\n---\n")).toBe(false);
});
test('CRLF line endings and a BOM are handled', () => {
	expect(plausible('---\r\nwrapped-pdf:\r\n---\r\nBody\r\n')).toBe(true);
	expect(plausible('﻿---\r\nwrapped-pdf: "[[b/Other.pdf]]"\r\n---\r\n')).toBe(false);
	expect(plausible('---\r\ntitle: x\r\n---\r\n')).toBe(false);
});
test('a marker name with regular-expression characters is matched literally', () => {
	expect(isPlausibleTemplaterNote('---\npdf.doc:\n---\n', 'pdf.doc', 'a/S.pdf', PDFS)).toBe(true);
	expect(isPlausibleTemplaterNote('---\npdfxdoc:\n---\n', 'pdf.doc', 'a/S.pdf', PDFS)).toBe(false);
});
