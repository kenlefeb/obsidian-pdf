# Name-Independent Pairing Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** A wrapped note stops referring to its PDF by name (marker becomes the flag `true`, the PDF is shown by a plugin-rendered `wrapped-pdf` block), so renaming, moving or copying a pair changes file names only.

**Architecture:** The pure core gets a new model beside the old one (`model.ts`, `marker.ts`, `pairing.ts`, `block.ts`, `convert.ts`, `follow.ts`, `repairs.ts`, `list-text.ts`), each with tests. The Obsidian layer is then switched over in three steps (foundation, following, list), and the old claim-based modules are deleted last. `npm run build`, `npm test` and `npm run lint` pass at every commit; between Task 5 and Task 8 the plugin is not a coherent build to install, which is accepted.

**Tech Stack:** TypeScript, Obsidian plugin API (minAppVersion 1.8.7), Vitest, esbuild, `monkey-around`.

**Spec:** `docs/superpowers/specs/2026-11-15-name-independent-pairing-design.md` (amends `docs/superpowers/specs/2026-11-15-paired-pdf-documents-design.md`). Read both, and `CLAUDE.md`.

## Global Constraints

- Nothing under `src/core/` imports `obsidian`.
- Renaming, moving, copying or duplicating a wrapped document edits no file contents. No code path writes a link to a note's own PDF into that note.
- The plugin acts on its own only for changes identified as local; a scan (and the block renderer) never changes a file.
- A PDF is deleted only when following a local in-app delete of a healthy pair's note (setting on, `linkedElsewhere === false`), or by the confirmed "Delete the PDF" fix.
- Templates are edited by text insertion/replacement of known lines only; template frontmatter is never parsed and rewritten.
- Every fix re-checks that the item is still as listed before changing anything; actions are idempotent.
- No reading or writing of `attachment` / `attachments` **by name**. Convert treats every non-marker property alike.
- Marker property name comes from settings (default `wrapped-pdf`). The block language is the fixed string `wrapped-pdf`.
- Missing-PDF text in the block, verbatim: `No PDF named <name>.pdf beside this note.`
- List entry names, verbatim: `PDF not found`, `Links to its own PDF`, `Its note was deleted; the PDF was kept`, `Not wrapped`. Fix labels, verbatim: `Use a PDF`, `Rename note to match`, `Copy another document's PDF`, `Remove the marker`, `Convert`, `Convert all`.
- No new setting. Settings names and stored data are unchanged.
- Tabs for indentation; tests import with the `.ts` extension and take `test`/`expect` from `vitest`; console messages start `PDF Wrapper:`; single bundled `main.js`; no Node/Electron-only APIs.
- No Obsidian instance exists here. Never state that Obsidian behaviour was exercised.
- Version stays 2.0.0. No tag, no release.

## Review Focus

1. **Marker values a person can type.** `true`, `"true"`, `yes`, `1`, a link string, a one-item list holding a link → marked. `false`, the string `"false"` (any case, trimmed), `""`, whitespace, `null`, missing, `[]` → not marked. (Task 1)
2. **Convert on a property list with other entries.** `attachments: ["[[Other.png]]", "[[A.pdf|scan]]", "[[sub/A.pdf]]"]` keeps `[[Other.png]]` in place and order; a property that held only the PDF link becomes empty (`null`), not deleted. (Task 2)
3. **Body text that only looks like a link.** An embed inside a fenced code block or inline code is left alone; an embed in the middle of a line still ends up as a block on its own lines; CRLF files keep CRLF; a note with no frontmatter converts. (Task 2)
4. **Rename where the partner's new name is taken, differs only by case, or both files moved with a folder.** Taken → no action, a notice; case-only → followed; folder move → no action. (Task 3)
5. **Template folders.** A note under the Templater or core Templates folder (any depth), and the configured template file, is never marked or listed; a folder setting of `""` or `"/"` excludes nothing. (Task 1)

---

### Task 1: Core model, marker, pairing, block

**Files:**
- Create: `src/core/model.ts`, `src/core/marker.ts`, `src/core/pairing.ts`, `src/core/block.ts`
- Modify: `src/core/paths.ts` (add two helpers)
- Test: `tests/core/marker.test.ts`, `tests/core/pairing.test.ts`, `tests/core/block.test.ts`, `tests/core/paths.test.ts`

**Interfaces:**
- Consumes: `parseClaim(value: unknown): string | null` from `src/core/claims.ts` (copy its body into `marker.ts` as `markerLinkTarget`; `claims.ts` is deleted in Task 8), `dirname`, `basename`, `joinPath`, `isInFolder`, `findPathIgnoringCase` from `paths.ts`.
- Produces:

