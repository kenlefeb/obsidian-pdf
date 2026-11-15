import { expect, test } from 'vitest';
import { buildAttention, bulkWrapChecker, candidatesForMissing, fixesFor, isBulkFixable, isBulkWrappable, isCurrent, planFix } from '../../src/core/fixes.ts';
import { classify } from '../../src/core/classify.ts';
import type { Action, AttentionItem, AttentionKind, NoteClaim, Snapshot } from '../../src/core/types.ts';

const snap = (notePaths: string[], pdfPaths: string[], claims: NoteClaim[]): Snapshot => ({ notePaths, pdfPaths, claims });
const c = (notePath: string, pdfPath: string | null, rawTarget = pdfPath ?? 'gone.pdf'): NoteClaim => ({ notePath, pdfPath, rawTarget });
const item = (kind: AttentionKind, notePath: string | null, pdfPath: string | null, rawTarget: string | null = pdfPath): AttentionItem =>
	({ kind, notePath, pdfPath, rawTarget });
const STALE = [{ type: 'notice', message: 'This has changed since it was listed. Check the list again.' }];
const noticeOnly = (actions: Action[]) => {
	expect(actions).toHaveLength(1);
	expect(actions[0]?.type).toBe('notice');
};

test('fixesFor offers the right fixes, default first, for all seven kinds', () => {
	expect(fixesFor('missing')).toEqual(['choose-pdf', 'remove-claim']);
	expect(fixesFor('misnamed')).toEqual(['rename-pdf-to-note', 'rename-note-to-pdf']);
	expect(fixesFor('displaced')).toEqual(['move-pdf-to-note']);
	expect(fixesFor('extra-claim')).toEqual(['copy-pdf-for-note', 'remove-claim']);
	expect(fixesFor('contested')).toEqual(['move-pdf-to-note', 'copy-pdf-for-note', 'remove-claim']);
	expect(fixesFor('note-removed')).toEqual(['keep-plain', 'wrap', 'delete-pdf']);
	expect(fixesFor('unwrapped')).toEqual(['wrap']);
});

// buildAttention
test('buildAttention lists one item per non-healthy pair and skips healthy ones', () => {
	const s = snap(['a/S.md', 'a/T.md', 'a/U.md'], ['a/S.pdf', 'a/X.pdf'], [c('a/S.md', 'a/S.pdf'), c('a/T.md', 'a/X.pdf'), c('a/U.md', null, 'U.pdf')]);
	expect(buildAttention(classify(s), [], { includeUnwrapped: false, attachmentFolder: null })).toEqual([
		{ kind: 'misnamed', notePath: 'a/T.md', pdfPath: 'a/X.pdf', rawTarget: 'a/X.pdf' },
		{ kind: 'missing', notePath: 'a/U.md', pdfPath: null, rawTarget: 'U.pdf' }]);
});
test('buildAttention reports a pending removal while its PDF is still unclaimed', () => {
	const s = snap([], ['a/S.pdf'], []);
	expect(buildAttention(classify(s), ['a/S.pdf'], { includeUnwrapped: false, attachmentFolder: null })).toEqual([
		{ kind: 'note-removed', notePath: null, pdfPath: 'a/S.pdf', rawTarget: null }]);
});
test('buildAttention drops a pending removal whose PDF is gone', () => {
	const s = snap([], [], []);
	expect(buildAttention(classify(s), ['a/S.pdf'], { includeUnwrapped: true, attachmentFolder: null })).toEqual([]);
});
test('buildAttention drops a pending removal whose PDF is claimed again', () => {
	const s = snap(['a/S.md'], ['a/S.pdf'], [c('a/S.md', 'a/S.pdf')]);
	expect(buildAttention(classify(s), ['a/S.pdf'], { includeUnwrapped: true, attachmentFolder: null })).toEqual([]);
});
test('buildAttention lists unwrapped PDFs only when asked', () => {
	const cl = classify(snap([], ['a/S.pdf'], []));
	expect(buildAttention(cl, [], { includeUnwrapped: false, attachmentFolder: null })).toEqual([]);
	expect(buildAttention(cl, [], { includeUnwrapped: true, attachmentFolder: null })).toEqual([
		{ kind: 'unwrapped', notePath: null, pdfPath: 'a/S.pdf', rawTarget: null }]);
});
test('buildAttention leaves out unwrapped PDFs inside the attachment folder, at any depth', () => {
	const cl = classify(snap([], ['att/S.pdf', 'att/deep/T.pdf', 'attic/U.pdf'], []));
	expect(buildAttention(cl, [], { includeUnwrapped: true, attachmentFolder: 'att' }).map((i) => i.pdfPath)).toEqual(['attic/U.pdf']);
});
test('buildAttention does not list a pending PDF a second time as unwrapped', () => {
	const cl = classify(snap([], ['a/S.pdf', 'a/T.pdf'], []));
	expect(buildAttention(cl, ['a/S.pdf'], { includeUnwrapped: true, attachmentFolder: null })).toEqual([
		{ kind: 'note-removed', notePath: null, pdfPath: 'a/S.pdf', rawTarget: null },
		{ kind: 'unwrapped', notePath: null, pdfPath: 'a/T.pdf', rawTarget: null }]);
});

