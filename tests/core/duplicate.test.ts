import { expect, test } from 'vitest';
import { duplicatePaths, leftoverMessage } from '../../src/core/duplicate.ts';
import type { Snapshot } from '../../src/core/types.ts';

const snap = (notePaths: string[], pdfPaths: string[]): Snapshot => ({ notePaths, pdfPaths, claims: [] });

test('picks 1 when nothing is taken', () => {
	expect(duplicatePaths('a/S.md', 'a/S.pdf', snap(['a/S.md'], ['a/S.pdf']))).toEqual({ note: 'a/S 1.md', pdf: 'a/S 1.pdf' });
});

test('skips a number when the note name is taken but the PDF name is free', () => {
	expect(duplicatePaths('a/S.md', 'a/S.pdf', snap(['a/S.md', 'a/S 1.md'], ['a/S.pdf']))).toEqual({ note: 'a/S 2.md', pdf: 'a/S 2.pdf' });
});

test('skips a number when the PDF name is taken but the note name is free', () => {
	expect(duplicatePaths('a/S.md', 'a/S.pdf', snap(['a/S.md'], ['a/S.pdf', 'a/S 1.pdf']))).toEqual({ note: 'a/S 2.md', pdf: 'a/S 2.pdf' });
});

test('compares ignoring letter case', () => {
	expect(duplicatePaths('a/S.md', 'a/S.pdf', snap(['a/S.md', 'a/s 1.MD'], ['a/S.pdf', 'a/S 2.PDF']))).toEqual({ note: 'a/S 3.md', pdf: 'a/S 3.pdf' });
});

test('works in the vault root', () => {
	expect(duplicatePaths('S.md', 'S.pdf', snap(['S.md', 'S 1.md'], ['S.pdf']))).toEqual({ note: 'S 2.md', pdf: 'S 2.pdf' });
});

test('a base name already ending in a number gets another number', () => {
	expect(duplicatePaths('Report 2.md', 'Report 2.pdf', snap(['Report 2.md'], ['Report 2.pdf']))).toEqual({ note: 'Report 2 1.md', pdf: 'Report 2 1.pdf' });
});

test("keeps the PDF's own extension case", () => {
	expect(duplicatePaths('S.md', 'S.PDF', snap(['S.md'], ['S.PDF']))).toEqual({ note: 'S 1.md', pdf: 'S 1.PDF' });
});

test('a name taken in another folder does not count', () => {
	expect(duplicatePaths('a/S.md', 'a/S.pdf', snap(['a/S.md', 'b/S 1.md'], ['a/S.pdf', 'b/S 1.pdf']))).toEqual({ note: 'a/S 1.md', pdf: 'a/S 1.pdf' });
});

const target = { note: 'a/S 1.md', pdf: 'a/S 1.pdf' };

test('no leftover message when the PDF copy did not happen', () => {
	expect(leftoverMessage({ pdf: false, note: false, claim: false }, target, 'wrapped-pdf')).toBeNull();
});

test('PDF copied without a note', () => {
	expect(leftoverMessage({ pdf: true, note: false, claim: false }, target, 'wrapped-pdf')).toBe(
		'Duplicating stopped part way. a/S 1.pdf was created without a note. It is a plain PDF; you can wrap it or delete it.',
	);
});

test('both copied but the claim was not set', () => {
	expect(leftoverMessage({ pdf: true, note: true, claim: false }, target, 'wrapped-pdf')).toBe(
		'Duplicating stopped part way. a/S 1.md and a/S 1.pdf were created, but the note still points at the original PDF. Delete both, or set its "wrapped-pdf" property to the new PDF.',
	);
});

test('no leftover message when everything completed', () => {
	expect(leftoverMessage({ pdf: true, note: true, claim: true }, target, 'wrapped-pdf')).toBeNull();
});
