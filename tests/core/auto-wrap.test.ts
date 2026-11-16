import { expect, test } from 'vitest';
import {
	AUTO_WRAP_LOCAL_SETTLE_MS,
	AUTO_WRAP_OUTSIDE_JITTER_MS,
	AUTO_WRAP_OUTSIDE_SETTLE_MS,
	autoWrapDueAt,
	arrivingNoteFor,
	heldMessage,
	pausedMessage,
	pausesAutoWrap,
	planAutoWrap,
	stoppedMessage,
	summarizeWraps,
	type ArrivalOrigin,
	type WrapOutcome,
} from '../../src/core/auto-wrap.ts';
import type { MarkedNote, VaultSnapshot } from '../../src/core/model.ts';
import { pairUp } from '../../src/core/pairing.ts';

const flagged = (notePath: string): MarkedNote => ({ notePath, markerLink: null, linkedPdf: null, ownTargets: [] });
/** A note whose marker is still a link to `pdfPath` (the earlier format). */
const linking = (notePath: string, pdfPath: string): MarkedNote => ({ notePath, markerLink: pdfPath, linkedPdf: pdfPath, ownTargets: [pdfPath] });
const snap = (notePaths: string[], pdfPaths: string[], marked: MarkedNote[] = []): VaultSnapshot => ({ notePaths, pdfPaths, marked });
const pend = (path: string, due: number, origin: ArrivalOrigin = 'local') => ({ path, due, origin });

test('the timings are the specified ones', () => {
	expect([AUTO_WRAP_LOCAL_SETTLE_MS, AUTO_WRAP_OUTSIDE_SETTLE_MS, AUTO_WRAP_OUTSIDE_JITTER_MS]).toEqual([2000, 15000, 15000]);
});

test('a PDF created inside Obsidian is due after the local settle, whatever the random source says', () => {
	expect(autoWrapDueAt(1000, 'local', () => 0.9)).toBe(3000);
	expect(autoWrapDueAt(1000, 'local', () => 0)).toBe(3000);
});

test('an outside PDF is due 15 to 30 seconds later, by a per-PDF random extra', () => {
	expect(autoWrapDueAt(1000, 'outside', () => 0)).toBe(16000);
	expect(autoWrapDueAt(1000, 'outside', () => 0.5)).toBe(23500);
	expect(autoWrapDueAt(1000, 'outside', () => 0.999999)).toBe(30999);
});

test('a PDF is not examined before it is due', () => {
	const plan = planAutoWrap([pend('a/New.pdf', 3000)], 2999, snap([], ['a/New.pdf']), null);
	expect(plan).toEqual({ wrap: [], drop: [], held: [], waitUntil: 3000 });
});

test('a due PDF nobody claims and no note matches is wrapped', () => {
	const plan = planAutoWrap([pend('a/New.pdf', 3000)], 3000, snap([], ['a/New.pdf']), null);
	expect(plan).toEqual({ wrap: ['a/New.pdf'], drop: [], held: [], waitUntil: null });
});

test('a due PDF whose note arrived meanwhile is dropped, not wrapped', () => {
	const plan = planAutoWrap([pend('a/New.pdf', 2000)], 5000, snap(['a/New.md'], ['a/New.pdf']), null);
	expect(plan).toEqual({ wrap: [], drop: ['a/New.pdf'], held: [], waitUntil: null });
});

test("a due PDF that a note's link-valued marker points to, that vanished, or that sits in the attachment folder is dropped", () => {
	const s = snap(['a/Other.md'], ['a/Claimed.pdf', 'att/x.pdf'], [linking('a/Other.md', 'a/Claimed.pdf')]);
	const pending = ['a/Claimed.pdf', 'gone.pdf', 'att/x.pdf'].map((path) => pend(path, 0));
	expect(planAutoWrap(pending, 5000, s, 'att')).toEqual({ wrap: [], drop: ['a/Claimed.pdf', 'gone.pdf', 'att/x.pdf'], held: [], waitUntil: null });
});

