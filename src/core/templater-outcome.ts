import { parseClaim } from "./claims.ts";
import { findFrontmatter } from "./frontmatter.ts";
import { filename } from "./paths.ts";

/**
 * What Templater did when `create_new_note_from_template` returned no note (or threw) and none is at the expected
 * path. The decision rests only on the markdown files that exist before and after the call, not on an assumption
 * about Templater:
 * - `none`: no new note exists. Templater created nothing, or created a note and removed it again (as it is believed
 *   to do when the template's code fails or its prompt is cancelled).
 * - `candidate`: exactly one new note, created during the call, and no other wrap ran meanwhile. It may be the note
 *   the template renamed or moved; the caller must still check its text (`isPlausibleTemplaterNote`).
 * - `unclear`: several new notes, or one that cannot be attributed to this call.
 */
export type TemplaterOutcome =
	| { kind: "none" }
	| { kind: "candidate"; path: string }
	| { kind: "unclear"; paths: string[] };

/**
 * How much earlier than the start of the call a new note's creation time may be and still count as made during it:
 * file systems store times coarsely (some to 2 s), and the clock that stamps files is not the one `Date.now()` reads.
 */
export const CTIME_SLACK_MS = 2000;

/**
 * The entries of `after` that are not in `before`, compared by identity, in `after`'s order. Obsidian keeps a file's
 * object when it is renamed, so a note renamed during the call is not new.
 */
export function newFiles<F extends object>(before: readonly F[], after: readonly F[]): F[] {
	const existed = new Set<F>(before);
	return after.filter((file) => !existed.has(file));
}

/**
 * The files are the vault's file objects (anything with `path` and `stat.ctime`). `startedAt` is when the call started (ms). `safe` is false when another wrap ran during the call, so a new note may
 * be that wrap's.
 */
export function templaterOutcome<F extends { path: string; stat: { ctime: number } }>(
	before: readonly F[],
	after: readonly F[],
	startedAt: number,
	safe: boolean,
): TemplaterOutcome {
	const created = newFiles(before, after);
	if (created.length === 0) return { kind: "none" };
	const only = created[0];
	if (created.length === 1 && only !== undefined && safe && only.stat.ctime >= startedAt - CTIME_SLACK_MS) {
		return { kind: "candidate", path: only.path };
	}
	return { kind: "unclear", paths: created.map((file) => file.path) };
}

function stripCr(line: string): string {
	return line.endsWith("\r") ? line.slice(0, -1) : line;
}

function escapeRegExp(s: string): string {
	return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function unquote(value: string): string {
	const v = value.trim();
	if (v.length >= 2 && (v[0] === '"' || v[0] === "'") && v[v.length - 1] === v[0]) return v.slice(1, -1).trim();
	return v;
}

/**
 * The marker's raw value in the frontmatter block `lines`, unquoted: the inline value, or the first item of a list
 * that follows the key; "" when the key is there with no value; null when the key is absent.
 */
function markerValue(lines: string[], marker: string): string | null {
	const key = new RegExp(`^["']?${escapeRegExp(marker)}["']?\\s*:(.*)$`);
	for (let i = 0; i < lines.length; i++) {
		const match = key.exec(lines[i] ?? "");
		if (!match) continue;
		const inline = unquote(match[1] ?? "");
		if (inline !== "") return inline;
		const item = /^\s*-\s*(.*)$/.exec(lines[i + 1] ?? "");
		return item ? unquote(item[1] ?? "") : "";
	}
	return null;
}

/**
 * True when a new note's text is plausibly the one Templater just made from the template for `wrappedPdf`: its
 * frontmatter has the marker property (`prepareTemplate` guarantees the template has that line), and its value is
 * empty or does not name an existing PDF other than `wrappedPdf`. An unrelated new note almost never has the marker,
 * and a wrapped note delivered by sync names its own PDF. `existingPdfs` are the vault's PDF paths. Letter case is
 * ignored when comparing PDFs.
 */
export function isPlausibleTemplaterNote(text: string, marker: string, wrappedPdf: string, existingPdfs: readonly string[]): boolean {
	const body = text.startsWith("﻿") ? text.slice(1) : text;
	const fm = findFrontmatter(body);
	if (fm === null) return false;
	const lines = body.slice(fm.blockStart, fm.blockEnd).split("\n").map(stripCr);
	const value = markerValue(lines, marker);
	if (value === null) return false;
	if (value === "" || value === "null" || value === "~") return true;
	const target = parseClaim(value)?.toLowerCase() ?? null;
	if (target === null) return true;
	const wrapped = wrappedPdf.toLowerCase();
	const others = existingPdfs.map((p) => p.toLowerCase()).filter((p) => p !== wrapped);
	if (others.includes(target)) return false;
	if (target === wrapped || filename(target) === filename(wrapped)) return true;
	return !others.some((p) => filename(p) === filename(target));
}

/** Up to three paths, comma-separated, then how many more there are. */
export function pathList(paths: string[]): string {
	const shown = paths.slice(0, 3).join(", ");
	const more = paths.length - 3;
	return more > 0 ? `${shown} and ${more} more` : shown;
}