test('buildAttention leaves out an unwrapped PDF with a same-name note beside it, ignoring letter case', () => {
	const s = snap(['a/s.MD', 'b/T.md', 'a/U 1.md'], ['a/S.pdf', 'a/T.pdf', 'a/U.pdf'], []);
	expect(buildAttention(classify(s), [], { includeUnwrapped: true, attachmentFolder: null, notePaths: s.notePaths }).map((i) => i.pdfPath))
		.toEqual(['a/T.pdf', 'a/U.pdf']);
});
test('buildAttention still lists a note-removed PDF whose note is back unclaimed', () => {
	const s = snap(['a/S.md'], ['a/S.pdf'], []);
	expect(buildAttention(classify(s), ['a/S.pdf'], { includeUnwrapped: true, attachmentFolder: null, notePaths: s.notePaths }))
		.toEqual([{ kind: 'note-removed', notePath: null, pdfPath: 'a/S.pdf', rawTarget: null }]);
});

// isBulkWrappable
test('isBulkWrappable is true for a current unwrapped PDF with no note beside it', () => {
	const s = snap(['b/S.md'], ['a/S.pdf'], []);
	expect(isBulkWrappable(item('unwrapped', null, 'a/S.pdf', null), s)).toBe(true);
	expect(isBulkWrappable(item('unwrapped', null, 'a/S.pdf', null), s, classify(s))).toBe(true);
});
test('isBulkWrappable is false when a same-name note sits beside the PDF, even unclaimed or in another case', () => {
	expect(isBulkWrappable(item('unwrapped', null, 'a/S.pdf', null), snap(['a/S.md'], ['a/S.pdf'], []))).toBe(false);
	expect(isBulkWrappable(item('unwrapped', null, 'a/S.pdf', null), snap(['A/s.md'], ['a/S.pdf'], []))).toBe(false);
});
test('isBulkWrappable is false for a claimed PDF, a gone PDF and other kinds', () => {
	const claimed = snap(['b/T.md'], ['a/S.pdf'], [c('b/T.md', 'a/S.pdf')]);
	expect(isBulkWrappable(item('unwrapped', null, 'a/S.pdf', null), claimed)).toBe(false);
	expect(isBulkWrappable(item('unwrapped', null, 'a/S.pdf', null), snap([], [], []))).toBe(false);
	expect(isBulkWrappable(item('note-removed', null, 'a/S.pdf', null), snap([], ['a/S.pdf'], []))).toBe(false);
});

test('isBulkWrappable is false for a PDF whose name cannot be linked', () => {
	for (const name of ['a/S [1].pdf', 'a/S|x.pdf', 'a/S#1.pdf', 'a/S^1.pdf']) {
		expect([name, isBulkWrappable(item('unwrapped', null, name, null), snap([], [name], []))]).toEqual([name, false]);
	}
});

