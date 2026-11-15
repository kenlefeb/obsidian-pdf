import { shouldAutoWrap } from "./react.ts";
import type { Snapshot } from "./types.ts";

/** A PDF that appeared at time `since` (ms) and has not been judged yet. */
export interface PendingPdf {
	path: string;
	since: number;
}

export interface AutoWrapPlan {
	/** Due PDFs that should be wrapped now, in arrival order. */
	wrap: string[];
	/** Due PDFs that need nothing (claimed, noted, gone or in the attachment folder): forget them. */
	drop: string[];
	/** When the earliest PDF that is not due yet becomes due, or null when none is waiting. */
	waitUntil: number | null;
}

/**
 * Judges each pending PDF once its own settle period (`settleMs` after `since`) is over, against `snapshot`.
 * A PDF that is not due yet is left alone. The snapshot must be taken after any earlier wrap has finished.
 */
export function planAutoWrap(
	pending: PendingPdf[],
	now: number,
	settleMs: number,
	snapshot: Snapshot,
	attachmentFolder: string | null,
): AutoWrapPlan {
	const plan: AutoWrapPlan = { wrap: [], drop: [], waitUntil: null };
	for (const { path, since } of pending) {
		const due = since + settleMs;
		if (due > now) {
			plan.waitUntil = plan.waitUntil === null ? due : Math.min(plan.waitUntil, due);
		} else if (shouldAutoWrap(path, snapshot, attachmentFolder)) {
			plan.wrap.push(path);
		} else {
			plan.drop.push(path);
		}
	}
	return plan;
}