test('a burst is judged per PDF: due ones are decided, later ones wait for their own time', () => {
	const pending = [pend('a/One.pdf', 2000), pend('a/Two.pdf', 3500), pend('a/Three.pdf', 5000)];
	const plan = planAutoWrap(pending, 3600, snap([], ['a/One.pdf', 'a/Two.pdf', 'a/Three.pdf']), null);
	expect(plan).toEqual({ wrap: ['a/One.pdf', 'a/Two.pdf'], drop: [], held: [], waitUntil: 5000 });
});

test('waitUntil is the earliest remaining due time, whatever the order', () => {
	const pending = [pend('z.pdf', 100), pend('late2.pdf', 11000), pend('late1.pdf', 9000)];
	const plan = planAutoWrap(pending, 2600, snap([], ['z.pdf', 'late1.pdf', 'late2.pdf']), null);
	expect(plan.wrap).toEqual(['z.pdf']);
	expect(plan.waitUntil).toBe(9000);
});

test('a due PDF from outside is dropped, not wrapped, while a marked note without a PDF may be its note still arriving', () => {
	// A rename in transit (same folder) and a move in transit (same name elsewhere).
	const s = snap(['a/Old.md', 'c/S.md'], ['a/New.pdf', 'b/S.pdf', 'd/Free.pdf'], [flagged('a/Old.md'), flagged('c/S.md')]);
	const pending = [pend('a/New.pdf', 0, 'outside'), pend('b/S.pdf', 0, 'outside'), pend('d/Free.pdf', 0, 'outside')];
	expect(planAutoWrap(pending, 5000, s, null)).toEqual({ wrap: ['d/Free.pdf'], drop: ['a/New.pdf', 'b/S.pdf'],
		held: [{ pdfPath: 'a/New.pdf', notePath: 'a/Old.md' }, { pdfPath: 'b/S.pdf', notePath: 'c/S.md' }], waitUntil: null });
});

test('a held PDF from outside is not examined before it is due', () => {
	const s = snap(['a/Old.md'], ['a/New.pdf'], [flagged('a/Old.md')]);
	expect(planAutoWrap([pend('a/New.pdf', 3000, 'outside')], 2999, s, null)).toEqual({ wrap: [], drop: [], held: [], waitUntil: 3000 });
});

test('a PDF made inside Obsidian is wrapped whatever marked notes lack a PDF', () => {
	const s = snap(['a/Old.md', 'c/New.md'], ['a/New.pdf'], [flagged('a/Old.md'), flagged('c/New.md')]);
	expect(planAutoWrap([pend('a/New.pdf', 0, 'local')], 5000, s, null)).toEqual({ wrap: ['a/New.pdf'], drop: [], held: [], waitUntil: null });
});

test('nothing pending means nothing to do', () => {
	expect(planAutoWrap([], 0, snap([], []), null)).toEqual({ wrap: [], drop: [], held: [], waitUntil: null });
});

const ok = (name: string): WrapOutcome => ({ kind: 'wrapped', name });
const bad = (message: string): WrapOutcome => ({ kind: 'failed', message });
const partial = (name: string, message: string): WrapOutcome => ({ kind: 'incomplete', name, message });

test('no outcomes, no notices', () => {
	expect(summarizeWraps([])).toEqual([]);
});

test('one to three successes get a notice each', () => {
	expect(summarizeWraps([ok('A')])).toEqual(['Wrapped A']);
	expect(summarizeWraps([ok('A'), ok('B'), ok('C')])).toEqual(['Wrapped A', 'Wrapped B', 'Wrapped C']);
});

test('more than three successes are one notice', () => {
	expect(summarizeWraps([ok('A'), ok('B'), ok('C'), ok('D')])).toEqual(['Wrapped 4 PDFs.']);
});

