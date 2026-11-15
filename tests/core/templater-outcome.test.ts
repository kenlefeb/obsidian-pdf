import { expect, test } from 'vitest';
import { newFiles, pathList, templaterResult } from '../../src/core/templater-outcome.ts';

// Stand-ins for TFile: identity is the object, as Obsidian keeps the TFile object across a rename.
interface F { path: string }
const file = (path: string): F => ({ path });

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

// templaterResult: Templater returned no note. Decided from the vault after the call.
const x = file('x.md');

test('(e) a note at the expected path is used, whether Templater returned normally or threw', () => {
	const stray = file('elsewhere/N.md');
	expect(templaterResult({ threw: false, noteAtExpectedPath: true, before: [x], after: [x, stray] })).toEqual({ kind: 'use-note' });
	expect(templaterResult({ threw: true, noteAtExpectedPath: true, before: [x], after: [x, stray] })).toEqual({ kind: 'use-note' });
});
test('(a) returned normally, nothing at the expected path, no new notes: the template failed', () => {
	expect(templaterResult({ threw: false, noteAtExpectedPath: false, before: [x], after: [x] })).toEqual({ kind: 'template-failed' });
	expect(templaterResult({ threw: false, noteAtExpectedPath: false, before: [x], after: [] })).toEqual({ kind: 'template-failed' });
});
test('(a) a note merely renamed during the call is not new', () => {
	const old = file('Notes/Old.md');
	const before = [old];
	old.path = 'Notes/Renamed.md';
	expect(templaterResult({ threw: false, noteAtExpectedPath: false, before, after: [old] })).toEqual({ kind: 'template-failed' });
});
test('(b) returned normally, nothing at the expected path, new notes: name them all, take none', () => {
	expect(templaterResult({ threw: false, noteAtExpectedPath: false, before: [x], after: [x, file('elsewhere/S.md')] }))
		.toEqual({ kind: 'notes-appeared', threw: false, paths: ['elsewhere/S.md'] });
	expect(templaterResult({ threw: false, noteAtExpectedPath: false, before: [], after: [file('p.md'), file('q.md')] }))
		.toEqual({ kind: 'notes-appeared', threw: false, paths: ['p.md', 'q.md'] });
});
test('(c) threw, nothing at the expected path, no new notes: create the note without Templater', () => {
	expect(templaterResult({ threw: true, noteAtExpectedPath: false, before: [x], after: [x] })).toEqual({ kind: 'create-manually' });
});
test('(d) threw, nothing at the expected path, new notes: name them, create nothing', () => {
	expect(templaterResult({ threw: true, noteAtExpectedPath: false, before: [x], after: [file('S.md'), x] }))
		.toEqual({ kind: 'notes-appeared', threw: true, paths: ['S.md'] });
});

test('pathList names up to three paths and counts the rest', () => {
	expect(pathList(['a.md'])).toBe('a.md');
	expect(pathList(['a.md', 'b.md', 'c.md'])).toBe('a.md, b.md, c.md');
	expect(pathList(['a.md', 'b.md', 'c.md', 'd.md'])).toBe('a.md, b.md, c.md and 1 more');
	expect(pathList(['a.md', 'b.md', 'c.md', 'd.md', 'e.md'])).toBe('a.md, b.md, c.md and 2 more');
});
