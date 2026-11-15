import { shouldAutoWrap } from "./react.ts";
import type { Snapshot } from "./types.ts";

/** How long a PDF created by an action inside Obsidian on this device settles before it is judged. */
export const AUTO_WRAP_LOCAL_SETTLE_MS = 2000;
/**
 * Any other arrival (Finder, another app, sync) waits this long plus a random extra up to the jitter, so two devices
 * that see the same PDF at the same moment rarely act together and the later one finds the first one's note.
 */
export const AUTO_WRAP_OUTSIDE_SETTLE_MS = 15000;
export const AUTO_WRAP_OUTSIDE_JITTER_MS = 15000;

/** Where a PDF came from: made by this device's own Obsidian, or arrived from outside. */
export type ArrivalOrigin = "local" | "outside";

/** When a PDF that arrived at `now` should be judged. `random` returns a number in [0, 1). */
export function autoWrapDueAt(now: number, origin: ArrivalOrigin, random: () => number = Math.random): number {
	if (origin === "local") return now + AUTO_WRAP_LOCAL_SETTLE_MS;
	return now + AUTO_WRAP_OUTSIDE_SETTLE_MS + Math.floor(random() * AUTO_WRAP_OUTSIDE_JITTER_MS);
}

/** A PDF waiting to be judged from time `due` (ms) on. */
export interface PendingPdf {
	path: string;
	due: number;
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
 * Judges each pending PDF once it is due, against `snapshot`. A PDF that is not due yet is left alone.
 * The snapshot must be taken after any earlier wrap has finished.
 */
export function planAutoWrap(
	pending: PendingPdf[],
	now: number,
	snapshot: Snapshot,
	attachmentFolder: string | null,
): AutoWrapPlan {
	const plan: AutoWrapPlan = { wrap: [], drop: [], waitUntil: null };
	for (const { path, due } of pending) {
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

/** What became of one automatic wrap. `skipped` is a benign race (a note appeared at the last moment) and is silent. */
export type WrapOutcome =
	| { kind: "wrapped"; name: string }
	| { kind: "incomplete"; name: string; message: string }
	| { kind: "failed"; message: string }
	| { kind: "skipped" };

const MAX_NAMED_WRAPS = 3;

/** The notices to show for one pass of automatic wrapping. */
export function summarizeWraps(outcomes: WrapOutcome[]): string[] {
	const wrapped = outcomes.filter((o): o is Extract<WrapOutcome, { kind: "wrapped" }> => o.kind === "wrapped");
	const incomplete = outcomes.filter((o): o is Extract<WrapOutcome, { kind: "incomplete" }> => o.kind === "incomplete");
	const failed = outcomes.filter((o): o is Extract<WrapOutcome, { kind: "failed" }> => o.kind === "failed");
	const notices: string[] = [];

	// An incomplete wrap is wrapped, so it counts here, but it is only ever named by its own message.
	if (wrapped.length + incomplete.length > MAX_NAMED_WRAPS) {
		notices.push(`Wrapped ${wrapped.length + incomplete.length} PDFs.`);
	} else {
		for (const o of wrapped) notices.push(`Wrapped ${o.name}`);
	}
	const [firstIncomplete] = incomplete;
	if (firstIncomplete) {
		notices.push(incomplete.length === 1
			? firstIncomplete.message
			: `${incomplete.length} PDFs were wrapped with problems. First: ${firstIncomplete.message}`);
	}
	const [firstFailure] = failed;
	if (firstFailure) {
		notices.push(failed.length === 1
			? firstFailure.message
			: `Could not wrap ${failed.length} PDFs. First problem: ${firstFailure.message} The rest are listed under documents needing attention.`);
	}
	return notices;
}

/** The notice for a pass that stopped on an unexpected error. */
export function stoppedMessage(reason: string): string {
	const trimmed = reason.trim().replace(/\.+$/, "");
	return `Automatic wrapping stopped: ${trimmed}. Unwrapped PDFs are listed under documents needing attention.`;
}
