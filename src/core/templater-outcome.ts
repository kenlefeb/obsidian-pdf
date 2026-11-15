/**
 * What Templater did when `create_new_note_from_template` returned no note and none is at the expected path, decided
 * only from the markdown files that exist before and after the call (not from an assumption about Templater):
 * - `none`: no new note exists. Templater created nothing, or created a note and removed it again (as it is believed
 *   to do when the template's code fails or its prompt is cancelled).
 * - `moved`: exactly one new note exists elsewhere and it can be identified safely: the template renamed or moved it.
 * - `unclear`: several new notes, or one that cannot be identified safely (another wrap ran Templater meanwhile).
 */
export type TemplaterOutcome =
	| { kind: "none" }
	| { kind: "moved"; path: string }
	| { kind: "unclear"; paths: string[] };

/** The paths in `after` that are not in `before`, in `after`'s order. */
export function newPaths(before: string[], after: string[]): string[] {
	const existed = new Set(before);
	return after.filter((path) => !existed.has(path));
}

/** `safe` is false when a new note may have come from something other than this Templater call. */
export function templaterOutcome(before: string[], after: string[], safe: boolean): TemplaterOutcome {
	const created = newPaths(before, after);
	if (created.length === 0) return { kind: "none" };
	const only = created[0];
	if (created.length === 1 && only !== undefined && safe) return { kind: "moved", path: only };
	return { kind: "unclear", paths: created };
}

/** Up to three paths, comma-separated, then how many more there are. */
export function pathList(paths: string[]): string {
	const shown = paths.slice(0, 3).join(", ");
	const more = paths.length - 3;
	return more > 0 ? `${shown} and ${more} more` : shown;
}