test('one failure shows its own message', () => {
	expect(summarizeWraps([bad('Could not create a/A.md: disk full.')])).toEqual(['Could not create a/A.md: disk full.']);
});

test('several failures are one notice with the first problem', () => {
	expect(summarizeWraps([bad('Could not create a/A.md: x.'), bad('Could not create a/B.md: x.'), bad('Could not create a/C.md: x.')])).toEqual([
		'Could not wrap 3 PDFs. First problem: Could not create a/A.md: x. The rest are listed under documents needing attention.',
	]);
});

test('an incomplete wrap shows only its message, never "Wrapped <name>" as well', () => {
	expect(summarizeWraps([partial('A', 'Created and marked a/A.md, but could not update its PDF embed: x.')])).toEqual([
		'Created and marked a/A.md, but could not update its PDF embed: x.',
	]);
});

test('several incomplete wraps are one notice', () => {
	expect(summarizeWraps([partial('A', 'first.'), partial('B', 'second.')])).toEqual(['2 PDFs were wrapped with problems. First: first.']);
});

test('an incomplete wrap counts as a success for the count', () => {
	const outcomes = [ok('A'), ok('B'), ok('C'), partial('D', 'oops.')];
	expect(summarizeWraps(outcomes)).toEqual(['Wrapped 4 PDFs.', 'oops.']);
});

test('successes, incomplete wraps and failures each get their own notice', () => {
	expect(summarizeWraps([ok('A'), partial('B', 'oops.'), bad('nope.')])).toEqual(['Wrapped A', 'oops.', 'nope.']);
});

test('a skipped PDF is silent and not a failure', () => {
	expect(summarizeWraps([{ kind: 'skipped' }])).toEqual([]);
	expect(summarizeWraps([{ kind: 'skipped' }, ok('A'), bad('nope.')])).toEqual(['Wrapped A', 'nope.']);
});

test('the stopped notice has one full stop after the reason, whether or not the reason had one', () => {
	const tail = 'PDFs that are not wrapped are listed under documents needing attention.';
	expect(stoppedMessage('disk full')).toBe(`Automatic wrapping stopped: disk full. ${tail}`);
	expect(stoppedMessage('disk full.')).toBe(`Automatic wrapping stopped: disk full. ${tail}`);
	expect(stoppedMessage('disk full. ')).toBe(`Automatic wrapping stopped: disk full. ${tail}`);
});

const TEMPLATE_FAILED = 'Templater did not create a note for S.pdf. Check its own message, fix the template or answer its prompt, then wrap again.';
const PAUSE_TAIL = 'PDFs that are not wrapped are listed under documents needing attention.';

test('only a Templater call that handed back no note pauses automatic wrapping', () => {
	expect(pausesAutoWrap({ kind: 'template-problem', message: TEMPLATE_FAILED })).toBe(true);
	expect(pausesAutoWrap({ kind: 'failed', message: 'nope.' })).toBe(false);
	expect(pausesAutoWrap({ kind: 'wrapped', name: 'A' })).toBe(false);
	expect(pausesAutoWrap({ kind: 'incomplete', name: 'A', message: 'oops.' })).toBe(false);
	expect(pausesAutoWrap({ kind: 'skipped' })).toBe(false);
});
test('the paused notice quotes the message with one full stop, then the tail', () => {
	expect(pausedMessage(TEMPLATE_FAILED)).toBe(`Automatic wrapping paused: ${TEMPLATE_FAILED} ${PAUSE_TAIL}`);
	expect(pausedMessage('no note')).toBe(`Automatic wrapping paused: no note. ${PAUSE_TAIL}`);
});
test('a pass that paused shows the paused notice once, after the wraps before it', () => {
	expect(summarizeWraps([ok('A'), { kind: 'template-problem', message: TEMPLATE_FAILED }]))
		.toEqual(['Wrapped A', `Automatic wrapping paused: ${TEMPLATE_FAILED} ${PAUSE_TAIL}`]);
	expect(summarizeWraps([{ kind: 'template-problem', message: TEMPLATE_FAILED }]))
		.toEqual([`Automatic wrapping paused: ${TEMPLATE_FAILED} ${PAUSE_TAIL}`]);
});