```ts
// model.ts
export interface MarkedNote {
	notePath: string;
	/** Raw target when the marker value is a link to a PDF (the old format); else null. */
	markerLink: string | null;
	/** Resolved path of markerLink; null when there is no link or it resolves to nothing. */
	linkedPdf: string | null;
	/** Raw link targets, as written anywhere in the note (properties or body), that resolve to
	 *  the PDF beside the note or to linkedPdf. Includes markerLink when it resolves. */
	ownTargets: string[];
}
export interface VaultSnapshot { notePaths: string[]; pdfPaths: string[]; marked: MarkedNote[]; }
export type PairState = "healthy" | "pdf-not-found";
export interface Pair { note: MarkedNote; pdfPath: string | null; state: PairState; }
export interface Pairing { pairs: Pair[]; unwrappedPdfs: string[]; }
export type FollowEvent =
	| { kind: "rename"; path: string; oldPath: string; local: boolean }
	| { kind: "delete"; path: string; local: boolean; wasMarked: boolean; linkedElsewhere?: boolean }
	| { kind: "create"; path: string; local: boolean; copiedFrom: string | null };
export type FileAction =
	| { type: "rename"; from: string; to: string }
	| { type: "copy"; from: string; to: string }
	| { type: "delete"; path: string }
	| { type: "wrap"; pdfPath: string }
	| { type: "removeMarker"; notePath: string }
	| { type: "convert"; notePath: string; ownTargets: string[] }
	| { type: "notice"; message: string };
export interface FollowResult { actions: FileAction[]; recheck: boolean; pendingRemoved: string | null; }
export type ListKind = "pdf-not-found" | "links-own-pdf" | "note-removed" | "unwrapped";
export interface ListItem { kind: ListKind; notePath: string | null; pdfPath: string | null; }
export type RepairId = "use-pdf" | "rename-note-to-pdf" | "copy-pdf" | "remove-marker"
	| "convert" | "delete-pdf" | "wrap" | "keep-plain";

// marker.ts
export function isMarked(value: unknown): boolean;
export function markerLinkTarget(value: unknown): string | null;
export function selfLinked(note: MarkedNote): boolean; // markerLink !== null || ownTargets.length > 0
export interface TemplateLocations { templatePath: string; templaterFolder: string | null; coreTemplatesFolder: string | null; }
export function isTemplatePath(path: string, where: TemplateLocations): boolean;

// pairing.ts
export function pairUp(snapshot: VaultSnapshot): Pairing;
export function healthyPairs(p: Pairing): { notePath: string; pdfPath: string }[];
export function pairOfNote(p: Pairing, notePath: string): Pair | null;

// block.ts
export const BLOCK_LANGUAGE = "wrapped-pdf";
export const BLOCK_TEXT = "```wrapped-pdf\n```";
export function hasBlock(text: string): boolean;        // a fence (``` or ~~~, 3+) whose info string is exactly wrapped-pdf
export function noPdfMessage(notePath: string): string;  // "No PDF named <name>.pdf beside this note."

// paths.ts (added)
export function pdfBeside(notePath: string): string;   // "a/B.md" -> "a/B.pdf"
export function noteBeside(pdfPath: string): string;   // "a/B.pdf" -> "a/B.md"
```

Rules: `pairUp` gives every marked note one `Pair`; `healthy` when `pdfBeside(notePath)` is in `pdfPaths` (exact path match; pairing is case-sensitive as `samePair` is today), else `pdf-not-found` with `pdfPath: null`. `unwrappedPdfs` = PDFs that are neither a healthy pair's PDF nor any marked note's `linkedPdf`. `isTemplatePath`: equal to `templatePath` (compare with and without `.md`), or `isInFolder` of a non-empty folder other than `/`.

- [ ] **Step 1: Write the failing tests.** Include, with these exact expectations:

```ts
test.each([true, "true", "yes", 1, "[[A.pdf]]", ["[[A.pdf]]"]])("marked: %j", (v) => expect(isMarked(v)).toBe(true));
test.each([false, "false", " False ", "", "  ", null, undefined, []])("not marked: %j", (v) => expect(isMarked(v)).toBe(false));
test("link target only for PDF links", () => {
	expect(markerLinkTarget("[[sub/A.pdf|scan]]")).toBe("sub/A.pdf");
	expect(markerLinkTarget(true)).toBeNull();
	expect(markerLinkTarget("[[A.md]]")).toBeNull();
});
test("template locations", () => {
	const where = { templatePath: "T/Wrapped PDF", templaterFolder: "T", coreTemplatesFolder: "" };
	expect(isTemplatePath("T/Wrapped PDF.md", where)).toBe(true);
	expect(isTemplatePath("T/deep/x.md", where)).toBe(true);
	expect(isTemplatePath("Notes/x.md", where)).toBe(false);
	expect(isTemplatePath("Notes/x.md", { templatePath: "", templaterFolder: "/", coreTemplatesFolder: "" })).toBe(false);
});
const note = (notePath: string, linkedPdf: string | null = null): MarkedNote =>
	({ notePath, markerLink: linkedPdf, linkedPdf, ownTargets: linkedPdf ? [linkedPdf] : [] });