// bulkWrapChecker: the same test for every entry of one snapshot, indexed once
test('bulkWrapChecker and isBulkWrappable give the expected answer for each entry of one snapshot', () => {
	const s = snap(['a/s.MD', 'b/T.md', 'c/U.txt', 'X.md'],
		['a/S.pdf', 'a/T.pdf', 'b/V.pdf', 'c/U.pdf', 'd/W [1].pdf', 'X.pdf', 'e/Y.pdf'],
		[c('X.md', 'e/Y.pdf')]);
	const cases: [AttentionItem, boolean][] = [
		[item('unwrapped', null, 'a/S.pdf', null), false],    // note beside it, other letter case
		[item('unwrapped', null, 'a/T.pdf', null), true],     // the note of that name is in another folder
		[item('unwrapped', null, 'b/V.pdf', null), true],
		[item('unwrapped', null, 'c/U.pdf', null), true],     // a .txt of that name is not a note
		[item('unwrapped', null, 'd/W [1].pdf', null), false], // name cannot be linked
		[item('unwrapped', null, 'X.pdf', null), false],      // X.md is beside it, at the vault root
		[item('unwrapped', null, 'e/Y.pdf', null), false],    // claimed
		[item('unwrapped', null, 'gone.pdf', null), false],   // not in the vault
		[item('note-removed', null, 'b/V.pdf', null), false], // other kinds
		[item('unwrapped', null, null, null), false],
	];
	const check = bulkWrapChecker(s, classify(s));
	for (const [entry, expected] of cases) {
		expect([entry.pdfPath, entry.kind, check(entry)]).toEqual([entry.pdfPath, entry.kind, expected]);
		expect([entry.pdfPath, entry.kind, isBulkWrappable(entry, s)]).toEqual([entry.pdfPath, entry.kind, expected]);
	}
});
test('bulkWrapChecker works without a precomputed classification', () => {
	const s = snap([], ['a/S.pdf'], []);
	expect(bulkWrapChecker(s)(item('unwrapped', null, 'a/S.pdf', null))).toBe(true);
});

// planFix: missing
test('missing → remove-claim', () => {
	expect(planFix(item('missing', 'a/S.md', null, 'gone.pdf'), 'remove-claim', snap(['a/S.md'], [], [c('a/S.md', null)])))
		.toEqual([{ type: 'removeClaim', notePath: 'a/S.md' }]);
});
test('choose-pdf moves the chosen PDF beside the note', () => {
	const s = snap(['a/S.md'], ['att/Scan 3.pdf'], [c('a/S.md', null)]);
	expect(planFix(item('missing', 'a/S.md', null, 'gone.pdf'), 'choose-pdf', s, 'att/Scan 3.pdf')).toEqual([
		{ type: 'rename', from: 'att/Scan 3.pdf', to: 'a/S.pdf' },
		{ type: 'setClaim', notePath: 'a/S.md', pdfPath: 'a/S.pdf', oldTargets: ['att/Scan 3.pdf', 'Scan 3.pdf', 'Scan 3', 'gone.pdf', 'gone'] }]);
});
test('choose-pdf keeps the chosen PDF extension case', () => {
	const s = snap(['a/S.md'], ['att/Scan.PDF'], [c('a/S.md', null)]);
	expect(planFix(item('missing', 'a/S.md', null), 'choose-pdf', s, 'att/Scan.PDF')[0]).toEqual({ type: 'rename', from: 'att/Scan.PDF', to: 'a/S.PDF' });
});
test('choose-pdf with the PDF already beside the note only sets the claim', () => {
	const s = snap(['a/S.md'], ['a/S.pdf'], [c('a/S.md', null)]);
	expect(planFix(item('missing', 'a/S.md', null, 'gone.pdf'), 'choose-pdf', s, 'a/S.pdf'))
		.toEqual([{ type: 'setClaim', notePath: 'a/S.md', pdfPath: 'a/S.pdf', oldTargets: ['gone.pdf', 'gone'] }]);
});
test('choose-pdf destination taken → notice only', () => {
	const s = snap(['a/S.md'], ['att/Scan.pdf', 'a/S.PDF'], [c('a/S.md', null)]);
	noticeOnly(planFix(item('missing', 'a/S.md', null), 'choose-pdf', s, 'att/Scan.pdf'));
});
test('choose-pdf without a chosen PDF is an error', () => {
	expect(() => planFix(item('missing', 'a/S.md', null), 'choose-pdf', snap(['a/S.md'], [], [c('a/S.md', null)]))).toThrow();
});

