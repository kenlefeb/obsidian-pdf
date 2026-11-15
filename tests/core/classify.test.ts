import { expect, test } from 'vitest';
import { classify, healthyPairs } from '../../src/core/classify.ts';
import type { NoteClaim, Snapshot } from '../../src/core/types.ts';

const snap = (notePaths: string[], pdfPaths: string[], claims: NoteClaim[]): Snapshot => ({ notePaths, pdfPaths, claims });
const states = (notes: string[], pdfs: string[], claims: NoteClaim[]) =>
	classify(snap(notes, pdfs, claims)).pairs.map((p) => p.state);
const c = (notePath: string, pdfPath: string | null, rawTarget = pdfPath ?? 'gone.pdf'): NoteClaim => ({ notePath, pdfPath, rawTarget });

test('healthy', () => expect(states(['a/S.md'], ['a/S.pdf'], [c('a/S.md', 'a/S.pdf')])).toEqual(['healthy']));
test('healthy at vault root with upper-case extension', () => expect(states(['S.md'], ['S.PDF'], [c('S.md', 'S.PDF')])).toEqual(['healthy']));
test('missing', () => expect(states(['a/S.md'], [], [c('a/S.md', null)])).toEqual(['missing']));
test('misnamed', () => expect(states(['a/S.md'], ['a/T.pdf'], [c('a/S.md', 'a/T.pdf')])).toEqual(['misnamed']));
test('displaced', () => expect(states(['a/S.md'], ['att/S.pdf'], [c('a/S.md', 'att/S.pdf')])).toEqual(['displaced']));
test('copy of a healthy note is an extra claim; original stays healthy', () =>
	expect(states(['a/S.md', 'a/S 1.md'], ['a/S.pdf'], [c('a/S.md', 'a/S.pdf'), c('a/S 1.md', 'a/S.pdf')])).toEqual(['healthy', 'extra-claim']));
test('two claimants, neither matching, are contested', () =>
	expect(states(['a/X.md', 'b/Y.md'], ['a/S.pdf'], [c('a/X.md', 'a/S.pdf'), c('b/Y.md', 'a/S.pdf')])).toEqual(['contested', 'contested']));
test('unwrapped PDFs are those nobody claims', () =>
	expect(classify(snap(['a/S.md'], ['a/S.pdf', 'a/Lone.pdf', 'Other.pdf'], [c('a/S.md', 'a/S.pdf')])).unwrappedPdfs).toEqual(['a/Lone.pdf', 'Other.pdf']));
test('a misnamed claim still counts as claiming its PDF', () =>
	expect(classify(snap(['a/S.md'], ['a/T.pdf'], [c('a/S.md', 'a/T.pdf')])).unwrappedPdfs).toEqual([]));
test('empty vault', () => expect(classify(snap([], [], []))).toEqual({ pairs: [], unwrappedPdfs: [] }));
test('healthyPairs returns only healthy', () => {
	const result = classify(snap(
		['a/S.md', 'a/X.md'],
		['a/S.pdf', 'a/T.pdf'],
		[c('a/S.md', 'a/S.pdf'), c('a/X.md', 'a/T.pdf')],
	));
	expect(healthyPairs(result)).toEqual([{ notePath: 'a/S.md', pdfPath: 'a/S.pdf' }]);
});