test("pairs by name and folder only", () => {
	const p = pairUp({ notePaths: ["a/A.md", "a/B.md", "b/A.md"], pdfPaths: ["a/A.pdf", "c/B.pdf", "c/Z.pdf", "c/Old.pdf"],
		marked: [note("a/A.md"), note("a/B.md", "c/Old.pdf")] });
	expect(healthyPairs(p)).toEqual([{ notePath: "a/A.md", pdfPath: "a/A.pdf" }]);
	expect(pairOfNote(p, "a/B.md")?.state).toBe("pdf-not-found");
	expect(p.unwrappedPdfs).toEqual(["c/B.pdf", "c/Z.pdf"]); // c/Old.pdf is protected by the link-valued marker
});
test("block", () => {
	expect(hasBlock("x\n```wrapped-pdf\n```\n")).toBe(true);
	expect(hasBlock("~~~~wrapped-pdf\n~~~~")).toBe(true);
	expect(hasBlock("```wrapped-pdf-x\n```")).toBe(false);
	expect(noPdfMessage("a/My doc.md")).toBe("No PDF named My doc.pdf beside this note.");
});
```

- [ ] **Step 2: Run `npm test`; the new files fail to import.**
- [ ] **Step 3: Implement the four modules and the two path helpers.**
- [ ] **Step 4: Run `npm test && npm run build && npm run lint`; all pass.**
- [ ] **Step 5: Commit** `feat(core): name-independent pair model, marker flag, pairing and block`.

### Task 2: Core convert

**Files:**
- Create: `src/core/convert.ts`
- Test: `tests/core/convert.test.ts`

**Interfaces:**
- Consumes: `BLOCK_TEXT` (Task 1); `bodyOffset` from `frontmatter.ts`; the wikilink/markdown-link scanning in `src/core/links.ts` and `src/core/embeds.ts` (reuse or lift it; those two files are deleted or trimmed in Task 8, so `convert.ts` must not import from `embeds.ts`).
- Produces:

```ts
/** Mutates a parsed frontmatter object. Marker -> true. In every other property, a value that is a
 *  link to an own target is set to null; in a list, such entries are removed and the rest kept in order.
 *  Returns the names of the non-marker properties it changed. */
export function convertProperties(frontmatter: Record<string, unknown>, markerProperty: string, ownTargets: string[]): string[];
/** Body only (frontmatter untouched). Each embed of an own target becomes BLOCK_TEXT on its own
 *  lines; each plain link to one becomes its display text (alias, else the file name). */
export function convertBody(text: string, ownTargets: string[]): { text: string; embeds: number; links: number };
/** Sentence for the user after a wrap removed something the template put in; null when nothing was. */
export function convertedMessage(noteName: string, properties: string[], embeds: number, links: number): string | null;
```

A link "is to an own target" when its target, with any `#subpath` and `|alias` removed and URL-decoded for markdown links, equals one of `ownTargets` exactly. Wikilinks (`[[t]]`, `![[t]]`) and markdown links (`[x](t)`, `![x](t)`) are both handled. Text inside fenced code blocks and inline code is not touched. Line endings are preserved.

- [ ] **Step 1: Write the failing tests.** Include:

