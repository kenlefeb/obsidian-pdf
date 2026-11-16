/**
 * What to do after a Templater call that returned no note, decided only from the vault as it is after the call, never
 * from an assumption about Templater. The plugin never takes, moves, renames or edits a note it was not handed:
 * - `use-note`: a note new since the call started is at the expected path (Templater made it there, before or
 *   without returning it).
 * - `note-existed`: the note at the expected path was there before the call (for example delivered by sync while the
 *   template was being prepared): it is not this wrap's, so the wrap is refused as for any existing note. `others`:
 *   the notes that appeared during the call, named and left alone.
 * - `template-failed`: Templater returned normally and no new note exists. It created nothing, or removed what it
 *   created (as it is believed to do when the template's code fails or its prompt is cancelled).
 * - `create-manually`: Templater threw and no new note exists: create the note without Templater, as when Templater
 *   is not installed.
 * - `notes-appeared`: nothing at the expected path, but new notes exist. One may be Templater's note under another
 *   name, or they may be unrelated (sync, another plugin): only name them, and create nothing.
 */
export type TemplaterResult =
	| { kind: "use-note" }
	| { kind: "note-existed"; path: string; others: string[] }
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
 * `threw`: the Templater call threw. `atPath`: the note at the path the wrap creates, or null. `before` and `after`:
 * the vault's markdown file objects before and after the call.
 */
export function templaterResult<F extends { path: string }>(call: {
	threw: boolean;
	atPath: F | null;
	before: readonly F[];
	after: readonly F[];
}): TemplaterResult {
	const created = newFiles(call.before, call.after);
	if (call.atPath !== null) {
		if (created.includes(call.atPath)) return { kind: "use-note" };
		return { kind: "note-existed", path: call.atPath.path, others: created.map((file) => file.path) };
	}
	const paths = created.map((file) => file.path);
	if (paths.length > 0) return { kind: "notes-appeared", threw: call.threw, paths };
	return call.threw ? { kind: "create-manually" } : { kind: "template-failed" };
}

/** Up to three paths, comma-separated, then how many more there are. */
export function pathList(paths: string[]): string {
	const shown = paths.slice(0, 3).join(", ");
	const more = paths.length - 3;
	return more > 0 ? `${shown} and ${more} more` : shown;
}

/**
 * Templater handed back no note and none is beside the PDF, but notes appeared while it ran. Nothing is moved or
 * edited: the notes are named for the user to judge. `failure`: Templater's error when it threw, else null. "Beside"
 * because a note the template moved elsewhere may be among those named.
 */
export function notesAppearedMessage(pdfName: string, markerProperty: string, paths: string[], failure: string | null): string {
	const notes = `Notes created while it ran: ${pathList(paths)}.`;
	const move = `move it beside ${pdfName} and add the "${markerProperty}" property`;
	if (failure !== null) {
		return `Templater failed: ${failure}. ${notes} Nothing was created beside ${pdfName}; if one of them is its note, ` +
			`${move}, otherwise wrap again.`;
	}
	return `Templater did not return a note for ${pdfName}. ${notes} If one of them is its note, ${move}; otherwise wrap again.`;
}

/** A note was at the note path before the wrap could create one there. `others`: notes that appeared meanwhile. */
export function noteExistedMessage(pdfName: string, notePath: string, others: string[]): string {
	const refusal = `Cannot wrap ${pdfName}: a note already exists at ${notePath}.`;
	return others.length === 0 ? refusal : `${refusal} Notes created while Templater ran, left unchanged: ${pathList(others)}.`;
}
