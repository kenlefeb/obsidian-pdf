import { expect, test } from 'vitest';
import { attentionNotice, bulkResultMessage, fixLabel, noteBesidePdf, noteBesidePdfMessage, nextPendingRemoved, rowFile, stateLine } from '../../src/core/attention.ts';
import { classify } from '../../src/core/classify.ts';
import type { AttentionItem, AttentionKind, Classification, FixId, NoteClaim } from '../../src/core/types.ts';

const c = (notePath: string, pdfPath: string | null): NoteClaim => ({ notePath, pdfPath, rawTarget: pdfPath ?? 'gone.pdf' });
const item = (kind: AttentionKind, notePath: string | null, pdfPath: string | null): AttentionItem =>
	({ kind, notePath, pdfPath, rawTarget: pdfPath });
const none: Classification = { pairs: [], unwrappedPdfs: [] };

// stateLine
test('stateLine gives the plain-language state for each kind', () => {
	expect(stateLine(item('missing', 'a/S.md', null), none)).toBe('PDF not found. It may not have downloaded yet.');
	expect(stateLine(item('misnamed', 'a/S.md', 'a/Scan 001.pdf'), none)).toBe('PDF has a different name: Scan 001.pdf');
	expect(stateLine(item('displaced', 'a/S.md', 'b/c/S.pdf'), none)).toBe('PDF is in another folder: b/c');
	expect(stateLine(item('extra-claim', 'a/S 1.md', 'a/S.pdf'), none)).toBe("Points at another document's PDF");
	expect(stateLine(item('note-removed', null, 'a/S.pdf'), none)).toBe('Its note was deleted; the PDF was kept');
	expect(stateLine(item('unwrapped', null, 'a/S.pdf'), none)).toBe('Not wrapped');
});

test('stateLine names the vault root as "/" for a displaced PDF', () => {
	expect(stateLine(item('displaced', 'a/S.md', 'S.pdf'), none)).toBe('PDF is in another folder: /');
});

test('stateLine counts the other notes sharing a contested PDF', () => {
	const cl = classify({
		notePaths: ['a/T.md', 'b/U.md', 'c/V.md', 'a/W.md'],
		pdfPaths: ['x/P.pdf', 'x/Q.pdf'],
		claims: [c('a/T.md', 'x/P.pdf'), c('b/U.md', 'x/P.pdf'), c('c/V.md', 'x/P.pdf'), c('a/W.md', 'x/Q.pdf')],
	});
	expect(stateLine(item('contested', 'a/T.md', 'x/P.pdf'), cl)).toBe('Shares a PDF with 2 other notes');
});

test('stateLine says "note" for a single other note sharing a contested PDF', () => {
	const cl = classify({
		notePaths: ['a/T.md', 'b/U.md'],
		pdfPaths: ['x/P.pdf'],
		claims: [c('a/T.md', 'x/P.pdf'), c('b/U.md', 'x/P.pdf')],
	});
	expect(stateLine(item('contested', 'a/T.md', 'x/P.pdf'), cl)).toBe('Shares a PDF with 1 other note');
});

// rowFile
test('rowFile shows the note when there is one, else the PDF, with its folder', () => {
	expect(rowFile(item('misnamed', 'a/b/S.md', 'a/b/X.pdf'))).toEqual({ name: 'S.md', folder: 'a/b' });
	expect(rowFile(item('unwrapped', null, 'c/X.pdf'))).toEqual({ name: 'X.pdf', folder: 'c' });
	expect(rowFile(item('unwrapped', null, 'X.pdf'))).toEqual({ name: 'X.pdf', folder: '/' });
});

// fixLabel
test('fixLabel gives a distinct sentence-case label for every fix', () => {
	const fixes: FixId[] = ['rename-pdf-to-note', 'rename-note-to-pdf', 'move-pdf-to-note', 'copy-pdf-for-note',
		'choose-pdf', 'remove-claim', 'delete-pdf', 'wrap', 'keep-plain'];
	const labels = fixes.map(fixLabel);
	expect(new Set(labels).size).toBe(fixes.length);
	for (const label of labels) expect(label).toMatch(/^[A-Z][^A-Z]*(PDF[^A-Z]*)*$/);
	expect(fixLabel('rename-pdf-to-note')).toBe('Rename PDF to match');
	expect(fixLabel('copy-pdf-for-note')).toBe('Copy the PDF');
});

// nextPendingRemoved
test('nextPendingRemoved adds new paths and keeps only those still unwrapped, without duplicates', () => {
	const unwrapped = ['a/S.pdf', 'b/T.pdf', 'c/U.pdf'];
	expect(nextPendingRemoved(['a/S.pdf', 'gone.pdf'], ['b/T.pdf', 'a/S.pdf', 'wrapped.pdf'], unwrapped))
		.toEqual(['a/S.pdf', 'b/T.pdf']);
});

test('nextPendingRemoved keeps the saved order and leaves an unchanged list equal', () => {
	expect(nextPendingRemoved(['b/T.pdf', 'a/S.pdf'], [], ['a/S.pdf', 'b/T.pdf'])).toEqual(['b/T.pdf', 'a/S.pdf']);
	expect(nextPendingRemoved([], [], ['a/S.pdf'])).toEqual([]);
});

// bulkResultMessage
test('bulkResultMessage reports how many were done, and says so when it stopped early', () => {
	expect(bulkResultMessage('fix', 3, false)).toBe('Fixed 3 documents.');
	expect(bulkResultMessage('fix', 1, false)).toBe('Fixed 1 document.');
	expect(bulkResultMessage('fix', 2, true)).toBe('Stopped after fixing 2 documents.');
	expect(bulkResultMessage('wrap', 4, false)).toBe('Wrapped 4 PDFs.');
	expect(bulkResultMessage('wrap', 1, false)).toBe('Wrapped 1 PDF.');
	expect(bulkResultMessage('wrap', 0, true)).toBe('Stopped after wrapping 0 PDFs.');
});

// attentionNotice
test('attentionNotice says how many wrapped documents need attention', () => {
	expect(attentionNotice(3)).toBe('3 wrapped documents need attention');
	expect(attentionNotice(1)).toBe('1 wrapped document needs attention');
});

// noteBesidePdf
test('noteBesidePdf finds the note that would pair with the PDF, ignoring letter case', () => {
	expect(noteBesidePdf('a/S.pdf', ['a/T.md', 'a/S.md'])).toBe('a/S.md');
	expect(noteBesidePdf('a/S.pdf', ['A/s.MD'])).toBe('A/s.MD');
	expect(noteBesidePdf('S.pdf', ['s.md'])).toBe('s.md');
});

test('noteBesidePdf ignores notes in other folders, with other names, and non-notes', () => {
	expect(noteBesidePdf('a/S.pdf', ['b/S.md', 'a/S 1.md', 'a/S.canvas', 'a/S.pdf'])).toBeNull();
	expect(noteBesidePdf('a/S.pdf', [])).toBeNull();
});

test('noteBesidePdfMessage names the note file', () => {
	expect(noteBesidePdfMessage('a/S.md')).toBe('A note named S.md now exists beside this PDF. Check the list again.');
});