// planFix: misnamed
test('misnamed → rename-pdf-to-note', () => {
	const s = snap(['a/S.md'], ['a/Scan 3.pdf'], [c('a/S.md', 'a/Scan 3.pdf')]);
	expect(planFix(item('misnamed', 'a/S.md', 'a/Scan 3.pdf'), 'rename-pdf-to-note', s)).toEqual([
		{ type: 'rename', from: 'a/Scan 3.pdf', to: 'a/S.pdf' },
		{ type: 'setClaim', notePath: 'a/S.md', pdfPath: 'a/S.pdf', oldTargets: ['a/Scan 3.pdf', 'Scan 3.pdf', 'Scan 3'] }]);
});
test('rename-pdf-to-note destination taken (ignoring case) → notice only', () => {
	const s = snap(['a/S.md'], ['a/Scan 3.pdf', 'a/S.pdf'], [c('a/S.md', 'a/Scan 3.pdf')]);
	noticeOnly(planFix(item('misnamed', 'a/S.md', 'a/Scan 3.pdf'), 'rename-pdf-to-note', s));
	const s2 = snap(['a/S.md'], ['a/Scan 3.pdf', 'a/s.PDF'], [c('a/S.md', 'a/Scan 3.pdf')]);
	noticeOnly(planFix(item('misnamed', 'a/S.md', 'a/Scan 3.pdf'), 'rename-pdf-to-note', s2));
});
test('rename-pdf-to-note allows a rename that only changes letter case, and keeps extension case', () => {
	const s = snap(['a/S.md'], ['a/s.PDF'], [c('a/S.md', 'a/s.PDF')]);
	expect(planFix(item('misnamed', 'a/S.md', 'a/s.PDF'), 'rename-pdf-to-note', s)).toEqual([
		{ type: 'rename', from: 'a/s.PDF', to: 'a/S.PDF' },
		{ type: 'setClaim', notePath: 'a/S.md', pdfPath: 'a/S.PDF', oldTargets: ['a/s.PDF', 's.PDF', 's'] }]);
});
test('rename-note-to-pdf', () => {
	const s = snap(['a/S.md'], ['a/T.pdf'], [c('a/S.md', 'a/T.pdf')]);
	expect(planFix(item('misnamed', 'a/S.md', 'a/T.pdf'), 'rename-note-to-pdf', s)).toEqual([
		{ type: 'rename', from: 'a/S.md', to: 'a/T.md' },
		{ type: 'setClaim', notePath: 'a/T.md', pdfPath: 'a/T.pdf', oldTargets: ['a/T.pdf', 'T.pdf', 'T'] }]);
});
test('rename-note-to-pdf destination taken → notice only', () => {
	const s = snap(['a/S.md', 'a/t.md'], ['a/T.pdf'], [c('a/S.md', 'a/T.pdf')]);
	noticeOnly(planFix(item('misnamed', 'a/S.md', 'a/T.pdf'), 'rename-note-to-pdf', s));
});

// planFix: displaced
test('displaced → move beside note', () => {
	const s = snap(['a/S.md'], ['att/Scan 3.pdf'], [c('a/S.md', 'att/Scan 3.pdf')]);
	expect(planFix(item('displaced', 'a/S.md', 'att/Scan 3.pdf'), 'move-pdf-to-note', s)).toEqual([
		{ type: 'rename', from: 'att/Scan 3.pdf', to: 'a/S.pdf' },
		{ type: 'setClaim', notePath: 'a/S.md', pdfPath: 'a/S.pdf', oldTargets: ['att/Scan 3.pdf', 'Scan 3.pdf', 'Scan 3'] }]);
});
test('displaced into the vault root joins without a leading slash', () => {
	const s = snap(['S.md'], ['att/Scan.pdf'], [c('S.md', 'att/Scan.pdf')]);
	expect(planFix(item('displaced', 'S.md', 'att/Scan.pdf'), 'move-pdf-to-note', s)[0]).toEqual({ type: 'rename', from: 'att/Scan.pdf', to: 'S.pdf' });
});
test('destination taken → notice only', () => {
	const s = snap(['a/S.md'], ['att/Scan 3.pdf', 'a/S.pdf'], [c('a/S.md', 'att/Scan 3.pdf')]);
	const actions = planFix(item('displaced', 'a/S.md', 'att/Scan 3.pdf'), 'move-pdf-to-note', s);
	expect(actions).toEqual([{ type: 'notice', message: 'Could not move att/Scan 3.pdf to a/S.pdf: a file with that name already exists.' }]);
});

