export interface CappedWait {
	/** True when the work settled (fulfilled or rejected) in time; false when the cap was hit or the wait was cancelled. */
	done: Promise<boolean>;
	/** Stops waiting at once: clears the timer and resolves `done` with false. */
	cancel: () => void;
}

/** Waits for `work` to settle, but no longer than `ms`. Never rejects. */
export function waitAtMost(work: Promise<unknown>, ms: number): CappedWait {
	let timer: ReturnType<typeof setTimeout> | null = null;
	let finish: (settled: boolean) => void = () => {};
	const done = new Promise<boolean>((resolve) => {
		finish = (settled) => {
			if (timer !== null) clearTimeout(timer);
			timer = null;
			resolve(settled);
		};
	});
	timer = setTimeout(() => finish(false), ms);
	work.then(() => finish(true), () => finish(true));
	return { done, cancel: () => finish(false) };
}
