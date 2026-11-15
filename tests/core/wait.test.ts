import { afterEach, beforeEach, expect, test, vi } from "vitest";
import { waitAtMost } from "../../src/core/wait.ts";

beforeEach(() => {
	vi.useFakeTimers();
});
afterEach(() => {
	vi.useRealTimers();
});

test("resolves true when the work settles in time, and clears its timer", async () => {
	const wait = waitAtMost(Promise.resolve(), 10000);
	await expect(wait.done).resolves.toBe(true);
	expect(vi.getTimerCount()).toBe(0);
});

test("a rejected work counts as settled", async () => {
	const wait = waitAtMost(Promise.reject(new Error("x")), 10000);
	await expect(wait.done).resolves.toBe(true);
	expect(vi.getTimerCount()).toBe(0);
});

test("resolves false when the cap is hit first", async () => {
	const wait = waitAtMost(new Promise<void>(() => {}), 10000);
	let result: boolean | null = null;
	void wait.done.then((r) => (result = r));
	await vi.advanceTimersByTimeAsync(9999);
	expect(result).toBeNull();
	await vi.advanceTimersByTimeAsync(1);
	expect(result).toBe(false);
});

test("cancel clears the timer and resolves false", async () => {
	const wait = waitAtMost(new Promise<void>(() => {}), 10000);
	expect(vi.getTimerCount()).toBe(1);
	wait.cancel();
	expect(vi.getTimerCount()).toBe(0);
	await expect(wait.done).resolves.toBe(false);
});
