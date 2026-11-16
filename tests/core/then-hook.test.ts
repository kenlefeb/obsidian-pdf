import { expect, test, vi } from "vitest";
import { thenHook } from "../../src/core/then-hook.ts";

test("calls the hook after success and after false, keeping the result", async () => {
	const hook = vi.fn();
	expect(await thenHook(async () => true, hook)).toBe(true);
	expect(await thenHook(async () => false, hook)).toBe(false);
	expect(hook).toHaveBeenCalledTimes(2);
});

test("calls the hook when the task throws, and rethrows the same error", async () => {
	const hook = vi.fn();
	const error = new Error("boom");
	await expect(thenHook(async () => { throw error; }, hook)).rejects.toBe(error);
	expect(hook).toHaveBeenCalledTimes(1);
});

test("a throwing hook is logged and changes neither result nor error", async () => {
	const log = vi.spyOn(console, "error").mockImplementation(() => undefined);
	const hook = () => { throw new Error("hook"); };
	expect(await thenHook(async () => true, hook)).toBe(true);
	const error = new Error("boom");
	await expect(thenHook(async () => { throw error; }, hook)).rejects.toBe(error);
	expect(log).toHaveBeenCalledTimes(2);
	log.mockRestore();
});

test("the hook runs after the task has finished", async () => {
	const order: string[] = [];
	await thenHook(async () => { order.push("task"); }, () => order.push("hook"));
	expect(order).toEqual(["task", "hook"]);
});
