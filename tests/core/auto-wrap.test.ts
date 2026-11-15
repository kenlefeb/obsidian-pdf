import { expect, test } from 'vitest';
import { planAutoWrap } from '../../src/core/auto-wrap.ts';
import type { NoteClaim, Snapshot } from '../../src/core/types.ts';

const snap = (notePaths: string[], pdfPaths: string[], claims: NoteClaim[] = []): Snapshot => ({ notePaths, pdfPaths, claims });
const claim = (notePath: string, pdfPath: string): NoteClaim => ({ notePath, pdfPath, rawTarget: pdfPath });
const SETTLE = 2000;

test('a PDF is not examined before its own settle period is over', () => {
	const plan = planAutoWrap([{ path: 'a/New.pdf', since: 1000 }], 2999, SETTLE, snap([], ['a/New.pdf']), null);
	expect(plan).toEqual({ wrap: [], drop: [], waitUntil: 3000 });
});

test('a due PDF nobody claims and no note matches is wrapped', () => {
	const plan = planAutoWrap([{ path: 'a/New.pdf', since: 1000 }], 3000, SETTLE, snap([], ['a/New.pdf']), null);
	expect(plan).toEqual({ wrap: ['a/New.pdf'], drop: [], waitUntil: null });
});

test('a due PDF whose note arrived meanwhile is dropped, not wrapped', () => {
	const plan = planAutoWrap([{ path: 'a/New.pdf', since: 0 }], 5000, SETTLE, snap(['a/New.md'], ['a/New.pdf']), null);
	expect(plan).toEqual({ wrap: [], drop: ['a/New.pdf'], waitUntil: null });
});

test('a due PDF that a note claims, that vanished, or that sits in the attachment folder is dropped', () => {
	const s = snap(['a/Other.md'], ['a/Claimed.pdf', 'att/x.pdf'], [claim('a/Other.md', 'a/Claimed.pdf')]);
	const pending = ['a/Claimed.pdf', 'gone.pdf', 'att/x.pdf'].map((path) => ({ path, since: 0 }));
	const plan = planAutoWrap(pending, 5000, SETTLE, s, 'att');
	expect(plan).toEqual({ wrap: [], drop: ['a/Claimed.pdf', 'gone.pdf', 'att/x.pdf'], waitUntil: null });
});

test('a burst is judged per PDF: due ones are decided, later ones keep waiting until their own time', () => {
	const pending = [
		{ path: 'a/One.pdf', since: 0 },
		{ path: 'a/Two.pdf', since: 1500 },
		{ path: 'a/Three.pdf', since: 3000 },
	];
	const plan = planAutoWrap(pending, 3600, SETTLE, snap([], ['a/One.pdf', 'a/Two.pdf', 'a/Three.pdf']), null);
	expect(plan.wrap).toEqual(['a/One.pdf', 'a/Two.pdf']);
	expect(plan.drop).toEqual([]);
	expect(plan.waitUntil).toBe(5000);
});

test('wrap keeps arrival order and waitUntil is the earliest remaining due time', () => {
	const pending = [
		{ path: 'z.pdf', since: 500 },
		{ path: 'b.pdf', since: 100 },
		{ path: 'late2.pdf', since: 9000 },
		{ path: 'late1.pdf', since: 8000 },
	];
	const plan = planAutoWrap(pending, 2600, SETTLE, snap([], ['z.pdf', 'b.pdf', 'late1.pdf', 'late2.pdf']), null);
	expect(plan.wrap).toEqual(['z.pdf', 'b.pdf']);
	expect(plan.waitUntil).toBe(10000);
});

test('nothing pending means nothing to do and nothing to wait for', () => {
	expect(planAutoWrap([], 0, SETTLE, snap([], []), null)).toEqual({ wrap: [], drop: [], waitUntil: null });
});
