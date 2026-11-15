/**
 * What to do after a Templater call that returned no note, decided only from the vault as it is after the call, never
 * from an assumption about Templater. The plugin never takes, moves, renames or edits a note it was not handed:
 * - `use-note`: a note is at the expected path (Templater made it there, before or without returning it).
 * - `template-failed`: Templater returned normally and no new note exists. It created nothing, or removed what it
 *   created (as it is believed to do when the template's code fails or its prompt is cancelled).
 * - `create-manually`: Templater threw and no new note exists: create the note without Templater, as when Templater
 *   is not installed.
 * - `notes-appeared`: nothing at the expected path, but new notes exist. One may be Templater's note under another
 *   name, or they may be unrelated (sync, another plugin): only name them, and create nothing.
 */
export type TemplaterResult =
	| { kind: "use-note" }
	| { kind: "template-failed" }
	| { kind: "create-manually" }
	| { kind: "notes-appeared"; threw: boolean; paths: string[] };

/**
 * The entries of `after` that are not in `before`, compared by identity, in `after`'s order. Obsidian keeps a file's
 * object when it is renamed, so a note renamed during the call is not new.
 */
export function newFiles<F extends object>(before: readonly F[], after: readonly F[]): F[] {
	const existed = new Set<F>(before);
	return after.filter((file) => !existed.has(file));
}

/**
 * `threw`: the Templater call threw. `noteAtExpectedPath`: a note is at the path the wrap creates. `before` and
 * `after`: the vault's markdown file objects before and after the call.
 */
export function templaterResult<F extends { path: string }>(call: {
	threw: boolean;
	noteAtExpectedPath: boolean;
	before: readonly F[];
	after: readonly F[];
}): TemplaterResult {
	if (call.noteAtExpectedPath) return { kind: "use-note" };
	const paths = newFiles(call.before, call.after).map((file) => file.path);
	if (paths.length > 0) return { kind: "notes-appeared", threw: call.threw, paths };
	return call.threw ? { kind: "create-manually" } : { kind: "template-failed" };
}

/** Up to three paths, comma-separated, then how many more there are. */
export function pathList(paths: string[]): string {
	const shown = paths.slice(0, 3).join(", ");
	const more = paths.length - 3;
	return more > 0 ? `${shown} and ${more} more` : shown;
}
