import { expect, test } from 'vitest';
import {
	AUTO_WRAP_LOCAL_SETTLE_MS,
	AUTO_WRAP_OUTSIDE_JITTER_MS,
	AUTO_WRAP_OUTSIDE_SETTLE_MS,
	autoWrapDueAt,
	planAutoWrap,
	stoppedMessage,
	summarizeWraps,
	type WrapOutcome,
} from '../../src/core/auto-wrap.ts';
import type { NoteClaim, Snapshot } from '../../src/core/types.ts';

const snap = (notePaths: string[], pdfPaths: string[], claims: NoteClaim[] = []): Snapshot => ({ notePaths, pdfPaths, claims });
const claim = (notePath: string, pdfPath: string): NoteClaim => ({ notePath, pdfPath, rawTarget: pdfPath });
const pend = (path: string, due: number) => ({ path, due });

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
	expect(plan).toEqual({ wrap: [], drop: [], waitUntil: 3000 });
});

test('a due PDF nobody claims and no note matches is wrapped', () => {
	const plan = planAutoWrap([pend('a/New.pdf', 3000)], 3000, snap([], ['a/New.pdf']), null);
	expect(plan).toEqual({ wrap: ['a/New.pdf'], drop: [], waitUntil: null });
});

test('a due PDF whose note arrived meanwhile is dropped, not wrapped', () => {
	const plan = planAutoWrap([pend('a/New.pdf', 2000)], 5000, snap(['a/New.md'], ['a/New.pdf']), null);
	expect(plan).toEqual({ wrap: [], drop: ['a/New.pdf'], waitUntil: null });
});

test('a due PDF that a note claims, that vanished, or that sits in the attachment folder is dropped', () => {
	const s = snap(['a/Other.md'], ['a/Claimed.pdf', 'att/x.pdf'], [claim('a/Other.md', 'a/Claimed.pdf')]);
	const pending = ['a/Claimed.pdf', 'gone.pdf', 'att/x.pdf'].map((path) => pend(path, 0));
	expect(planAutoWrap(pending, 5000, s, 'att')).toEqual({ wrap: [], drop: ['a/Claimed.pdf', 'gone.pdf', 'att/x.pdf'], waitUntil: null });
});

test('a burst is judged per PDF: due ones are decided, later ones wait for their own time', () => {
	const pending = [pend('a/One.pdf', 2000), pend('a/Two.pdf', 3500), pend('a/Three.pdf', 5000)];
	const plan = planAutoWrap(pending, 3600, snap([], ['a/One.pdf', 'a/Two.pdf', 'a/Three.pdf']), null);
	expect(plan).toEqual({ wrap: ['a/One.pdf', 'a/Two.pdf'], drop: [], waitUntil: 5000 });
});

test('waitUntil is the earliest remaining due time, whatever the order', () => {
	const pending = [pend('z.pdf', 100), pend('late2.pdf', 11000), pend('late1.pdf', 9000)];
	const plan = planAutoWrap(pending, 2600, snap([], ['z.pdf', 'late1.pdf', 'late2.pdf']), null);
	expect(plan.wrap).toEqual(['z.pdf']);
	expect(plan.waitUntil).toBe(9000);
});

test('nothing pending means nothing to do', () => {
	expect(planAutoWrap([], 0, snap([], []), null)).toEqual({ wrap: [], drop: [], waitUntil: null });
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
