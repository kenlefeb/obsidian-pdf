import type { Pairing } from "./model.ts";
import { basename, dirname } from "./paths.ts";
import { autoWrapChecker } from "./react.ts";
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
	// Indexed once per call: a pass over hundreds of new PDFs in a large vault must not compare every pair of files.
	const shouldWrap = autoWrapChecker(snapshot, attachmentFolder);
	for (const { path, due } of pending) {
		if (due > now) {
			plan.waitUntil = plan.waitUntil === null ? due : Math.min(plan.waitUntil, due);
		} else if (shouldWrap(path)) {
			plan.wrap.push(path);
		} else {
			plan.drop.push(path);
		}
	}
	return plan;
}

/**
 * True when an outside-arrived PDF must not be wrapped automatically: a marked note with no PDF is in the same folder
 * (a rename in transit), or has the same base name anywhere (a move in transit). That is what a pair looks like on a
 * second device while its PDF has arrived and its note has not; wrapping it would make a second note.
 */
export function heldForArrivingNote(pdfPath: string, pairing: Pairing): boolean {
	const folder = dirname(pdfPath);
	const name = basename(pdfPath);
	return pairing.pairs.some((pair) => pair.pdfPath === null
		&& (dirname(pair.note.notePath) === folder || basename(pair.note.notePath) === name));
}

/**
 * What became of one automatic wrap. `skipped` is a benign race (a note appeared at the last moment) and is silent.
 * `template-problem`: Templater handed back no note: it left none (its template failed or its prompt was cancelled),
 * or notes appeared elsewhere that are only named; see `pausesAutoWrap`.
 */
export type WrapOutcome =
	| { kind: "wrapped"; name: string }
	| { kind: "incomplete"; name: string; message: string }
	| { kind: "failed"; message: string }
	| { kind: "template-problem"; message: string }
	| { kind: "skipped" };

/**
 * True when automatic wrapping should pause after this outcome: the template would most likely fail the same way for
 * every PDF waiting, each time with Templater's own error. The pass stops, and the PDFs waiting then are not tried again
 * until a later wrap succeeds.
 */
export function pausesAutoWrap(outcome: WrapOutcome): boolean {
	return outcome.kind === "template-problem";
}

/** The notice for a pass that paused on `message` (which says what failed). */
export function pausedMessage(message: string): string {
	const trimmed = message.trim().replace(/\.+$/, "");
	return `Automatic wrapping paused: ${trimmed}. PDFs that are not wrapped are listed under documents needing attention.`;
}

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
	const paused = outcomes.find((o): o is Extract<WrapOutcome, { kind: "template-problem" }> => o.kind === "template-problem");
	if (paused) notices.push(pausedMessage(paused.message));
	return notices;
}

/** The notice for a pass that stopped on an unexpected error. */
export function stoppedMessage(reason: string): string {
	const trimmed = reason.trim().replace(/\.+$/, "");
	return `Automatic wrapping stopped: ${trimmed}. PDFs that are not wrapped are listed under documents needing attention.`;
}