```ts
test("properties: list keeps other entries, single value emptied, marker true", () => {
	const fm: Record<string, unknown> = { "wrapped-pdf": "[[A.pdf]]", attachments: ["[[Other.png]]", "[[A.pdf|scan]]", "[[sub/A.pdf]]"], source: "[[A.pdf]]", title: "A.pdf" };
	expect(convertProperties(fm, "wrapped-pdf", ["A.pdf", "sub/A.pdf"])).toEqual(["attachments", "source"]);
	expect(fm).toEqual({ "wrapped-pdf": true, attachments: ["[[Other.png]]"], source: null, title: "A.pdf" });
});
test("body: embed becomes the block, link becomes text", () => {
	const r = convertBody("---\nx: 1\n---\n\n![[A.pdf#page=3]]\n\nSee [[A.pdf|the scan]] and [[A.pdf]] and [[B.pdf]].\n", ["A.pdf"]);
	expect(r.text).toBe("---\nx: 1\n---\n\n```wrapped-pdf\n```\n\nSee the scan and A.pdf and [[B.pdf]].\n");
	expect(r).toMatchObject({ embeds: 1, links: 2 });
});
test("body: embed mid-line gets its own lines", () => {
	expect(convertBody("before ![[A.pdf]] after\n", ["A.pdf"]).text).toBe("before\n\n```wrapped-pdf\n```\n\nafter\n");
});
test("body: code is left alone, CRLF kept, markdown links handled, no frontmatter ok", () => {
	const code = "```\n![[A.pdf]]\n```\n`![[A.pdf]]`\n";
	expect(convertBody(code, ["A.pdf"]).text).toBe(code);
	expect(convertBody("![[A.pdf]]\r\nx\r\n", ["A.pdf"]).text).toBe("```wrapped-pdf\r\n```\r\nx\r\n");
	expect(convertBody("![](My%20A.pdf) [scan](My%20A.pdf)\n", ["My A.pdf"]).links).toBe(1);
});
test("nothing to do returns the same text and a null message", () => {
	expect(convertBody("plain\n", ["A.pdf"])).toEqual({ text: "plain\n", embeds: 0, links: 0 });
	expect(convertedMessage("A", [], 0, 0)).toBeNull();
	expect(convertedMessage("A", ["attachments"], 1, 0)).toContain("attachments");
});
```

- [ ] **Step 2: Run the tests; they fail.**
- [ ] **Step 3: Implement `convert.ts`.**
- [ ] **Step 4: `npm test && npm run build && npm run lint` pass.**
- [ ] **Step 5: Commit** `feat(core): convert a note that links to its own PDF`.

### Task 3: Core follow rules and copy source

**Files:**
- Create: `src/core/follow.ts`
- Modify: `src/core/marks.ts` (add `CopySources`)
- Test: `tests/core/follow.test.ts`, `tests/core/marks.test.ts`

**Interfaces:**
- Consumes: Task 1 types, `pairUp`, `pdfBeside`, `noteBeside`; read `src/core/react.ts` for the existing handling of case-only renames, taken destinations and notices, and keep that behaviour.
- Produces:

```ts
// follow.ts — snapshot is the vault AFTER the event
export function follow(event: FollowEvent, snapshot: VaultSnapshot): FollowResult;
/** The one candidate whose text equals newText exactly; null for none or several. */
export function copySourceByText(newText: string, candidates: { notePath: string; text: string }[]): string | null;
// marks.ts
export const COPY_SOURCE_TTL_MS = 10000;
export class CopySources {
	constructor(clock?: Clock);
	record(destPath: string, sourcePath: string): void;
	take(destPath: string): string | null; // consumed by the first take; null after TTL
}
```

Rules for `follow` (not local → `{ actions: [], recheck: true, pendingRemoved: … }` exactly as `react` does today, including the kept-PDF reminder for a deleted marked note whose PDF remains):
- **rename, note:** the note at `path` is marked and `pdfBeside(oldPath)` is in the snapshot → `rename` it to `pdfBeside(path)`. If that destination exists (and is not the same file differing only by case) → one `notice`, no rename.
- **rename, PDF:** `noteBeside(oldPath)` is a marked note → `rename` it to `noteBeside(path)`; same destination rule.
- A rename where the partner is not at its old place (both moved with a folder) → no actions.
- **delete, note:** `wasMarked` and `pdfBeside(path)` exists: `linkedElsewhere === false` → `delete` the PDF; otherwise no action and `pendingRemoved` = that PDF.
- **create, note:** the note is marked, has no PDF beside it, and `copiedFrom` is the note of a healthy pair → `copy` that pair's PDF to `pdfBeside(path)`. Otherwise no actions.
- `follow` never returns `convert`, `removeMarker` or `wrap`.

- [ ] **Step 1: Write the failing tests** covering each rule above, plus: destination taken (expect exactly one `notice`), case-only rename `a/doc.md` → `a/Doc.md` with `a/doc.pdf` present (expect `rename` to `a/Doc.pdf`), folder move (expect `[]`), delete with `linkedElsewhere` `true` and `undefined` (expect no `delete`, `pendingRemoved` set), non-local delete (no `delete`), create with `copiedFrom: null` (expect `[]`), `copySourceByText` with zero / one / two identical candidates, `CopySources` take-once and expiry with an injected clock.

