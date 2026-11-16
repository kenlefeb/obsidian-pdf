export interface Timers {
	set(fn: () => void, ms: number): unknown;
	clear(handle: unknown): void;
}

/**
 * Coalesces refresh requests: at most one refresh runs at a time, requests that arrive meanwhile share one
 * further refresh, and one follow-up refresh (re-armed, never stacked) runs `delayMs` after the last request.
 */
export function createRefreshScheduler(refresh: () => Promise<unknown>, delayMs: number, timers: Timers) {
	let running = false;
	let again = false;
	let stopped = false;
	let timer: unknown = null;

	const start = (): void => {
		if (stopped) return;
		if (running) {
			again = true;
			return;
		}
		running = true;
		let pending: Promise<unknown>;
		try {
			pending = refresh();
		} catch (error) {
			pending = Promise.reject(error instanceof Error ? error : new Error(String(error)));
		}
		void pending.catch(() => undefined).then(() => {
			running = false;
			if (again) {
				again = false;
				start();
			}
		});
	};

	return {
		request(): void {
			if (stopped) return;
			start();
			if (timer !== null) timers.clear(timer);
			timer = timers.set(() => {
				timer = null;
				start();
			}, delayMs);
		},
		cancel(): void {
			stopped = true;
			if (timer !== null) timers.clear(timer);
			timer = null;
		},
	};
}
