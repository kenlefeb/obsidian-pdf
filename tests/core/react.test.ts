import { expect, test } from 'vitest';
import { autoWrapChecker, react, shouldAutoWrap } from '../../src/core/react.ts';
import type { NoteClaim, Snapshot } from '../../src/core/types.ts';

const snap = (notePaths: string[], pdfPaths: string[], claims: NoteClaim[]): Snapshot => ({ notePaths, pdfPaths, claims });
const c = (notePath: string, pdfPath: string | null, rawTarget = pdfPath ?? 'gone.pdf'): NoteClaim => ({ notePath, pdfPath, rawTarget });

test('local note rename moves the PDF and rewrites the claim', () => {
	const r = react({ kind: 'rename', path: 'b/New.md', oldPath: 'a/Old.md', local: true },
		snap(['b/New.md'], ['a/Old.pdf'], [c('b/New.md', 'a/Old.pdf')]));
	expect(r.actions).toEqual([
		{ type: 'rename', from: 'a/Old.pdf', to: 'b/New.pdf' },
		{ type: 'setClaim', notePath: 'b/New.md', pdfPath: 'b/New.pdf', oldTargets: ['a/Old.pdf', 'Old.pdf', 'Old'] }]);
	expect(r.recheck).toBe(false); expect(r.pendingRemoved).toBeNull();
});
test('partner extension case is preserved', () => {
	const r = react({ kind: 'rename', path: 'b/New.md', oldPath: 'a/Old.md', local: true },
		snap(['b/New.md'], ['a/Old.PDF'], [c('b/New.md', 'a/Old.PDF')]));
	expect(r.actions).toEqual([
		{ type: 'rename', from: 'a/Old.PDF', to: 'b/New.PDF' },
		{ type: 'setClaim', notePath: 'b/New.md', pdfPath: 'b/New.PDF', oldTargets: ['a/Old.PDF', 'Old.PDF', 'Old'] }]);
	expect(r.recheck).toBe(false); expect(r.pendingRemoved).toBeNull();
});
test('note rename into the vault root joins without a leading slash', () => {
	const r = react({ kind: 'rename', path: 'New.md', oldPath: 'a/Old.md', local: true },
		snap(['New.md'], ['a/Old.pdf'], [c('New.md', 'a/Old.pdf')]));
	expect(r.actions[0]).toEqual({ type: 'rename', from: 'a/Old.pdf', to: 'New.pdf' });
});
test('non-local note rename does nothing but asks for a recheck', () => {
	const r = react({ kind: 'rename', path: 'b/New.md', oldPath: 'a/Old.md', local: false },
		snap(['b/New.md'], ['a/Old.pdf'], [c('b/New.md', 'a/Old.pdf')]));
	expect(r).toEqual({ actions: [], recheck: true, pendingRemoved: null });
});
test('destination taken: nothing is renamed, user is told, pair is rechecked', () => {
	const r = react({ kind: 'rename', path: 'a/New.md', oldPath: 'a/Old.md', local: true },
		snap(['a/New.md'], ['a/Old.pdf', 'a/New.pdf'], [c('a/New.md', 'a/Old.pdf')]));
	expect(r.actions.map(a => a.type)).toEqual(['notice']); expect(r.recheck).toBe(true);
	expect(r.actions).toEqual([{ type: 'notice', message: 'Could not rename a/Old.pdf to match a/New.md: a file with that name already exists.' }]);
	expect(r.pendingRemoved).toBeNull();
});
test('destination differing from an existing PDF only by case counts as taken', () => {
	const r = react({ kind: 'rename', path: 'a/New.md', oldPath: 'a/Old.md', local: true },
		snap(['a/New.md'], ['a/Old.pdf', 'a/new.pdf'], [c('a/New.md', 'a/Old.pdf')]));
	expect(r).toEqual({
		actions: [{ type: 'notice', message: 'Could not rename a/Old.pdf to match a/New.md: a file with that name already exists.' }],
		recheck: true, pendingRemoved: null });
});
test('destination taken by a note of the same name when the PDF was renamed', () => {
	const r = react({ kind: 'rename', path: 'a/New.pdf', oldPath: 'a/Old.pdf', local: true },
		snap(['a/Old.md', 'a/New.md'], ['a/New.pdf'], [c('a/Old.md', 'a/New.pdf')]));
	expect(r).toEqual({
		actions: [{ type: 'notice', message: 'Could not rename a/Old.md to match a/New.pdf: a file with that name already exists.' }],
		recheck: true, pendingRemoved: null });
});
test('PDF rename destination taken only by case is also notice-only', () => {
	const r = react({ kind: 'rename', path: 'a/New.pdf', oldPath: 'a/Old.pdf', local: true },
		snap(['a/Old.md', 'a/new.md'], ['a/New.pdf'], [c('a/Old.md', 'a/New.pdf')]));
	expect(r.actions.map(a => a.type)).toEqual(['notice']); expect(r.recheck).toBe(true);
});
test('folder move: partner already beside the note → setClaim only', () => {
	const r = react({ kind: 'rename', path: 'z/S.md', oldPath: 'a/S.md', local: true },
		snap(['z/S.md'], ['z/S.pdf'], [c('z/S.md', 'z/S.pdf')]));
	expect(r).toEqual({
		actions: [{ type: 'setClaim', notePath: 'z/S.md', pdfPath: 'z/S.pdf', oldTargets: [] }],
		recheck: false, pendingRemoved: null });
});
test('folder move: partner event not yet arrived → recheck only', () => {
	const r = react({ kind: 'rename', path: 'z/S.md', oldPath: 'a/S.md', local: true },
		snap(['z/S.md'], [], [c('z/S.md', null, 'a/S.pdf')]));
	expect(r).toEqual({ actions: [], recheck: true, pendingRemoved: null });
});
test('note rename whose pair was already broken does nothing but recheck', () => {
	const r = react({ kind: 'rename', path: 'b/New.md', oldPath: 'a/Old.md', local: true },
		snap(['b/New.md'], ['att/Old.pdf'], [c('b/New.md', 'att/Old.pdf')]));
	expect(r).toEqual({ actions: [], recheck: true, pendingRemoved: null });
});
test('local PDF rename renames the note', () => {
	const r = react({ kind: 'rename', path: 'b/New.pdf', oldPath: 'a/Old.pdf', local: true },
		snap(['a/Old.md'], ['b/New.pdf'], [c('a/Old.md', 'b/New.pdf')]));
	expect(r.actions).toEqual([
		{ type: 'rename', from: 'a/Old.md', to: 'b/New.md' },
		{ type: 'setClaim', notePath: 'b/New.md', pdfPath: 'b/New.pdf', oldTargets: ['a/Old.pdf', 'Old.pdf', 'Old'] }]);
	expect(r.recheck).toBe(false); expect(r.pendingRemoved).toBeNull();
});
test('local PDF rename with unresolved claim matched by rawTarget', () => {
	const r = react({ kind: 'rename', path: 'a/New.pdf', oldPath: 'a/Old.pdf', local: true },
		snap(['a/Old.md'], ['a/New.pdf'], [c('a/Old.md', null, 'a/Old.pdf')]));
	expect(r.actions).toEqual([
		{ type: 'rename', from: 'a/Old.md', to: 'a/New.md' },
		{ type: 'setClaim', notePath: 'a/New.md', pdfPath: 'a/New.pdf', oldTargets: ['a/Old.pdf', 'Old.pdf', 'Old'] }]);
	expect(r.recheck).toBe(false);
});
test('local PDF rename with unresolved claim matched by bare file name', () => {
	const r = react({ kind: 'rename', path: 'a/New.pdf', oldPath: 'a/Old.pdf', local: true },
		snap(['a/Old.md'], ['a/New.pdf'], [c('a/Old.md', null, 'Old.pdf')]));
	expect(r.actions.map(a => a.type)).toEqual(['rename', 'setClaim']);
});
test('PDF rename keeps the note extension case', () => {
	const r = react({ kind: 'rename', path: 'a/New.pdf', oldPath: 'a/Old.pdf', local: true },
		snap(['a/Old.MD'], ['a/New.pdf'], [c('a/Old.MD', 'a/New.pdf')]));
	expect(r.actions[0]).toEqual({ type: 'rename', from: 'a/Old.MD', to: 'a/New.MD' });
});
test('non-local PDF rename does nothing but asks for a recheck', () => {
	const r = react({ kind: 'rename', path: 'b/New.pdf', oldPath: 'a/Old.pdf', local: false },
		snap(['a/Old.md'], ['b/New.pdf'], [c('a/Old.md', 'b/New.pdf')]));
	expect(r).toEqual({ actions: [], recheck: true, pendingRemoved: null });
});
test('PDF rename that keeps the pair intact (extension case only) → setClaim only', () => {
	const r = react({ kind: 'rename', path: 'a/S.PDF', oldPath: 'a/S.pdf', local: true },
		snap(['a/S.md'], ['a/S.PDF'], [c('a/S.md', 'a/S.PDF')]));
	expect(r).toEqual({
		actions: [{ type: 'setClaim', notePath: 'a/S.md', pdfPath: 'a/S.PDF', oldTargets: [] }],
		recheck: false, pendingRemoved: null });
});
test('renaming an unclaimed PDF or an unmarked note does nothing', () => {
	expect(react({ kind: 'rename', path: 'a/New.pdf', oldPath: 'a/Old.pdf', local: true },
		snap(['a/Old.md'], ['a/New.pdf'], []))).toEqual({ actions: [], recheck: true, pendingRemoved: null });
	expect(react({ kind: 'rename', path: 'a/New.pdf', oldPath: 'a/Old.pdf', local: true },
		snap(['a/Old.md'], ['a/New.pdf'], [c('a/Old.md', 'a/Other.pdf')]))).toEqual({ actions: [], recheck: true, pendingRemoved: null });
	expect(react({ kind: 'rename', path: 'a/New.md', oldPath: 'a/Old.md', local: true },
		snap(['a/New.md'], ['a/Old.pdf'], []))).toEqual({ actions: [], recheck: true, pendingRemoved: null });
});
test('local delete of a healthy note deletes the PDF when no other note links to it', () => {
	expect(react({ kind: 'delete', path: 'a/S.md', local: true, claimedPdf: 'a/S.pdf', linkedElsewhere: false }, snap([], ['a/S.pdf'], [])))
		.toEqual({ actions: [{ type: 'delete', path: 'a/S.pdf' }], recheck: false, pendingRemoved: null });
});
test('local delete keeps a PDF other notes still link to: notice, listed, rechecked', () => {
	expect(react({ kind: 'delete', path: 'a/S.md', local: true, claimedPdf: 'a/S.pdf', linkedElsewhere: true }, snap([], ['a/S.pdf'], [])))
		.toEqual({
			actions: [{ type: 'notice', message: 'Kept S.pdf: other notes still link to it.' }],
			recheck: true, pendingRemoved: 'a/S.pdf' });
});
test('local delete keeps the PDF when nobody checked for other links', () => {
	const r = react({ kind: 'delete', path: 'a/S.md', local: true, claimedPdf: 'a/S.pdf' }, snap([], ['a/S.pdf'], []));
	expect(r.actions.some((a) => a.type === 'delete')).toBe(false);
	expect(r.pendingRemoved).toBe('a/S.pdf');
});
test('non-local delete of a linked PDF is protected as before, without a notice', () => {
	expect(react({ kind: 'delete', path: 'a/S.md', local: false, claimedPdf: 'a/S.pdf', linkedElsewhere: true }, snap([], ['a/S.pdf'], [])))
		.toEqual({ actions: [], recheck: true, pendingRemoved: 'a/S.pdf' });
});
test('non-local delete protects the PDF', () => {
	const r = react({ kind: 'delete', path: 'a/S.md', local: false, claimedPdf: 'a/S.pdf' }, snap([], ['a/S.pdf'], []));
	expect(r.actions).toEqual([]); expect(r.pendingRemoved).toBe('a/S.pdf'); expect(r.recheck).toBe(true);
});
test('local delete leaves a PDF another note still claims', () => {
	const r = react({ kind: 'delete', path: 'a/S.md', local: true, claimedPdf: 'a/S.pdf' },
		snap(['a/S 1.md'], ['a/S.pdf'], [c('a/S 1.md', 'a/S.pdf')]));
	expect(r).toEqual({ actions: [], recheck: true, pendingRemoved: null });
});
test('non-local delete leaves a PDF another note still claims, with no pending removal', () => {
	const r = react({ kind: 'delete', path: 'a/S.md', local: false, claimedPdf: 'a/S.pdf' },
		snap(['a/S 1.md'], ['a/S.pdf'], [c('a/S 1.md', 'a/S.pdf')]));
	expect(r).toEqual({ actions: [], recheck: true, pendingRemoved: null });
});
test('local delete of a broken pair\'s note does nothing', () => {
	const r = react({ kind: 'delete', path: 'a/S.md', local: true, claimedPdf: 'att/S.pdf' }, snap([], ['att/S.pdf'], []));
	expect(r).toEqual({ actions: [], recheck: true, pendingRemoved: null });
});
test('delete of a note whose PDF is already gone does nothing', () => {
	const r = react({ kind: 'delete', path: 'a/S.md', local: true, claimedPdf: 'a/S.pdf' }, snap([], [], []));
	expect(r).toEqual({ actions: [], recheck: true, pendingRemoved: null });
});
test('delete of a note with no claim does nothing', () => {
	const r = react({ kind: 'delete', path: 'a/S.md', local: true, claimedPdf: null }, snap([], ['a/S.pdf'], []));
	expect(r).toEqual({ actions: [], recheck: true, pendingRemoved: null });
});
test('delete of a PDF never deletes the note', () => {
	for (const local of [true, false]) {
		const r = react({ kind: 'delete', path: 'a/S.pdf', local, claimedPdf: null }, snap(['a/S.md'], [], [c('a/S.md', null, 'a/S.pdf')]));
		expect(r).toEqual({ actions: [], recheck: true, pendingRemoved: null });
	}
});
test('create of a note or PDF asks for a recheck, anything else nothing', () => {
	const s = snap([], [], []);
	expect(react({ kind: 'create', path: 'a/S.md', local: true }, s)).toEqual({ actions: [], recheck: true, pendingRemoved: null });
	expect(react({ kind: 'create', path: 'a/S.PDF', local: false }, s)).toEqual({ actions: [], recheck: true, pendingRemoved: null });
	expect(react({ kind: 'create', path: 'a/S.png', local: true }, s)).toEqual({ actions: [], recheck: false, pendingRemoved: null });
});
test('non-local rename: partner already beside the note writes nothing', () => {
	const r = react({ kind: 'rename', path: 'z/S.md', oldPath: 'a/S.md', local: false },
		snap(['z/S.md'], ['z/S.pdf'], [c('z/S.md', 'z/S.pdf')]));
	expect(r).toEqual({ actions: [], recheck: true, pendingRemoved: null });
});
test('non-local PDF rename that keeps the pair intact writes nothing', () => {
	const r = react({ kind: 'rename', path: 'a/S.PDF', oldPath: 'a/S.pdf', local: false },
		snap(['a/S.md'], ['a/S.PDF'], [c('a/S.md', 'a/S.PDF')]));
	expect(r).toEqual({ actions: [], recheck: true, pendingRemoved: null });
});
test('case-only note rename follows: the partner itself is not a clash', () => {
	const r = react({ kind: 'rename', path: 'a/old.md', oldPath: 'a/Old.md', local: true },
		snap(['a/old.md'], ['a/Old.pdf'], [c('a/old.md', 'a/Old.pdf')]));
	expect(r).toEqual({
		actions: [
			{ type: 'rename', from: 'a/Old.pdf', to: 'a/old.pdf' },
			{ type: 'setClaim', notePath: 'a/old.md', pdfPath: 'a/old.pdf', oldTargets: ['a/Old.pdf', 'Old.pdf', 'Old'] }],
		recheck: false, pendingRemoved: null });
});
test('case-only PDF rename follows: the note itself is not a clash', () => {
	const r = react({ kind: 'rename', path: 'a/old.pdf', oldPath: 'a/Old.pdf', local: true },
		snap(['a/Old.md'], ['a/old.pdf'], [c('a/Old.md', 'a/old.pdf')]));
	expect(r).toEqual({
		actions: [
			{ type: 'rename', from: 'a/Old.md', to: 'a/old.md' },
			{ type: 'setClaim', notePath: 'a/old.md', pdfPath: 'a/old.pdf', oldTargets: ['a/Old.pdf', 'Old.pdf', 'Old'] }],
		recheck: false, pendingRemoved: null });
});
test('note rename does not take a PDF another note now owns', () => {
	const r = react({ kind: 'rename', path: 'b/New.md', oldPath: 'a/Old.md', local: true },
		snap(['b/New.md', 'a/Old.md'], ['a/Old.pdf'], [c('b/New.md', 'a/Old.pdf'), c('a/Old.md', 'a/Old.pdf')]));
	expect(r).toEqual({ actions: [], recheck: true, pendingRemoved: null });
});
test('extension-changing renames ask for a recheck', () => {
	const s = snap(['a/S.txt'], ['a/S.pdf'], []);
	expect(react({ kind: 'rename', path: 'a/S.txt', oldPath: 'a/S.md', local: true }, s)).toEqual(
		{ actions: [], recheck: true, pendingRemoved: null });
	expect(react({ kind: 'rename', path: 'a/S.png', oldPath: 'a/S.pdf', local: true }, s)).toEqual(
		{ actions: [], recheck: true, pendingRemoved: null });
	expect(react({ kind: 'rename', path: 'a/x.png', oldPath: 'a/y.png', local: true }, s)).toEqual(
		{ actions: [], recheck: false, pendingRemoved: null });
});
test('delete of a file that is neither note nor PDF does nothing', () => {
	expect(react({ kind: 'delete', path: 'a/x.png', local: true, claimedPdf: null }, snap([], [], []))).toEqual(
		{ actions: [], recheck: false, pendingRemoved: null });
});
test('shouldAutoWrap treats a note of that name as present ignoring case', () => {
	expect(shouldAutoWrap('a/N.pdf', snap(['a/n.md'], ['a/N.pdf'], []), null)).toBe(false);
});
test('shouldAutoWrap', () => {
	const s = snap(['a/S.md', 'a/N.md'], ['a/S.pdf', 'a/N.pdf', 'a/New.pdf', 'att/x.pdf'], [c('a/S.md', 'a/S.pdf')]);
	expect(shouldAutoWrap('a/New.pdf', s, 'att')).toBe(true);
	expect(shouldAutoWrap('a/S.pdf', s, 'att')).toBe(false);   // claimed
	expect(shouldAutoWrap('a/N.pdf', s, 'att')).toBe(false);   // note of that name exists
	expect(shouldAutoWrap('att/x.pdf', s, 'att')).toBe(false); // attachment folder
	expect(shouldAutoWrap('att/x.pdf', s, null)).toBe(true);
	expect(shouldAutoWrap('gone.pdf', s, null)).toBe(false);
});
test('autoWrapChecker answers as shouldAutoWrap does, for every PDF of one snapshot', () => {
	const s = snap(['a/S.md', 'a/N.md', 'b/x.MD', 'S.md', 'a/Q.txt'],
		['a/S.pdf', 'a/N.pdf', 'a/New.pdf', 'att/x.pdf', 'b/X.pdf', 'S.pdf', 'a/Q.pdf', 'A/n.PDF'],
		[c('a/S.md', 'a/S.pdf'), c('S.md', 'a/New.pdf')]);
	for (const folder of [null, 'att', '']) {
		const check = autoWrapChecker(s, folder);
		for (const pdf of [...s.pdfPaths, 'gone.pdf']) expect([pdf, folder, check(pdf)]).toEqual([pdf, folder, shouldAutoWrap(pdf, s, folder)]);
	}
	const check = autoWrapChecker(s, null);
	expect(check('a/New.pdf')).toBe(false); // claimed by a note elsewhere
	expect(check('b/X.pdf')).toBe(false);   // note of that name, other letter case
	expect(check('A/n.PDF')).toBe(false);   // folder differs only by case
	expect(check('a/Q.pdf')).toBe(true);    // a .txt of that name is not a note
	expect(check('att/x.pdf')).toBe(true);
});