```ts
test("renaming the note renames the PDF and edits nothing", () => {
	const r = follow({ kind: "rename", path: "a/New.md", oldPath: "a/Old.md", local: true },
		{ notePaths: ["a/New.md"], pdfPaths: ["a/Old.pdf"], marked: [{ notePath: "a/New.md", markerLink: null, linkedPdf: null, ownTargets: [] }] });
	expect(r.actions).toEqual([{ type: "rename", from: "a/Old.pdf", to: "a/New.pdf" }]);
});
```

- [ ] **Step 2: Run; fail.**
- [ ] **Step 3: Implement.**
- [ ] **Step 4: `npm test && npm run build && npm run lint` pass.**
- [ ] **Step 5: Commit** `feat(core): follow rules that rename the partner only`.

### Task 4: Core list, repairs, auto-wrap guard

**Files:**
- Create: `src/core/repairs.ts`, `src/core/list-text.ts`
- Modify: `src/core/auto-wrap.ts` (add the guard; leave the rest)
- Test: `tests/core/repairs.test.ts`, `tests/core/list-text.test.ts`, `tests/core/auto-wrap.test.ts`

**Interfaces:**
- Consumes: Task 1 types and functions. Read `src/core/fixes.ts`, `src/core/attention.ts` and `shouldAutoWrap`/`autoWrapChecker` in `src/core/react.ts`: the unchanged behaviours (note-removed and unwrapped entries, `delete-pdf`, `wrap`, `keep-plain`, attachment-folder exclusion, bulk wrap, the pending-removed bookkeeping, row text, notice text) are carried over into the new modules with the new types.
- Produces:

```ts
// repairs.ts
export function buildList(pairing: Pairing, pendingRemoved: string[], attachmentFolder: string | null): ListItem[];
export function repairsFor(item: ListItem, pairing: Pairing): RepairId[];
export function pdfCandidates(item: ListItem, pairing: Pairing): string[];      // for use-pdf: same folder first, then same base name elsewhere; unwrapped only
export function renameCandidates(item: ListItem, pairing: Pairing): string[];   // for rename-note-to-pdf: unwrapped PDFs in the note's folder
export function copyCandidates(item: ListItem, pairing: Pairing): string[];     // for copy-pdf: healthy pairs' PDFs
export function isCurrentItem(item: ListItem, snapshot: VaultSnapshot, pairing?: Pairing): boolean;
export function planRepair(item: ListItem, repair: RepairId, snapshot: VaultSnapshot, chosenPdf?: string, pairing?: Pairing): FileAction[];
export function describeConvert(item: ListItem, pairing: Pairing): string;      // what Convert will do, shown before it runs
export function isBulkConvertible(item: ListItem, pairing: Pairing): boolean;   // links-own-pdf and the pair is healthy
export function shouldAutoWrap(pdfPath: string, snapshot: VaultSnapshot, attachmentFolder: string | null): boolean;
export function autoWrapChecker(snapshot: VaultSnapshot, attachmentFolder: string | null): (pdfPath: string) => boolean;
export function isBulkWrappable(item: ListItem, snapshot: VaultSnapshot, pairing?: Pairing): boolean;
// list-text.ts
export function stateLine(item: ListItem, pairing: Pairing): string;
export function rowFile(item: ListItem): { name: string; folder: string };
export function repairLabel(repair: RepairId): string;
export function nextPendingRemoved(saved: string[], added: string[], unwrappedPdfs: string[]): string[];
export function bulkResultMessage(kind: "convert" | "wrap", done: number, stopped: boolean): string;
export function listNotice(count: number): string;
// auto-wrap.ts (added)
/** True when an outside-arrived PDF must not be wrapped automatically: a marked note with no PDF
 *  is in the same folder, or has the same base name anywhere. */
export function heldForArrivingNote(pdfPath: string, pairing: Pairing): boolean;
```

Rules:
- One list item per marked note at most: `links-own-pdf` when `selfLinked(note)` (whether or not its PDF is beside it), else `pdf-not-found` when the pair is not healthy. Healthy, unlinked pairs are not listed.
- `repairsFor`: `pdf-not-found` → `use-pdf` (only if `pdfCandidates` non-empty), `rename-note-to-pdf` (only if `renameCandidates` non-empty), `copy-pdf` (only if `copyCandidates` non-empty), `remove-marker`. `links-own-pdf` → `convert`. `note-removed` and `unwrapped` → as `fixesFor` gives today.
- `planRepair`, each after `isCurrentItem` (else `[]`):
  - `use-pdf`: `rename` `chosenPdf` → `pdfBeside(notePath)`; `[]` unless `chosenPdf` is in `pdfCandidates` and the destination is free.
  - `rename-note-to-pdf`: `rename` the note → `noteBeside(chosenPdf)`; `[]` unless in `renameCandidates` and destination free.
  - `copy-pdf`: `copy` `chosenPdf` → `pdfBeside(notePath)`; `[]` unless in `copyCandidates` and destination free.
  - `remove-marker`: `removeMarker`.
  - `convert`: if `linkedPdf` exists and is not `pdfBeside(notePath)`: when that destination is taken, or another marked note has the same `linkedPdf`, return a single `notice` and nothing else; otherwise `rename` `linkedPdf` → `pdfBeside(notePath)` first. Then `{ type: "convert", notePath, ownTargets }` where `ownTargets` is the note's `ownTargets` plus `markerLink` if set (deduplicated).
