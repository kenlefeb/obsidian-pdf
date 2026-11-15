import { expect, test } from 'vitest';
import { newPaths, pathList, templaterOutcome } from '../../src/core/templater-outcome.ts';

test('newPaths returns the paths present after but not before, in their order after', () => {
	expect(newPaths(['a.md', 'b.md'], ['a.md', 'c.md', 'b.md', 'd/e.md'])).toEqual(['c.md', 'd/e.md']);
	expect(newPaths(['a.md'], ['a.md'])).toEqual([]);
	expect(newPaths([], [])).toEqual([]);
});
test('newPaths ignores paths that went away and is case-sensitive like the vault', () => {
	expect(newPaths(['a.md', 'b.md'], ['a.md'])).toEqual([]);
	expect(newPaths(['a.md'], ['A.md'])).toEqual(['A.md']);
});

test('templaterOutcome: no new note means Templater created nothing (or removed what it created)', () => {
	expect(templaterOutcome(['x.md'], ['x.md'], true)).toEqual({ kind: 'none' });
	expect(templaterOutcome(['x.md'], [], true)).toEqual({ kind: 'none' });
});
test('templaterOutcome: exactly one new note, identified safely, is the note the template moved', () => {
	expect(templaterOutcome(['x.md'], ['x.md', 'elsewhere/S.md'], true)).toEqual({ kind: 'moved', path: 'elsewhere/S.md' });
});
test('templaterOutcome: one new note that cannot be identified safely is unclear', () => {
	expect(templaterOutcome([], ['elsewhere/S.md'], false)).toEqual({ kind: 'unclear', paths: ['elsewhere/S.md'] });
});
test('templaterOutcome: several new notes are unclear and all are named', () => {
	expect(templaterOutcome([], ['p.md', 'q.md'], true)).toEqual({ kind: 'unclear', paths: ['p.md', 'q.md'] });
});

test('pathList names up to three paths and counts the rest', () => {
	expect(pathList(['a.md'])).toBe('a.md');
	expect(pathList(['a.md', 'b.md', 'c.md'])).toBe('a.md, b.md, c.md');
	expect(pathList(['a.md', 'b.md', 'c.md', 'd.md'])).toBe('a.md, b.md, c.md and 1 more');
	expect(pathList(['a.md', 'b.md', 'c.md', 'd.md', 'e.md'])).toBe('a.md, b.md, c.md and 2 more');
});