// planFix: extra-claim
test('extra claim → copy the PDF for the copy', () => {
	const s = snap(['a/S.md', 'a/S 1.md'], ['a/S.pdf'], [c('a/S.md', 'a/S.pdf'), c('a/S 1.md', 'a/S.pdf')]);
	expect(planFix(item('extra-claim', 'a/S 1.md', 'a/S.pdf'), 'copy-pdf-for-note', s)).toEqual([
		{ type: 'copy', from: 'a/S.pdf', to: 'a/S 1.pdf' },
		{ type: 'setClaim', notePath: 'a/S 1.md', pdfPath: 'a/S 1.pdf', oldTargets: ['a/S.pdf', 'S.pdf', 'S'] }]);
});
test('copy-pdf-for-note destination taken → notice only', () => {
	const s = snap(['a/S.md', 'a/S 1.md'], ['a/S.pdf', 'a/s 1.pdf'], [c('a/S.md', 'a/S.pdf'), c('a/S 1.md', 'a/S.pdf')]);
	noticeOnly(planFix(item('extra-claim', 'a/S 1.md', 'a/S.pdf'), 'copy-pdf-for-note', s));
});
test('copy-pdf-for-note never copies a file onto itself, even when the names differ only by case', () => {
	const s = snap(['a/s.md', 'b/T.md'], ['a/S.pdf'], [c('a/s.md', 'a/S.pdf'), c('b/T.md', 'a/S.pdf')]);
	noticeOnly(planFix(item('contested', 'a/s.md', 'a/S.pdf'), 'copy-pdf-for-note', s));
});
test('extra claim → remove-claim', () => {
	expect(planFix(item('extra-claim', 'a/S 1.md', 'a/S.pdf'), 'remove-claim',
		snap(['a/S.md', 'a/S 1.md'], ['a/S.pdf'], [c('a/S.md', 'a/S.pdf'), c('a/S 1.md', 'a/S.pdf')])))
		.toEqual([{ type: 'removeClaim', notePath: 'a/S 1.md' }]);
});

// planFix: contested
test('contested → move-pdf-to-note', () => {
	const s = snap(['a/S.md', 'b/T.md'], ['att/X.pdf'], [c('a/S.md', 'att/X.pdf'), c('b/T.md', 'att/X.pdf')]);
	expect(planFix(item('contested', 'a/S.md', 'att/X.pdf'), 'move-pdf-to-note', s)).toEqual([
		{ type: 'rename', from: 'att/X.pdf', to: 'a/S.pdf' },
		{ type: 'setClaim', notePath: 'a/S.md', pdfPath: 'a/S.pdf', oldTargets: ['att/X.pdf', 'X.pdf', 'X'] }]);
});
test('contested move-pdf-to-note destination taken → notice only', () => {
	const s = snap(['a/S.md', 'b/T.md'], ['att/X.pdf', 'a/S.pdf'], [c('a/S.md', 'att/X.pdf'), c('b/T.md', 'att/X.pdf')]);
	noticeOnly(planFix(item('contested', 'a/S.md', 'att/X.pdf'), 'move-pdf-to-note', s));
});
test('contested → copy-pdf-for-note', () => {
	const s = snap(['a/S.md', 'b/T.md'], ['att/X.pdf'], [c('a/S.md', 'att/X.pdf'), c('b/T.md', 'att/X.pdf')]);
	expect(planFix(item('contested', 'b/T.md', 'att/X.pdf'), 'copy-pdf-for-note', s)).toEqual([
		{ type: 'copy', from: 'att/X.pdf', to: 'b/T.pdf' },
		{ type: 'setClaim', notePath: 'b/T.md', pdfPath: 'b/T.pdf', oldTargets: ['att/X.pdf', 'X.pdf', 'X'] }]);
});
test('contested copy-pdf-for-note destination taken → notice only', () => {
	const s = snap(['a/S.md', 'b/T.md'], ['att/X.pdf', 'b/T.pdf'], [c('a/S.md', 'att/X.pdf'), c('b/T.md', 'att/X.pdf')]);
	noticeOnly(planFix(item('contested', 'b/T.md', 'att/X.pdf'), 'copy-pdf-for-note', s));
});
test('contested → remove-claim', () => {
	expect(planFix(item('contested', 'b/T.md', 'att/X.pdf'), 'remove-claim',
		snap(['a/S.md', 'b/T.md'], ['att/X.pdf'], [c('a/S.md', 'att/X.pdf'), c('b/T.md', 'att/X.pdf')])))
		.toEqual([{ type: 'removeClaim', notePath: 'b/T.md' }]);
});