- `isCurrentItem` compares kind, paths and (for `links-own-pdf`) `markerLink`, `linkedPdf` and `ownTargets` against a fresh pairing.

- [ ] **Step 1: Write the failing tests**: list building (healthy pair with a body link listed as `links-own-pdf`; marked note without PDF and without links as `pdf-not-found`; healthy unlinked pair absent); each repair's plan and each refusal above; `convert` with the linked PDF elsewhere and destination free (`rename` then `convert`, in that order), destination taken (one `notice`), two notes sharing a `linkedPdf` (one `notice`), linked PDF missing (`convert` only); a stale item returns `[]`; `isBulkConvertible` false when the PDF is elsewhere; labels equal the verbatim strings in Global Constraints; `heldForArrivingNote` true for same folder and for same base name elsewhere, false otherwise and false when that marked note has its PDF.
- [ ] **Step 2: Run; fail.**
- [ ] **Step 3: Implement.**
- [ ] **Step 4: `npm test && npm run build && npm run lint` pass.**
- [ ] **Step 5: Commit** `feat(core): Needs attention list and repairs for name-independent pairs`.

### Task 5: Obsidian foundation — snapshot, executor actions, template, wrap

**Files:**
- Create: `src/obsidian/vault-snapshot.ts`
- Modify: `src/obsidian/execute.ts`, `src/core/template.ts`, `src/pdf-wrapper.ts`
- Test: `tests/core/template.test.ts`

**Interfaces:**
- Consumes: Tasks 1–2. The Templater and core Templates folder lookups already in `src/pdf-wrapper.ts` (export them if they are not exported).
- Produces:

```ts
// vault-snapshot.ts
export function templateLocations(app: App, settings: PdfWrapperSettings): TemplateLocations;
export function readMarked(app: App, note: TFile, markerProperty: string): MarkedNote | null;
export function gatherVault(app: App, settings: PdfWrapperSettings): VaultSnapshot;
/** Marker -> true via processFrontMatter + convertProperties, then the body via vault.process + convertBody.
 *  Returns what was changed, for the message. */
export async function convertNote(app: App, note: TFile, markerProperty: string, ownTargets: string[]):
	Promise<{ properties: string[]; embeds: number; links: number }>;
// execute.ts
//   Executor.run accepts FileAction[] as well; new cases "convert" and "removeMarker" (own-change marked like the others).
// template.ts
export function defaultTemplate(markerProperty: string): string; // "---\n<marker>: true\n---\n\n```wrapped-pdf\n```\n"
//   ensureTemplateComponents(input, markerProperty): the needed parts are a marker line and the block.
//   TemplateCheck gains `replacedEmbed: boolean`.
```

