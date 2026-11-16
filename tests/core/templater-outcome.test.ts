import { expect, test } from 'vitest';
import { newFiles, noteExistedMessage, notesAppearedMessage, pathList, templaterResult } from '../../src/core/templater-outcome.ts';

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

test('(e) a note at the expected path that is new is used, whether Templater returned normally or threw', () => {
	const note = file('a/S.md');
	const stray = file('elsewhere/N.md');
	expect(templaterResult({ threw: false, atPath: note, before: [x], after: [x, note, stray] })).toEqual({ kind: 'use-note' });
	expect(templaterResult({ threw: true, atPath: note, before: [x], after: [x, note] })).toEqual({ kind: 'use-note' });
});
test('a note at the expected path that existed before the call is refused as already there', () => {
	const synced = file('a/S.md');
	expect(templaterResult({ threw: false, atPath: synced, before: [x, synced], after: [x, synced] }))
		.toEqual({ kind: 'note-existed', path: 'a/S.md', others: [] });
	expect(templaterResult({ threw: true, atPath: synced, before: [synced], after: [synced] }))
		.toEqual({ kind: 'note-existed', path: 'a/S.md', others: [] });
});
test('a note at the expected path that existed before, with other new notes: the refusal names them', () => {
	const synced = file('a/S.md');
	expect(templaterResult({ threw: false, atPath: synced, before: [synced], after: [synced, file('a/S 1.md')] }))
		.toEqual({ kind: 'note-existed', path: 'a/S.md', others: ['a/S 1.md'] });
});
test('(a) returned normally, nothing at the expected path, no new notes: the template failed', () => {
	expect(templaterResult({ threw: false, atPath: null, before: [x], after: [x] })).toEqual({ kind: 'template-failed' });
	expect(templaterResult({ threw: false, atPath: null, before: [x], after: [] })).toEqual({ kind: 'template-failed' });
});
test('(a) a note merely renamed during the call is not new', () => {
	const old = file('Notes/Old.md');
	const before = [old];
	old.path = 'Notes/Renamed.md';
	expect(templaterResult({ threw: false, atPath: null, before, after: [old] })).toEqual({ kind: 'template-failed' });
});
test('(b) returned normally, nothing at the expected path, new notes: name them all, take none', () => {
	expect(templaterResult({ threw: false, atPath: null, before: [x], after: [x, file('elsewhere/S.md')] }))
		.toEqual({ kind: 'notes-appeared', threw: false, paths: ['elsewhere/S.md'] });
	expect(templaterResult({ threw: false, atPath: null, before: [], after: [file('p.md'), file('q.md')] }))
		.toEqual({ kind: 'notes-appeared', threw: false, paths: ['p.md', 'q.md'] });
});
test('(c) threw, nothing at the expected path, no new notes: create the note without Templater', () => {
	expect(templaterResult({ threw: true, atPath: null, before: [x], after: [x] })).toEqual({ kind: 'create-manually' });
});
test('(d) threw, nothing at the expected path, new notes: name them, create nothing', () => {
	expect(templaterResult({ threw: true, atPath: null, before: [x], after: [file('S.md'), x] }))
		.toEqual({ kind: 'notes-appeared', threw: true, paths: ['S.md'] });
});

test('the message when Templater returned nothing and notes appeared', () => {
	expect(notesAppearedMessage('S.pdf', 'wrapped-pdf', ['a.md', 'b/c.md'], null)).toBe(
		'Templater did not return a note for S.pdf. Notes created while it ran: a.md, b/c.md. ' +
		'If one of them is its note, move it beside S.pdf and add the "wrapped-pdf" property; otherwise wrap again.');
});
test('the message when Templater threw and notes appeared', () => {
	expect(notesAppearedMessage('S.pdf', 'wrapped-pdf', ['a.md', 'b.md', 'c.md', 'd.md'], 'bad template')).toBe(
		'Templater failed: bad template. Notes created while it ran: a.md, b.md, c.md and 1 more. ' +
		'Nothing was created beside S.pdf; if one of them is its note, move it beside S.pdf and add the "wrapped-pdf" ' +
		'property, otherwise wrap again.');
});
test('the message when a note was already at the expected path', () => {
	expect(noteExistedMessage('S.pdf', 'a/S.md', [])).toBe('Cannot wrap S.pdf: a note already exists at a/S.md.');
	expect(noteExistedMessage('S.pdf', 'a/S.md', ['a/S 1.md'])).toBe(
		'Cannot wrap S.pdf: a note already exists at a/S.md. Notes created while Templater ran, left unchanged: a/S 1.md.');
});

test('pathList names up to three paths and counts the rest', () => {
	expect(pathList(['a.md'])).toBe('a.md');
	expect(pathList(['a.md', 'b.md', 'c.md'])).toBe('a.md, b.md, c.md');
	expect(pathList(['a.md', 'b.md', 'c.md', 'd.md'])).toBe('a.md, b.md, c.md and 1 more');
	expect(pathList(['a.md', 'b.md', 'c.md', 'd.md', 'e.md'])).toBe('a.md, b.md, c.md and 2 more');
});
