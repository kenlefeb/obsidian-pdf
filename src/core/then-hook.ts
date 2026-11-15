/** Awaits `task`, then calls `hook` (also when `task` throws). A throwing hook is logged and never changes the result or the error. */
export async function thenHook<T>(task: () => Promise<T>, hook: () => void): Promise<T> {
	try {
		return await task();
	} finally {
		try {
			hook();
		} catch (error) {
			console.error("PDF Wrapper: after-run hook failed", error);
		}
	}
}