// planFix: note-removed and unwrapped
test('delete-pdf and keep-plain', () => {
	const s = snap([], ['a/S.pdf'], []);
	const removed = item('note-removed', null, 'a/S.pdf', null);
	expect(planFix(removed, 'delete-pdf', s)).toEqual([{ type: 'delete', path: 'a/S.pdf' }]);
	expect(planFix(removed, 'keep-plain', s)).toEqual([]);
});
test('wrap, for a removed note and for an unwrapped PDF', () => {
	const s = snap([], ['a/S.pdf'], []);
	expect(planFix(item('note-removed', null, 'a/S.pdf', null), 'wrap', s)).toEqual([{ type: 'wrap', pdfPath: 'a/S.pdf' }]);
	expect(planFix(item('unwrapped', null, 'a/S.pdf', null), 'wrap', s)).toEqual([{ type: 'wrap', pdfPath: 'a/S.pdf' }]);
});


test('candidatesForMissing orders same-folder first and skips claimed PDFs', () => {
	const s = snap(['a/S.md', 'b/Other.md'],
		['att/S.pdf', 'a/Zed.pdf', 'att/Old name.pdf', 'att/Unrelated.pdf', 'b/Taken.pdf', 'a/S.pdf'],
		[c('b/Other.md', 'b/Taken.pdf'), c('a/S.md', null, 'Old name.pdf')]);
	const missing = item('missing', 'a/S.md', null, 'Old name.pdf');
	expect(candidatesForMissing(missing, classify(s))).toEqual(['a/S.pdf', 'a/Zed.pdf', 'att/S.pdf', 'att/Old name.pdf']);
});
test('candidatesForMissing has no duplicates and no candidates for an item without a note', () => {
	const s = snap(['a/S.md'], ['a/S.pdf'], [c('a/S.md', null, 'S.pdf')]);
	expect(candidatesForMissing(item('missing', 'a/S.md', null, 'S.pdf'), classify(s))).toEqual(['a/S.pdf']);
	expect(candidatesForMissing(item('unwrapped', null, 'a/S.pdf', null), classify(s))).toEqual([]);
});

test('isBulkFixable', () => {
	const lone = snap(['a/S.md'], ['att/Scan.pdf'], [c('a/S.md', 'att/Scan.pdf')]);
	expect(isBulkFixable(item('displaced', 'a/S.md', 'att/Scan.pdf'), lone)).toBe(true);
	const misnamed = snap(['a/S.md'], ['a/Scan.pdf'], [c('a/S.md', 'a/Scan.pdf')]);
	expect(isBulkFixable(item('misnamed', 'a/S.md', 'a/Scan.pdf'), misnamed)).toBe(true);
	const contested = snap(['a/S.md', 'b/T.md'], ['att/X.pdf'], [c('a/S.md', 'att/X.pdf'), c('b/T.md', 'att/X.pdf')]);
	expect(isBulkFixable(item('contested', 'a/S.md', 'att/X.pdf'), contested)).toBe(false);
	const blocked = snap(['a/S.md'], ['att/Scan.pdf', 'a/s.pdf'], [c('a/S.md', 'att/Scan.pdf')]);
	expect(isBulkFixable(item('displaced', 'a/S.md', 'att/Scan.pdf'), blocked)).toBe(false);
	const twoClaims = snap(['a/S.md', 'b/T.md'], ['att/X.pdf'], [c('a/S.md', 'att/X.pdf'), c('b/T.md', 'att/X.pdf')]);
	expect(isBulkFixable(item('displaced', 'a/S.md', 'att/X.pdf'), twoClaims)).toBe(false);
	expect(isBulkFixable(item('missing', 'a/S.md', null), snap(['a/S.md'], [], [c('a/S.md', null)]))).toBe(false);
});
test('isBulkFixable allows a rename that only changes letter case', () => {
	const s = snap(['a/S.md'], ['a/s.pdf'], [c('a/S.md', 'a/s.pdf')]);
	expect(isBulkFixable(item('misnamed', 'a/S.md', 'a/s.pdf'), s)).toBe(true);
});

