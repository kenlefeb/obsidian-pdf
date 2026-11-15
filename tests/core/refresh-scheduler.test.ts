import { expect, test } from "vitest";
import { createRefreshScheduler, type Timers } from "../../src/core/refresh-scheduler.ts";

function setup() {
	const timers = new Map<number, () => void>();
	let next = 0;
	const facade: Timers = {
		set: (fn) => {
			timers.set(++next, fn);
			return next;
		},
		clear: (h) => void timers.delete(h as number),
	};
	const calls: (() => void)[] = [];
	const refresh = () => new Promise<void>((resolve) => calls.push(resolve));
	const s = createRefreshScheduler(refresh, 2000, facade);
	return { s, timers, calls };
}
const flush = () => new Promise((r) => setTimeout(r, 0));

test("a burst of requests runs one refresh, one more after it, and one follow-up timer", async () => {
	const { s, timers, calls } = setup();
	for (let i = 0; i < 50; i++) s.request();
	expect(calls).toHaveLength(1);
	expect(timers.size).toBe(1);
	calls[0]!();
	await flush();
	expect(calls).toHaveLength(2);
	calls[1]!();
	await flush();
	expect(calls).toHaveLength(2);
});

test("the follow-up timer refreshes once and does not re-arm itself", async () => {
	const { s, timers, calls } = setup();
	s.request();
	calls[0]!();
	await flush();
	[...timers.values()][0]!();
	expect(calls).toHaveLength(2);
	calls[1]!();
	await flush();
	expect(calls).toHaveLength(2);
});

test("a failing refresh does not stop later ones", async () => {
	const timers: Timers = { set: () => 1, clear: () => undefined };
	let n = 0;
	const s = createRefreshScheduler(() => (++n === 1 ? Promise.reject(new Error("x")) : Promise.resolve()), 1, timers);
	s.request();
	await flush();
	s.request();
	expect(n).toBe(2);
});

test("cancel clears the timer and ignores later requests", () => {
	const { s, timers, calls } = setup();
	s.request();
	s.cancel();
	expect(timers.size).toBe(0);
	s.request();
	expect(calls).toHaveLength(1);
});
