import { expect, test } from "vitest";
import { IntentMarks, MARK_TTL_MS, OwnChanges } from "../../src/core/marks.ts";

function clock(start = 1000) {
	let now = start;
	return { now: () => now, advance: (ms: number) => { now += ms; } };
}

test("own change: consumed once", () => {
	const own = new OwnChanges(clock().now);
	own.mark("a.pdf");
	expect(own.consume("a.pdf")).toBe(true);
	expect(own.consume("a.pdf")).toBe(false);
	expect(own.consume("b.pdf")).toBe(false);
});

test("own change: expires after 5000 ms", () => {
	const c = clock();
	const own = new OwnChanges(c.now);
	own.mark("a.pdf");
	c.advance(MARK_TTL_MS - 1);
	expect(own.consume("a.pdf")).toBe(true);
	own.mark("b.pdf");
	c.advance(MARK_TTL_MS);
	expect(own.consume("b.pdf")).toBe(false);
});

test("own change: release removes the mark; release after consume is a no-op", () => {
	const own = new OwnChanges(clock().now);
	const release = own.mark("a.pdf");
	release();
	expect(own.consume("a.pdf")).toBe(false);

	const releaseB = own.mark("b.pdf");
	expect(own.consume("b.pdf")).toBe(true);
	own.mark("b.pdf");
	releaseB();
	expect(own.consume("b.pdf")).toBe(true);
});

test("own change: release removes only its own mark when the same path was marked twice", () => {
	const own = new OwnChanges(clock().now);
	const first = own.mark("a.pdf");
	own.mark("a.pdf");
	first();
	expect(own.consume("a.pdf")).toBe(true);
});

test("intent: a file mark is consumed once, peek does not consume", () => {
	const marks = new IntentMarks(clock().now);
	marks.mark("n.md", false);
	expect(marks.peek("n.md")).toBe(true);
	expect(marks.peek("n.md")).toBe(true);
	expect(marks.consume("n.md")).toBe(true);
	expect(marks.consume("n.md")).toBe(false);
	expect(marks.peek("n.md")).toBe(false);
});

test("intent: a folder mark answers for itself and everything inside until it expires", () => {
	const c = clock();
	const marks = new IntentMarks(c.now);
	marks.mark("F", true);
	expect(marks.consume("F/a.md")).toBe(true);
	expect(marks.consume("F/a.md")).toBe(true);
	expect(marks.consume("F/sub/b.pdf")).toBe(true);
	expect(marks.consume("F")).toBe(true);
	expect(marks.consume("F")).toBe(true);
	expect(marks.consume("Fx/a.md")).toBe(false);
	c.advance(MARK_TTL_MS);
	expect(marks.consume("F/a.md")).toBe(false);
});

test("intent: a file mark expires after 5000 ms", () => {
	const c = clock();
	const marks = new IntentMarks(c.now);
	marks.mark("n.md", false);
	c.advance(MARK_TTL_MS);
	expect(marks.peek("n.md")).toBe(false);
	expect(marks.consume("n.md")).toBe(false);
});

test("intent: release removes only its own mark", () => {
	const marks = new IntentMarks(clock().now);
	const first = marks.mark("n.md", false);
	marks.mark("n.md", false);
	first();
	expect(marks.consume("n.md")).toBe(true);
	const second = marks.mark("m.md", false);
	second();
	expect(marks.consume("m.md")).toBe(false);
});