// stale items
test('delete-pdf for a note-removed item whose note is back and claims the PDF again → stale notice only', () => {
	const s = snap(['a/S.md'], ['a/S.pdf'], [c('a/S.md', 'a/S.pdf')]);
	expect(planFix(item('note-removed', null, 'a/S.pdf', null), 'delete-pdf', s)).toEqual(STALE);
});
test('delete-pdf for a note-removed item whose PDF is gone → stale notice only', () => {
	expect(planFix(item('note-removed', null, 'a/S.pdf', null), 'delete-pdf', snap([], [], []))).toEqual(STALE);
});
test('delete-pdf requested for a displaced item → stale notice only', () => {
	const s = snap(['a/S.md'], ['att/X.pdf'], [c('a/S.md', 'att/X.pdf')]);
	expect(planFix(item('displaced', 'a/S.md', 'att/X.pdf'), 'delete-pdf', s)).toEqual(STALE);
});
test('a pair that has become healthy → stale notice for any fix', () => {
	const s = snap(['a/S.md'], ['a/S.pdf'], [c('a/S.md', 'a/S.pdf')]);
	expect(planFix(item('displaced', 'a/S.md', 'att/X.pdf'), 'move-pdf-to-note', s)).toEqual(STALE);
	expect(planFix(item('missing', 'a/S.md', null), 'remove-claim', s)).toEqual(STALE);
});
test('an item whose note has gone or whose PDF changed is stale', () => {
	const s = snap(['a/S.md'], ['att/X.pdf', 'att/Y.pdf'], [c('a/S.md', 'att/Y.pdf')]);
	expect(planFix(item('displaced', 'a/T.md', 'att/X.pdf'), 'move-pdf-to-note', s)).toEqual(STALE);
	expect(planFix(item('displaced', 'a/S.md', 'att/X.pdf'), 'move-pdf-to-note', s)).toEqual(STALE);
});
test('a fix the kind does not offer → stale notice', () => {
	const s = snap(['a/S.md'], ['att/X.pdf'], [c('a/S.md', 'att/X.pdf')]);
	expect(planFix(item('displaced', 'a/S.md', 'att/X.pdf'), 'copy-pdf-for-note', s)).toEqual(STALE);
});
test('isCurrent', () => {
	const s = snap(['a/S.md'], ['att/X.pdf', 'a/U.pdf'], [c('a/S.md', 'att/X.pdf')]);
	expect(isCurrent(item('displaced', 'a/S.md', 'att/X.pdf'), s)).toBe(true);
	expect(isCurrent(item('misnamed', 'a/S.md', 'att/X.pdf'), s)).toBe(false);
	expect(isCurrent(item('unwrapped', null, 'a/U.pdf', null), s)).toBe(true);
	expect(isCurrent(item('note-removed', null, 'a/U.pdf', null), s)).toBe(true);
	expect(isCurrent(item('unwrapped', null, 'att/X.pdf', null), s)).toBe(false);
	expect(isCurrent(item('note-removed', null, 'a/Gone.pdf', null), s)).toBe(false);
});
test('choose-pdf with a PDF that is another note healthy partner → unavailable notice', () => {
	const s = snap(['a/S.md', 'b/T.md'], ['b/T.pdf'], [c('a/S.md', null), c('b/T.md', 'b/T.pdf')]);
	expect(planFix(item('missing', 'a/S.md', null, 'gone.pdf'), 'choose-pdf', s, 'b/T.pdf'))
		.toEqual([{ type: 'notice', message: 'b/T.pdf is no longer available. Pick again.' }]);
});
test('choose-pdf with a PDF that no longer exists → unavailable notice', () => {
	const s = snap(['a/S.md'], [], [c('a/S.md', null)]);
	expect(planFix(item('missing', 'a/S.md', null, 'gone.pdf'), 'choose-pdf', s, 'att/Gone.pdf'))
		.toEqual([{ type: 'notice', message: 'att/Gone.pdf is no longer available. Pick again.' }]);
});
test('isBulkFixable is false for the reviewer case: the single claim belongs to another note', () => {
	const s = snap(['a/S.md', 'att/X.md'], ['att/X.pdf'], [c('att/X.md', 'att/X.pdf')]);
	const stale = item('displaced', 'a/S.md', 'att/X.pdf');
	expect(isBulkFixable(stale, s)).toBe(false);
	expect(planFix(stale, 'move-pdf-to-note', s)).toEqual(STALE);
});
test('isBulkFixable is false when the item is stale although one claim exists', () => {
	const s = snap(['a/S.md'], ['a/S.pdf'], [c('a/S.md', 'a/S.pdf')]);
	expect(isBulkFixable(item('displaced', 'a/S.md', 'a/S.pdf'), s)).toBe(false);
});
test('oldTargets include the raw target of the note, de-duplicated', () => {
	const s = snap(['a/S.md'], ['a/Scan.pdf'], [c('a/S.md', 'a/Scan.pdf', 'Scan')]);
	expect(planFix(item('misnamed', 'a/S.md', 'a/Scan.pdf', 'Scan'), 'rename-pdf-to-note', s)).toEqual([
		{ type: 'rename', from: 'a/Scan.pdf', to: 'a/S.pdf' },
		{ type: 'setClaim', notePath: 'a/S.md', pdfPath: 'a/S.pdf', oldTargets: ['a/Scan.pdf', 'Scan.pdf', 'Scan'] }]);
	const s2 = snap(['a/S.md', 'b/T.md'], ['a/S.pdf', 'att/X.pdf'], [c('a/S.md', 'a/S.pdf'), c('b/T.md', 'att/X.pdf', 'old/X.pdf')]);
	expect(planFix(item('displaced', 'b/T.md', 'att/X.pdf', 'old/X.pdf'), 'move-pdf-to-note', s2)).toEqual([
		{ type: 'rename', from: 'att/X.pdf', to: 'b/T.pdf' },
		{ type: 'setClaim', notePath: 'b/T.md', pdfPath: 'b/T.pdf', oldTargets: ['att/X.pdf', 'X.pdf', 'X', 'old/X.pdf'] }]);
});
test('rename-note-to-pdf and copy also carry the raw target', () => {
	const s = snap(['a/S.md'], ['a/T.pdf'], [c('a/S.md', 'a/T.pdf', 'Old.pdf')]);
	expect(planFix(item('misnamed', 'a/S.md', 'a/T.pdf', 'Old.pdf'), 'rename-note-to-pdf', s)[1]).toEqual(
		{ type: 'setClaim', notePath: 'a/T.md', pdfPath: 'a/T.pdf', oldTargets: ['Old.pdf', 'Old'] });
	const s2 = snap(['a/S.md', 'a/S 1.md'], ['a/S.pdf'], [c('a/S.md', 'a/S.pdf'), c('a/S 1.md', 'a/S.pdf', 'S')]);
	expect(planFix(item('extra-claim', 'a/S 1.md', 'a/S.pdf', 'S'), 'copy-pdf-for-note', s2)[1]).toEqual(
		{ type: 'setClaim', notePath: 'a/S 1.md', pdfPath: 'a/S 1.pdf', oldTargets: ['a/S.pdf', 'S.pdf', 'S'] });
});