// arrivingNoteFor: a PDF from outside is not wrapped while it may be half of a pair still arriving.
const marked = (notePath: string): MarkedNote => ({ notePath, markerLink: null, linkedPdf: null, ownTargets: [] });
const pairing = (notes: string[], pdfPaths: string[]) => pairUp({ notePaths: notes, pdfPaths, marked: notes.map(marked) });

test('arrivingNoteFor holds a PDF while a marked note in its folder has no PDF (a rename in transit)', () => {
	expect(arrivingNoteFor('a/New.pdf', pairing(['a/Old.md'], ['a/New.pdf']))).not.toBeNull();
	expect(arrivingNoteFor('New.pdf', pairing(['Old.md'], ['New.pdf']))).not.toBeNull();
});
test('arrivingNoteFor holds a PDF while a marked note of its name elsewhere has no PDF (a move in transit)', () => {
	expect(arrivingNoteFor('b/S.pdf', pairing(['a/S.md'], ['b/S.pdf']))).not.toBeNull();
	expect(arrivingNoteFor('b/S.PDF', pairing(['a/deep/S.md'], ['b/S.PDF']))).not.toBeNull();
});
test('arrivingNoteFor does not hold a PDF for a note elsewhere under another name, or with no marked notes', () => {
	expect(arrivingNoteFor('b/S.pdf', pairing(['a/T.md'], ['b/S.pdf']))).toBeNull();
	expect(arrivingNoteFor('b/S.pdf', pairing(['bb/T.md'], ['b/S.pdf']))).toBeNull(); // a folder whose name only starts the same
	expect(arrivingNoteFor('b/S.pdf', pairing(['b/deep/T.md'], ['b/S.pdf']))).toBeNull(); // a subfolder is not the same folder
	expect(arrivingNoteFor('b/S.pdf', pairing([], ['b/S.pdf']))).toBeNull();
});
test('arrivingNoteFor does not hold a PDF when that marked note has its PDF', () => {
	expect(arrivingNoteFor('a/New.pdf', pairing(['a/Old.md'], ['a/Old.pdf', 'a/New.pdf']))).toBeNull();
	expect(arrivingNoteFor('b/S.pdf', pairing(['a/S.md'], ['a/S.pdf', 'b/S.pdf']))).toBeNull();
});

test('arrivingNoteFor names the marked note a held PDF may belong to, or null', () => {
	expect(arrivingNoteFor('a/New.pdf', pairing(['a/Old.md'], ['a/New.pdf']))).toBe('a/Old.md');
	expect(arrivingNoteFor('b/S.pdf', pairing(['a/S.md'], ['b/S.pdf']))).toBe('a/S.md');
	expect(arrivingNoteFor('b/S.pdf', pairing(['a/T.md'], ['b/S.pdf']))).toBeNull();
});
test('the plan names each outside PDF it holds back and the note that holds it', () => {
	const s = snap(['a/Old.md'], ['a/New.pdf', 'att/x.pdf'], [marked('a/Old.md')]);
	const pending = [pend('a/New.pdf', 0, 'outside'), pend('att/x.pdf', 0, 'outside')];
	expect(planAutoWrap(pending, 5000, s, 'att')).toEqual({
		wrap: [], drop: ['a/New.pdf', 'att/x.pdf'], held: [{ pdfPath: 'a/New.pdf', notePath: 'a/Old.md' }], waitUntil: null,
	});
});
test('heldMessage names the PDF and the note', () => {
	expect(heldMessage('a/New.pdf', 'a/Old.md'))
		.toBe('a/New.pdf was not wrapped automatically: a/Old.md is a wrapped note with no PDF, and this PDF may be its PDF still arriving. It stays listed as Not wrapped.');
});
