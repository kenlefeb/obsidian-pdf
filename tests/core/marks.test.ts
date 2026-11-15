import { expect, test } from "vitest";
import { COPY_SOURCE_TTL_MS, CopySources, IntentMarks, MARK_TTL_MS, OwnChanges, PENDING_CREATE_TTL_MS, PendingCreates } from "../../src/core/marks.ts";

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

test("intent: a file mark is consumed once", () => {
	const marks = new IntentMarks(clock().now);
	marks.mark("n.md", false);
	expect(marks.consume("n.md")).toBe(true);
	expect(marks.consume("n.md")).toBe(false);
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

test("pending creates: consumed once", () => {
	const pending = new PendingCreates(clock().now);
	pending.add("a/S 1.md");
	expect(pending.has("a/S 1.md")).toBe(true);
	expect(pending.has("a/S 1.md")).toBe(true);
	expect(pending.consume("a/S 1.md")).toBe(true);
	expect(pending.has("a/S 1.md")).toBe(false);
	expect(pending.consume("a/S 1.md")).toBe(false);
	expect(pending.consume("b.md")).toBe(false);
});

test("pending creates: expire after 10000 ms", () => {
	const c = clock();
	const pending = new PendingCreates(c.now);
	expect(PENDING_CREATE_TTL_MS).toBe(10000);
	pending.add("a.md");
	c.advance(PENDING_CREATE_TTL_MS - 1);
	expect(pending.has("a.md")).toBe(true);
	expect(pending.consume("a.md")).toBe(true);
	pending.add("b.md");
	c.advance(PENDING_CREATE_TTL_MS);
	expect(pending.has("b.md")).toBe(false);
	expect(pending.consume("b.md")).toBe(false);
});

test("pending creates: adding again restarts the expiry; clear forgets everything", () => {
	const c = clock();
	const pending = new PendingCreates(c.now);
	pending.add("a.md");
	c.advance(PENDING_CREATE_TTL_MS - 1);
	pending.add("a.md");
	c.advance(PENDING_CREATE_TTL_MS - 1);
	expect(pending.has("a.md")).toBe(true);
	pending.add("b.md");
	pending.clear();
	expect(pending.consume("a.md")).toBe(false);
	expect(pending.consume("b.md")).toBe(false);
});

test("intent: consumeFileMark answers only for a path's own file mark, and uses it up", () => {
	const marks = new IntentMarks(clock().now);
	marks.mark("n.md", false);
	expect(marks.consumeFileMark("n.md")).toBe(true);
	expect(marks.consumeFileMark("n.md")).toBe(false);
	expect(marks.consume("n.md")).toBe(false);
	expect(marks.consumeFileMark("other.md")).toBe(false);
});

test("intent: consumeFileMark is false for a path covered only by a folder mark, and leaves the folder mark", () => {
	const marks = new IntentMarks(clock().now);
	marks.mark("F", true);
	expect(marks.consumeFileMark("F/a.md")).toBe(false);
	expect(marks.consumeFileMark("F")).toBe(false);
	expect(marks.consume("F/a.md")).toBe(true);
	// A file mark inside a marked folder still counts as the file's own.
	marks.mark("F/b.md", false);
	expect(marks.consumeFileMark("F/b.md")).toBe(true);
});

test("intent: consumeFileMark ignores an expired file mark", () => {
	const c = clock();
	const marks = new IntentMarks(c.now);
	marks.mark("n.md", false);
	c.advance(MARK_TTL_MS);
	expect(marks.consumeFileMark("n.md")).toBe(false);
});

test("pending creates: forget drops an entry, so a later note at that path is not taken for it", () => {
	const pending = new PendingCreates(clock().now);
	pending.add("a/S 1.md");
	pending.add("a/T.md");
	pending.forget("a/S 1.md");
	pending.forget("missing.md");
	expect(pending.has("a/S 1.md")).toBe(false);
	expect(pending.consume("a/S 1.md")).toBe(false);
	expect(pending.has("a/T.md")).toBe(true);
});

test("copy source: taken once", () => {
	const sources = new CopySources(clock().now);
	sources.record("a/S 1.md", "a/S.md");
	expect(sources.take("a/Other.md")).toBeNull();
	expect(sources.take("a/S 1.md")).toBe("a/S.md");
	expect(sources.take("a/S 1.md")).toBeNull();
});

test("copy source: expires after 10000 ms", () => {
	const c = clock();
	const sources = new CopySources(c.now);
	sources.record("a/S 1.md", "a/S.md");
	c.advance(COPY_SOURCE_TTL_MS - 1);
	expect(sources.take("a/S 1.md")).toBe("a/S.md");
	sources.record("a/S 2.md", "a/S.md");
	c.advance(COPY_SOURCE_TTL_MS);
	expect(sources.take("a/S 2.md")).toBeNull();
});

test("copy source: a later record for the same destination replaces the earlier one", () => {
	const sources = new CopySources(clock().now);
	sources.record("a/S 1.md", "a/S.md");
	sources.record("a/S 1.md", "a/T.md");
	expect(sources.take("a/S 1.md")).toBe("a/T.md");
});