Rules:
- `readMarked`: null for a template path, or when the marker is absent or not `isMarked`. `ownTargets` = the `link` of every entry in the file cache's `links`, `embeds` and `frontmatterLinks` whose `getFirstLinkpathDest(getLinkpath(link), note.path)` is `pdfBeside(note.path)` or `linkedPdf`, deduplicated.
- Template check (text only): missing marker line → inserted as `<marker>: true`; a marker line whose value is the placeholder link the earlier default wrote (`"[[{{title}}.pdf]]"` and the Templater equivalent recognised today) → that line's value replaced by `true`; any other marker value left alone. The placeholder embed line (and the variants recognised today) → replaced by `BLOCK_TEXT`, `replacedEmbed: true`; no block and no placeholder embed → block appended as today's embed is. `wrapPdf` tells the user when a template was changed, as it does today, naming the embed replacement.
- `wrapPdf`, after the note exists: set the marker to `true` if it is not marked, then `convertNote` with `ownTargets` from `readMarked` computed against the PDF being wrapped (compute targets from the freshly read file text if the cache has not indexed the note yet: the PDF's file name and its vault path are both own targets); if `convertedMessage` is non-null, show it as a notice. `wrapPdf` no longer calls `writeClaim`.
- Executor `convert`: skip quietly if the note is gone; otherwise `convertNote`. `removeMarker`: delete the marker property via `processFrontMatter`.

- [ ] **Step 1: Update `tests/core/template.test.ts`**: default template text equals the string above for marker `wrapped-pdf`; a template with `![[{{title}}.pdf]]` comes back with the block in that position and `replacedEmbed: true`; a template with the old default marker line gets `wrapped-pdf: true`; a template whose marker is a Templater expression is left byte-identical on that line; a complete new-style template is unchanged; the existing end-of-file-fence and frontmatter-less cases still pass with the block in place of the embed.
- [ ] **Step 2: Run; the changed expectations fail.**
- [ ] **Step 3: Implement** the template change, `vault-snapshot.ts`, the executor cases and the `wrapPdf` change. Old `src/obsidian/snapshot.ts` stays for its remaining users.
- [ ] **Step 4: `npm test && npm run build && npm run lint` pass.**
- [ ] **Step 5: Commit** `feat: wrap writes the flag and the block; convert and removeMarker actions`.

### Task 6: The block renderer

**Files:**
- Create: `src/obsidian/pdf-block.ts`
- Modify: `src/main.ts` (one call), `styles.css` (missing-PDF message style)

**Interfaces:**
- Consumes: `BLOCK_LANGUAGE`, `noPdfMessage`, `pdfBeside`.
- Produces: `export function registerPdfBlock(plugin: Plugin): void;`

Rules:
- `plugin.registerMarkdownCodeBlockProcessor(BLOCK_LANGUAGE, …)`. The handler adds a `MarkdownRenderChild` (via `ctx.addChild`) that holds the note's `TFile` (looked up from `ctx.sourcePath` once, so later renames are seen through `file.path`) and draws: the PDF beside the note if it exists, else a `div` with `noPdfMessage(file.path)`.
- Drawing the PDF: first try Obsidian's own embed for the file type, `app.embedRegistry.embedByExtension.pdf({ app, linktext, sourcePath, containerEl, depth: 0 }, pdfFile, "")` then `loadFile()`, wrapped in try/catch (undocumented API). If that is unavailable or throws, fall back to `MarkdownRenderer.render(app, "![[<path>]]", el, file.path, child)`. If both fail, show a plain internal link to the PDF. Log failures once with the `PDF Wrapper:` prefix.
- The child registers `vault.on("rename" | "create" | "delete")` and redraws only when the answer to "which PDF is beside this note" changed. Nothing here writes a file.
- The block's own content is ignored.

- [ ] **Step 1: Implement** as above and call `registerPdfBlock(this)` from `onload`.
- [ ] **Step 2: `npm test && npm run build && npm run lint` pass.**
- [ ] **Step 3: Commit** `feat: render the PDF beside the note in the wrapped-pdf block`. The report must state that rendering is unverified in Obsidian.

### Task 7: Switch following, copy, duplicate and automatic wrapping

**Files:**
- Modify: `src/obsidian/watcher.ts`, `src/obsidian/local-intent.ts`, `src/obsidian/duplicate.ts`, `src/core/duplicate.ts`, `src/obsidian/auto-wrap.ts`, `src/main.ts` (wiring only)
- Test: `tests/core/duplicate.test.ts`

**Interfaces:**
- Consumes: `follow`, `copySourceByText`, `CopySources`, `gatherVault`, `pairUp`, `heldForArrivingNote`, `shouldAutoWrap`/`autoWrapChecker` from `repairs.ts`.
- Produces: `LocalIntent` exposes `copySource(destPath: string): string | null` (reads and consumes a `CopySources` entry recorded by its `Vault.copy` wrapper for a file copy). `duplicatePaths(notePath, pdfPath, files: { notePaths: string[]; pdfPaths: string[] })`.

Rules:
- The Watcher builds `FollowEvent`s: `wasMarked` from the deleted note's previous cache (`isMarked` of the marker value; false for a template path); `copiedFrom` from `LocalIntent.copySource(path)`, and, when that is null and the created note is marked without a PDF once indexed, from `copySourceByText` over the healthy pairs' notes in the same folder (read with `vault.cachedRead`). The existing re-run of a pending create when the cache catches up stays; it is what gives the copy rule its marker.
- The settings still gate: `followRenames` for rename and copy, `followDeletes` for delete. `linkedElsewhere` is computed as today.
- No call to `writeClaim`, `rewriteEmbeds` or any note edit remains in the follow, copy or duplicate paths.
- Duplicate: copy the note, copy the PDF; `leftoverMessage` loses its marker wording.
- Automatic wrapping: for a PDF whose origin is `outside`, if `heldForArrivingNote` is true when it comes due, drop it from the queue without wrapping and without a retry.

- [ ] **Step 1: Update `tests/core/duplicate.test.ts`** for the new parameter shape and message; run; fail.
- [ ] **Step 2: Implement the switch.**
- [ ] **Step 3: `grep -rn "writeClaim\|rewriteEmbeds\|rewriteBodyEmbeds" src/obsidian/watcher.ts src/obsidian/duplicate.ts src/obsidian/auto-wrap.ts src/obsidian/local-intent.ts` prints nothing.**
- [ ] **Step 4: `npm test && npm run build && npm run lint` pass.**
- [ ] **Step 5: Commit** `feat: follow renames, deletes and copies without editing notes`.

### Task 8: Switch the list, then delete the old model

**Files:**
- Modify: `src/obsidian/attention-store.ts`, `src/ui/attention-modal.ts`, `src/obsidian/explorer-style.ts`, `src/obsidian/commands.ts`, `src/settings.ts` (only if it imports removed names), `src/core/duplicate.ts`, `src/core/links.ts` (keep only what is still imported)
- Delete: `src/core/types.ts`, `src/core/claims.ts`, `src/core/classify.ts`, `src/core/react.ts`, `src/core/fixes.ts`, `src/core/attention.ts`, `src/core/embeds.ts`, `src/core/snapshot.ts`, `src/obsidian/snapshot.ts`, and their tests (`tests/core/{claims,classify,react,fixes,attention,embeds,snapshot}.test.ts`)

**Interfaces:**
- Consumes: everything from Tasks 1–5 and 7.
- Produces: the finished plugin. `AttentionStore` holds `VaultSnapshot`, `Pairing` and `ListItem[]`.

Rules:
- The modal offers, per entry, `repairsFor`. `use-pdf`, `rename-note-to-pdf` and `copy-pdf` open the existing chooser with the matching candidate list. `convert` first shows the existing confirmation modal with `describeConvert`. `delete-pdf` keeps its confirmation.
- The bulk button reads `Convert all` and runs `convert` over the `isBulkConvertible` entries only; the bulk wrap button is unchanged. No bulk action for `PDF not found`.
- Explorer hiding takes `healthyPairs(pairing)`.
- The `metadataCache` `changed` handler stays read-only apart from the pending-create re-run.
- After the deletions, `grep -rn "core/types\|core/claims\|core/classify\|core/react\|core/fixes\|core/attention\|core/embeds\|obsidian/snapshot" src tests` prints nothing, and nothing in `src/core` is unused.

- [ ] **Step 1: Switch the four Obsidian-layer files.**
- [ ] **Step 2: Delete the old modules and tests; fix imports.**
- [ ] **Step 3: Run the grep above; it prints nothing.**
- [ ] **Step 4: `npm test && npm run build && npm run lint` pass.**
- [ ] **Step 5: Commit** `feat: Needs attention list for name-independent pairs; remove the claim model`.

### Task 9: Documents

**Files:**
- Modify: `docs/superpowers/specs/2026-11-15-paired-pdf-documents-design.md` (fold the change in as revision 7; keep the change document, linked), `README.md`, `CLAUDE.md`, `docs/manual-test-checklist.md`

Rules:
- README: what a wrapped note looks like now (`wrapped-pdf: true` and the block); what gets weaker, in the spec's words (no PDF shown without the plugin; the PDF is not an outgoing link, absent from the graph, may be flagged by "unused attachment" tools; property queries cannot follow the marker); hand-pairing by adding the property; Convert and Convert all; the automatic-wrapping guard.
- CLAUDE.md: file layout, design rules (rule about never writing a link to the note's own PDF; list of states), the undocumented APIs list gains `app.embedRegistry`.
- Checklist: put first the three checks that decide whether this change worked: (1) rename a pair on one device and see exactly one note and one PDF on the other; (2) the block shows the PDF in reading view and live preview on desktop and phone; (3) Convert on a test-build note that links to its PDF. Then copy, duplicate, auto-wrap guard, template repair.
- Every statement about behaviour inside Obsidian that has not been run says so.

- [ ] **Step 1: Update the four documents.**
- [ ] **Step 2: `grep -rn "Misnamed\|Displaced\|Extra claim\|Contested" README.md CLAUDE.md docs/manual-test-checklist.md` prints nothing.**
- [ ] **Step 3: `npm test && npm run build && npm run lint` pass.**
- [ ] **Step 4: Commit** `docs: name-independent pairing (spec revision 7, README, checklist)`.