// precomputed classification
test('isCurrent, isBulkFixable and planFix use a precomputed classification when given', () => {
	const s = snap(['a/S.md'], ['att/X.pdf'], [c('a/S.md', 'att/X.pdf')]);
	const displaced = item('displaced', 'a/S.md', 'att/X.pdf');
	const real = classify(s);
	expect(isCurrent(displaced, s, real)).toBe(true);
	expect(isBulkFixable(displaced, s, real)).toBe(true);
	expect(planFix(displaced, 'move-pdf-to-note', s, undefined, real)).toEqual(planFix(displaced, 'move-pdf-to-note', s));
	// A classification that disagrees with the snapshot is the one that counts.
	const other = { pairs: [{ ...c('a/S.md', 'att/X.pdf'), state: 'misnamed' as const }], unwrappedPdfs: [] };
	expect(isCurrent(displaced, s, other)).toBe(false);
	expect(isBulkFixable(displaced, s, other)).toBe(false);
	expect(planFix(displaced, 'move-pdf-to-note', s, undefined, other)).toEqual(STALE);
});
test('choose-pdf checks availability against the precomputed classification', () => {
	const s = snap(['a/S.md'], ['att/Scan.pdf'], [c('a/S.md', null)]);
	const missing = item('missing', 'a/S.md', null);
	const noneFree = { pairs: [{ ...c('a/S.md', null), state: 'missing' as const }], unwrappedPdfs: [] };
	expect(planFix(missing, 'choose-pdf', s, 'att/Scan.pdf', noneFree))
		.toEqual([{ type: 'notice', message: 'att/Scan.pdf is no longer available. Pick again.' }]);
});
