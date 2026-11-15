# Paired PDF Documents Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make a markdown note and its same-named sibling PDF behave as one document in Obsidian: wrapped in place, kept in step on in-app rename/move/delete/duplicate, protected and listed after outside changes, optionally auto-wrapped, and shown as one row in the file explorer.

**Architecture:** A pure core (`src/core/`, no Obsidian imports) classifies pairs from a plain snapshot and decides what to do for each event or fix, returning a list of actions. A thin Obsidian layer (`src/obsidian/`) gathers snapshots, detects whether a change was made locally, executes actions, and injects explorer styling. `src/main.ts` only wires lifecycle. Files and frontmatter are the only record of pairs.

**Tech Stack:** TypeScript, Obsidian plugin API (min 1.8.7), esbuild, ESLint with `eslint-plugin-obsidianmd`, Vitest (new), `monkey-around` (new, bundled).

**Spec:** `docs/superpowers/specs/2026-11-15-paired-pdf-documents-design.md` — read it before any task.

## Global Constraints

- Output is a single bundled `main.js` (CJS). `obsidian`, `electron`, `@codemirror/*`, `@lezer/*` stay external.
- `isDesktopOnly` stays `false`: no Node or Electron APIs in `src/`.
- `src/main.ts` holds lifecycle and wiring only.
- `src/core/**` must not import `obsidian`. Everything in it is unit-tested with Vitest.
- Relative imports keep the `.ts` extension, as the existing code does.
- `npm run build`, `npm run lint` and `npm test` must all pass before every commit.
- Plugin id is `pdf-wrapper`; display name "PDF Wrapper". Never `wrap-pdf`.
- `minAppVersion` is `1.8.7` (`fileManager.trashFile` needs 1.6.6, `app.loadLocalStorage` needs 1.8.7).
- Marker property default name: `wrapped-pdf`. Always read the name from settings.
- Canonical claim value: `[[<vault path to pdf>|<pdf file name>]]`.
- The plugin acts on its own only for a change positively identified as local. When unsure, treat as not local.
- The plugin deletes a PDF only when following a local in-app delete of a healthy pair's note, via `fileManager.trashFile`. Never in a scan, never for a non-local change.
- A scan never changes files.
- The file explorer is touched by generated styling rules only: no explorer internals, no DOM observers, no `<style>` elements (lint forbids them; use `document.adoptedStyleSheets`).
- The plugin does not read or write `attachment` / `attachments`.
- Wrapping has no prerequisites: a missing template is created, an incomplete one is repaired by text insertion only (never a YAML re-serialise), and any failure is reported with the path and the reason.
- No Obsidian instance exists in CI or the cloud environment. Obsidian-layer behaviour is verified by build, lint, and the owner's manual checklist; say so plainly in task reports and never claim it was run.

## Review Focus

Input classes the spec implies that are most likely to bite, each pinned by a test in the task named:

1. **File names with link or CSS metacharacters** (`[`, `]`, `|`, `#`, `"`, `\`, apostrophes). Expected: the claim round-trips and the explorer rule still matches. Tests in Task 2 (claims) and Task 4 (CSS).
2. **Uppercase or mixed-case extension** (`Statement.PDF`). Expected: treated as a PDF and paired with `Statement.md`. Tests in Task 2 and Task 3.
3. **Files at the vault root** (no parent folder). Expected: paths have no leading slash and pairing works. Tests in Task 2 and Task 3.
4. **Malformed marker values** (number, empty string, two-item list, markdown-style link, link to a non-PDF). Expected: no claim, no exception. Tests in Task 2.
5. **Destination already taken when a partner should follow.** Expected: nothing is overwritten, the user's action stands, and the pair is listed. Tests in Task 7.

---

## File Structure

| File | Responsibility |
|---|---|
| `src/core/types.ts` | Shared types: snapshot, pair states, events, actions, attention items. |
| `src/core/paths.ts` | Vault-path helpers. |
| `src/core/claims.ts` | Parse and format the marker value. |
| `src/core/settings-data.ts` | Settings shape, defaults, merge of saved data, attachment-folder interpretation. |
| `src/core/classify.ts` | Snapshot → pair states and unwrapped PDFs. |
| `src/core/embeds.ts` | Rewrite PDF embeds in note text. |
| `src/core/explorer-css.ts` | Healthy pairs → stylesheet text. |
| `src/core/template.ts` | Default template text and path; check and repair of a template's required parts. |
| `src/core/react.ts` | Vault event + snapshot → actions / recheck / pending. Auto-wrap decision. |
| `src/core/fixes.ts` | Attention items, available fixes, fix → actions, copy naming. |
| `src/obsidian/snapshot.ts` | Build a snapshot from `vault` and `metadataCache`. |
| `src/obsidian/local-intent.ts` | Mark changes made through `Vault.rename/trash/delete` as local. |
| `src/obsidian/execute.ts` | Execute actions; track the plugin's own changes. |
| `src/obsidian/watcher.ts` | Subscribe to vault events, call `react`, settle and recheck. |
| `src/obsidian/attention-store.ts` | Current attention list and persisted "note removed" entries. |
| `src/obsidian/auto-wrap.ts` | Per-device switch and wrapping of newly added PDFs. |
| `src/obsidian/explorer-style.ts` | Apply generated CSS through `adoptedStyleSheets`. |
| `src/obsidian/duplicate.ts` | "Duplicate wrapped document" command. |
| `src/ui/attention-modal.ts` | Needs attention list UI. |
| `src/pdf-wrapper.ts` | Wrap a PDF in place (modified). |
| `src/settings.ts` | Settings tab (modified). |
| `src/main.ts` | Lifecycle and wiring (modified). |
| `src/spike/spike.ts` | Throwaway spike commands (Task 5, deleted in Task 14). |
| `tests/core/*.test.ts` | Unit tests, one file per core module. |

---

### Task 1: Test runner, plain settings data, and the settings-save fix

**Files:**
- Create: `src/core/settings-data.ts`, `tests/core/settings-data.test.ts`, `vitest.config.ts`
- Modify: `src/settings.ts`, `src/main.ts`, `package.json`, `tsconfig.json`, `eslint.config.mts`, `.github/workflows/lint.yml`, `manifest.json`, `versions.json`

**Interfaces:**
- Produces:
  ```ts
  // src/core/settings-data.ts
  export interface PdfWrapperSettings {
    templatePath: string;
    markerProperty: string;
    hidePairedPdfs: boolean;
    pendingRemovedPdfs: string[];
  }
  export const DEFAULT_SETTINGS: PdfWrapperSettings; // '', 'wrapped-pdf', true, []
  export function mergeSettings(saved: unknown): PdfWrapperSettings;
  export function specificAttachmentFolder(raw: unknown): string | null;
  ```
  `plugin.settings: PdfWrapperSettings` is a plain object from here on.

- [ ] **Step 1: Add Vitest.** `npm install -D vitest`. Add script `"test": "vitest run"`. Create `vitest.config.ts` including `tests/**/*.test.ts`. Add `tests/**/*.ts` and `vitest.config.ts` to `tsconfig.json` `include`, and make sure ESLint can parse them (extend `allowDefaultProject` or the include as needed).

- [ ] **Step 2: Write the failing tests** in `tests/core/settings-data.test.ts`:

```ts
test('defaults when nothing saved', () => {
  expect(mergeSettings(null)).toEqual({ templatePath: '', markerProperty: 'wrapped-pdf', hidePairedPdfs: true, pendingRemovedPdfs: [] });
});
test('keeps valid saved values and drops unknown keys', () => {
  expect(mergeSettings({ templatePath: 'T/pdf', markerProperty: 'pdf', hidePairedPdfs: false, pendingRemovedPdfs: ['a/b.pdf'], app: {}, _attachmentsPath: 'x' }))
    .toEqual({ templatePath: 'T/pdf', markerProperty: 'pdf', hidePairedPdfs: false, pendingRemovedPdfs: ['a/b.pdf'] });
});
test('wrong types and blank marker fall back to defaults', () => {
  expect(mergeSettings({ templatePath: 5, markerProperty: '  ', hidePairedPdfs: 'yes', pendingRemovedPdfs: 'x' })).toEqual(DEFAULT_SETTINGS);
});
test('marker name is trimmed', () => {
  expect(mergeSettings({ markerProperty: ' pdf ' }).markerProperty).toBe('pdf');
});
test('result is JSON-serialisable and not the defaults object', () => {
  const s = mergeSettings({}); expect(JSON.parse(JSON.stringify(s))).toEqual(s); expect(s).not.toBe(DEFAULT_SETTINGS);
  expect(s.pendingRemovedPdfs).not.toBe(DEFAULT_SETTINGS.pendingRemovedPdfs);
});
test('specificAttachmentFolder', () => {
  expect(specificAttachmentFolder('attachments')).toBe('attachments');
  expect(specificAttachmentFolder('a/b/')).toBe('a/b');
  for (const v of ['', '/', './', './attachments', undefined, 3]) expect(specificAttachmentFolder(v)).toBeNull();
});
```

- [ ] **Step 3: Run** `npm test` — expected: FAIL, module not found.

- [ ] **Step 4: Implement `src/core/settings-data.ts`** to the signatures above.

- [ ] **Step 5: Run** `npm test` — expected: PASS.

- [ ] **Step 6: Replace the settings class.** In `src/settings.ts` delete the `PdfWrapperSettings` class and `VaultWithConfig`; re-export the type from `core/settings-data.ts`. In `src/main.ts`, `loadSettings()` becomes `this.settings = mergeSettings(await this.loadData())` and `saveSettings()` saves the plain object. `src/pdf-wrapper.ts` will not compile against the removed `attachmentsPath`; for this task only, read the attachment folder inline there so behaviour is unchanged (Task 6 removes it).

- [ ] **Step 7: Add settings UI rows** in `PdfWrapperSettingTab.display()`: a text setting "Marker property" (description: "Frontmatter property that marks a note as wrapping a PDF. Changing this does not rename the property in existing notes, so they stop being recognised until you update them.") saving the trimmed value, restoring `wrapped-pdf` if emptied; and a toggle "Hide paired PDFs in the file explorer". Sentence case throughout.

- [ ] **Step 8: Version floor and CI.** Set `minAppVersion` to `1.8.7` in `manifest.json` (`versions.json` is updated in Task 14). Add `- run: npm test` after the build step in `.github/workflows/lint.yml`.

- [ ] **Step 9: Verify** `npm run build && npm run lint && npm test` — expected: all pass with no output from lint.

- [ ] **Step 10: Commit** `fix: store settings as plain data and add unit test runner`.

---

### Task 2: Paths and claims

**Files:**
- Create: `src/core/paths.ts`, `src/core/claims.ts`, `tests/core/paths.test.ts`, `tests/core/claims.test.ts`

**Interfaces:**
- Produces:
  ```ts
  // paths.ts — vault paths use '/', no leading slash; root folder is ''
  export function dirname(path: string): string;
  export function filename(path: string): string;      // 'Statement.pdf'
  export function basename(path: string): string;      // 'Statement'
  export function extension(path: string): string;     // lower-cased, no dot
  export function joinPath(dir: string, name: string): string;
  export function isPdf(path: string): boolean;
  export function isNote(path: string): boolean;
  export function isInFolder(path: string, folder: string): boolean; // folder itself or any depth below
  export function samePair(notePath: string, pdfPath: string): boolean; // same dirname, same basename, note is .md, pdf is .pdf
  // claims.ts
  export function parseClaim(value: unknown): string | null; // link target text, without alias or #subpath
  export function formatClaim(pdfPath: string): string;
  ```

- [ ] **Step 1: Write the failing tests.**

```ts
// paths.test.ts
test('root-level files', () => {
  expect(dirname('Statement.pdf')).toBe(''); expect(joinPath('', 'a.md')).toBe('a.md');
  expect(samePair('Statement.md', 'Statement.pdf')).toBe(true);
});
test('nested', () => {
  expect(dirname('a/b/S.pdf')).toBe('a/b'); expect(filename('a/b/S.pdf')).toBe('S.pdf'); expect(basename('a/b/S.pdf')).toBe('S');
  expect(joinPath('a/b', 'S.md')).toBe('a/b/S.md');
});
test('dots in names and case of extension', () => {
  expect(basename('2024.01 Bank.v2.PDF')).toBe('2024.01 Bank.v2'); expect(extension('x.PDF')).toBe('pdf');
  expect(isPdf('x.PDF')).toBe(true); expect(isNote('x.MD')).toBe(true); expect(isPdf('x.pdf.md')).toBe(false);
  expect(samePair('a/S.md', 'a/S.PDF')).toBe(true);
});
test('samePair rejects different folder, name, or kinds', () => {
  expect(samePair('a/S.md', 'b/S.pdf')).toBe(false); expect(samePair('a/S.md', 'a/T.pdf')).toBe(false);
  expect(samePair('a/S.pdf', 'a/S.pdf')).toBe(false); expect(samePair('a/S.md', 'a/s.pdf')).toBe(false);
});
test('isInFolder', () => {
  expect(isInFolder('att/x.pdf', 'att')).toBe(true); expect(isInFolder('att/sub/x.pdf', 'att')).toBe(true);
  expect(isInFolder('attic/x.pdf', 'att')).toBe(false); expect(isInFolder('x.pdf', 'att')).toBe(false);
});

// claims.test.ts
test('parses canonical and bare links', () => {
  expect(parseClaim('[[a/S.pdf|S.pdf]]')).toBe('a/S.pdf'); expect(parseClaim('[[S.pdf]]')).toBe('S.pdf');
  expect(parseClaim('  [[S.PDF]] ')).toBe('S.PDF'); expect(parseClaim('[[a/S.pdf#page=2|x]]')).toBe('a/S.pdf');
});
test('single-item list is accepted', () => { expect(parseClaim(['[[S.pdf]]'])).toBe('S.pdf'); });
test('malformed values are not claims', () => {
  for (const v of [undefined, null, 5, true, '', 'S.pdf', '[[S]]', '[[S.md]]', '[[S.pdf]] and more', '[x](S.pdf)', [], ['[[a.pdf]]', '[[b.pdf]]'], [5], { a: 1 }])
    expect(parseClaim(v)).toBeNull();
});
test('format is canonical', () => { expect(formatClaim('a/b/S.pdf')).toBe('[[a/b/S.pdf|S.pdf]]'); expect(formatClaim('S.pdf')).toBe('[[S.pdf|S.pdf]]'); });
test('round-trips awkward names', () => {
  for (const p of ["a/It's (final) & co.pdf", 'a/50% off, v2.pdf', 'a/naïve résumé.pdf', 'a/quote "x".pdf'])
    expect(parseClaim(formatClaim(p))).toBe(p);
});
```

Note for the implementer: `[`, `]`, `|` and `#` cannot appear in an Obsidian wikilink target, so names containing them cannot round-trip. `parseClaim` returns whatever precedes the first `|` or `#`; do not try to escape. Task 6 refuses to wrap such a file with a clear notice. Add this test:

```ts
test('names with link metacharacters do not round-trip (wrap refuses them)', () => {
  expect(parseClaim(formatClaim('a/x|y.pdf'))).not.toBe('a/x|y.pdf');
});
```

and export `export function isLinkSafeName(path: string): boolean` from `claims.ts` (false when the path contains `[`, `]`, `|`, `#` or `^`), tested with one true and five false cases.

- [ ] **Step 2: Run** `npm test` — expected: FAIL, modules not found.
- [ ] **Step 3: Implement** both modules to the signatures.
- [ ] **Step 4: Run** `npm test` — expected: PASS.
- [ ] **Step 5: Commit** `feat: add path and claim helpers`.

---

### Task 3: Classify pairs

**Files:**
- Create: `src/core/types.ts`, `src/core/classify.ts`, `tests/core/classify.test.ts`

**Interfaces:**
- Consumes: `samePair`, `dirname` from Task 2.
- Produces:
  ```ts
  // types.ts
  export interface NoteClaim { notePath: string; rawTarget: string; pdfPath: string | null } // pdfPath: resolved vault path, null if unresolved
  export interface Snapshot { notePaths: string[]; pdfPaths: string[]; claims: NoteClaim[] }
  export type PairState = 'healthy' | 'missing' | 'misnamed' | 'displaced' | 'extra-claim' | 'contested';
  export interface PairStatus extends NoteClaim { state: PairState }
  export interface Classification { pairs: PairStatus[]; unwrappedPdfs: string[] }
  // classify.ts
  export function classify(snapshot: Snapshot): Classification;
  export function healthyPairs(c: Classification): { notePath: string; pdfPath: string }[];
  ```

Rules, in order, for each claim: `pdfPath === null` → `missing`. `samePair(notePath, pdfPath)` → `healthy`. Another claim on the same `pdfPath` is healthy → `extra-claim`. More than one claim on that `pdfPath` → `contested`. Same folder → `misnamed`. Otherwise → `displaced`. `unwrappedPdfs` is every entry of `pdfPaths` that no claim resolves to, in input order.

- [ ] **Step 1: Write the failing tests** using a helper `snap(notes, pdfs, claims)`; one test per row:

```ts
const c = (notePath: string, pdfPath: string | null, rawTarget = pdfPath ?? 'gone.pdf') => ({ notePath, pdfPath, rawTarget });
test('healthy', () => expect(states(['a/S.md'], ['a/S.pdf'], [c('a/S.md', 'a/S.pdf')])).toEqual(['healthy']));
test('healthy at vault root with upper-case extension', () => expect(states(['S.md'], ['S.PDF'], [c('S.md', 'S.PDF')])).toEqual(['healthy']));
test('missing', () => expect(states(['a/S.md'], [], [c('a/S.md', null)])).toEqual(['missing']));
test('misnamed', () => expect(states(['a/S.md'], ['a/T.pdf'], [c('a/S.md', 'a/T.pdf')])).toEqual(['misnamed']));
test('displaced', () => expect(states(['a/S.md'], ['att/S.pdf'], [c('a/S.md', 'att/S.pdf')])).toEqual(['displaced']));
test('copy of a healthy note is an extra claim; original stays healthy', () =>
  expect(states(['a/S.md', 'a/S 1.md'], ['a/S.pdf'], [c('a/S.md', 'a/S.pdf'), c('a/S 1.md', 'a/S.pdf')])).toEqual(['healthy', 'extra-claim']));
test('two claimants, neither matching, are contested', () =>
  expect(states(['a/X.md', 'b/Y.md'], ['a/S.pdf'], [c('a/X.md', 'a/S.pdf'), c('b/Y.md', 'a/S.pdf')])).toEqual(['contested', 'contested']));
test('unwrapped PDFs are those nobody claims', () =>
  expect(classify(snap(['a/S.md'], ['a/S.pdf', 'a/Lone.pdf', 'Other.pdf'], [c('a/S.md', 'a/S.pdf')])).unwrappedPdfs).toEqual(['a/Lone.pdf', 'Other.pdf']));
test('a misnamed claim still counts as claiming its PDF', () =>
  expect(classify(snap(['a/S.md'], ['a/T.pdf'], [c('a/S.md', 'a/T.pdf')])).unwrappedPdfs).toEqual([]));
test('empty vault', () => expect(classify(snap([], [], []))).toEqual({ pairs: [], unwrappedPdfs: [] }));
test('healthyPairs returns only healthy', () => { /* one healthy + one misnamed → length 1 with both paths */ });
```

Write a real body for the commented test.

- [ ] **Step 2: Run** `npm test` — expected: FAIL.
- [ ] **Step 3: Implement** `types.ts` and `classify.ts`.
- [ ] **Step 4: Run** `npm test` — expected: PASS.
- [ ] **Step 5: Commit** `feat: classify note and PDF pairs`.

---

### Task 4: Embed rewriting and explorer CSS

**Files:**
- Create: `src/core/embeds.ts`, `src/core/explorer-css.ts`, `tests/core/embeds.test.ts`, `tests/core/explorer-css.test.ts`

**Interfaces:**
- Produces:
  ```ts
  // Rewrites embeds of any of `oldTargets` (vault paths or bare file names of the PDF as it was) to `pdfPath`,
  // plus the template placeholders ![[{{title}}.pdf]], ![[{{file}}.pdf]], ![[{{title}}]], ![[{{file}}]].
  // Keeps any #subpath and |alias. Returns the input unchanged when nothing matches.
  export function rewriteEmbeds(content: string, oldTargets: string[], pdfPath: string): string;
  export function cssAttrValue(path: string): string; // escapes \ and " for use inside a double-quoted attribute selector
  export function buildExplorerCss(pairs: { notePath: string; pdfPath: string }[], options: { hide: boolean }): string;
  ```

`buildExplorerCss` emits, per pair: when `hide` is true, `.nav-file:has(> .nav-file-title[data-path="<pdf>"]) { display: none; }`; always, a rule adding class-free marker styling to `.nav-file-title[data-path="<note>"] .nav-file-title-content::after`. The marker's exact look is the implementer's choice; keep it to `content` plus theme CSS variables. Empty input returns `''`.

- [ ] **Step 1: Write the failing tests.**

```ts
// embeds.test.ts
test('rewrites bare, extensionless and full-path embeds', () => {
  const out = rewriteEmbeds('x ![[S.pdf]] y ![[S]] z ![[old/S.pdf]]', ['old/S.pdf', 'S.pdf', 'S'], 'new/T.pdf');
  expect(out).toBe('x ![[new/T.pdf]] y ![[new/T.pdf]] z ![[new/T.pdf]]');
});
test('keeps page subpath and alias', () => {
  expect(rewriteEmbeds('![[S.pdf#page=3|scan]]', ['S.pdf'], 'a/S.pdf')).toBe('![[a/S.pdf#page=3|scan]]');
});
test('resolves template placeholders, case-insensitively', () => {
  expect(rewriteEmbeds('![[{{title}}.pdf]] ![[{{FILE}}]]', [], 'a/S.pdf')).toBe('![[a/S.pdf]] ![[a/S.pdf]]');
});
test('leaves other embeds and plain links alone', () => {
  const s = '![[Other.pdf]] [[S.pdf]] ![[S.png]]'; expect(rewriteEmbeds(s, ['S.pdf', 'S'], 'a/S.pdf')).toBe(s);
});
test('names with regex metacharacters', () => {
  expect(rewriteEmbeds('![[a (1)+.pdf]]', ['a (1)+.pdf'], 'b/a (1)+.pdf')).toBe('![[b/a (1)+.pdf]]');
});

// explorer-css.test.ts
test('empty', () => expect(buildExplorerCss([], { hide: true })).toBe(''));
test('hides the PDF row and marks the note', () => {
  const css = buildExplorerCss([{ notePath: 'a/S.md', pdfPath: 'a/S.pdf' }], { hide: true });
  expect(css).toContain('.nav-file:has(> .nav-file-title[data-path="a/S.pdf"])'); expect(css).toContain('display: none');
  expect(css).toContain('[data-path="a/S.md"]');
});
test('hide off keeps the marker but emits no hiding rule', () => {
  const css = buildExplorerCss([{ notePath: 'a/S.md', pdfPath: 'a/S.pdf' }], { hide: false });
  expect(css).not.toContain('display: none'); expect(css).toContain('[data-path="a/S.md"]');
});
test('escapes quotes and backslashes', () => {
  expect(cssAttrValue('a/say "hi"\\x.pdf')).toBe('a/say \\"hi\\"\\\\x.pdf');
  expect(buildExplorerCss([{ notePath: 'a/q"q.md', pdfPath: 'a/q"q.pdf' }], { hide: true })).toContain('[data-path="a/q\\"q.pdf"]');
});
test('output parses as a stylesheet with two rules per pair', () => {
  // count top-level "{" in output for 3 pairs with hide:true → 6
});
```

Write a real body for the commented test.

- [ ] **Step 2: Run** `npm test` — expected: FAIL.
- [ ] **Step 3: Implement** both modules.
- [ ] **Step 4: Run** `npm test` — expected: PASS.
- [ ] **Step 5: Commit** `feat: add embed rewriting and explorer stylesheet generation`.

---

### Task 5: Spike build and owner checklist — **GATE**

Throwaway code. No unit tests. Its purpose is to answer the spec's two spikes before any behaviour that depends on them is built.

**Files:**
- Create: `src/obsidian/local-intent.ts`, `src/spike/spike.ts`, `docs/superpowers/spikes/2026-11-15-spike-checklist.md`
- Modify: `src/main.ts`, `package.json` (add `monkey-around`)

**Interfaces:**
- Produces (kept after the spike if it passes):
  ```ts
  // src/obsidian/local-intent.ts
  export class LocalIntent {
    constructor(app: App);
    install(): () => void;            // wraps Vault.rename, Vault.trash, Vault.delete with monkey-around; returns the uninstaller
    consume(path: string): boolean;   // true once if `path` was marked within the last 5000 ms
  }
  ```
  `rename` marks the file's path *before* the rename (the event's `oldPath`); `trash` and `delete` mark the file's path. For a folder, mark the folder path; `consume` also returns true (without consuming) when an unexpired folder mark is a parent of `path`.

- [ ] **Step 1: Implement `LocalIntent`** as above. `npm install monkey-around`.

- [ ] **Step 2: Implement spike commands** in `src/spike/spike.ts`, registered from `main.ts` behind `registerSpike(plugin, localIntent)`:
  - "Spike: toggle event log" — while on, for every vault `create`, `rename`, `delete` and `metadataCache` `deleted` event after layout-ready, append one line to `pdf-wrapper-spike-log.md` at the vault root: ISO time, device (`Platform.isMobile`), event, path, old path, `local=<LocalIntent.consume result>`, and for PDFs whether the file's `stat.size` is 0. Do not log the plugin's own writes to the log file.
  - "Spike: create dummy pairs" — prompts for a count, creates `_pdf-wrapper-spike/Doc N.md` and an empty `Doc N.pdf` for each.
  - "Spike: toggle hiding of dummy PDFs" — applies `buildExplorerCss` for the dummy pairs through a constructed `CSSStyleSheet` pushed to `document.adoptedStyleSheets`; toggling removes it.
  - "Spike: remove dummy pairs" — trashes the `_pdf-wrapper-spike` folder.

- [ ] **Step 3: Write the checklist** `docs/superpowers/spikes/2026-11-15-spike-checklist.md` for the owner, in plain steps with a result box per line, covering exactly the questions in the spec's "Spikes" section:
  - Spike 1, on desktop and on a phone: 300 dummy pairs then 3000; scroll to the bottom of the explorer; note gaps, missing rows, sluggishness; restart Obsidian and repeat.
  - Spike 2, once in an iCloud vault and once in an Obsidian Sync vault, with a second device open and logging on both: in-app rename, move, delete of a note and of a PDF; folder move; the same in Finder; add a new PDF by each route the owner uses (drop into Obsidian, save into the folder, scanner or share sheet on the phone). Then send back both devices' log files.
  - End with the four questions the logs must answer: is every in-app action `local=true`; is any Finder or sync-delivered change `local=true`; does a rename arrive on the other device as rename or delete-then-create and how far apart are note and PDF; how long after a new PDF appears does a note created on the first device reach the second.

- [ ] **Step 4: Verify** `npm run build && npm run lint && npm test` — expected: pass.

- [ ] **Step 5: Commit** `chore: add spike build for explorer hiding and local-intent detection`.

- [ ] **Step 6: STOP and hand to the owner.** Give them the built `main.js`, `manifest.json`, `styles.css` and the checklist. Tasks 6a and 6 (wrapping) do not depend on the results and may proceed; do not start Task 7 or later until the results are back. Then:
  - Local intent dependable (all in-app `local=true`, no outside change `local=true`): continue as planned.
  - Any in-app action not detected, or any sync/Finder change detected as local: **do not continue.** Report to the owner; the spec requires their decision.
  - Rename arrives as delete-then-create: no plan change (non-local deletes only list), but record the observed gap and set `SETTLE_MS` in Task 8 to at least twice it.
  - Explorer hiding misbehaves at the owner's document count: Task 13 ships with `hidePairedPdfs` defaulting to `false`; change `DEFAULT_SETTINGS` and its test there.
  - Record the outcome in a short "Results" section appended to the checklist file and commit it.

---

### Task 6a: Prepare the template

This task and Task 6 do not depend on the spike results and may be built before they are back.

**Files:**
- Create: `src/core/template.ts`, `tests/core/template.test.ts`

**Interfaces:**
- Consumes: `joinPath` (Task 2).
- Produces:
  ```ts
  export const DEFAULT_TEMPLATE_NAME = 'Wrapped PDF.md';
  export const DEFAULT_TEMPLATE_FOLDER = 'Templates';
  export const EMBED_LINE = '![[{{title}}.pdf]]';
  export function defaultTemplate(markerProperty: string): string; // `---\n<marker>:\n---\n\n![[{{title}}.pdf]]\n`
  export function defaultTemplatePath(folders: { templater: string | null; coreTemplates: string | null }): string;
  export function templatePathWithExtension(templatePath: string): string; // appends '.md' unless already present (case-insensitive)
  export interface TemplateCheck { text: string; added: ('marker' | 'embed')[] }
  export function ensureTemplateComponents(text: string, markerProperty: string): TemplateCheck;
  ```

Rules for `ensureTemplateComponents` — text insertion only, never a YAML parse and re-serialise:
- Frontmatter is present only when the text starts with a line that is exactly `---` and a later line is exactly `---`. Line endings (`\n` or `\r\n`) are preserved; inserted lines use the file's existing line ending (`\n` if none found).
- Marker present: some line inside the frontmatter block matches `^<marker>\s*:` with the marker name matched literally and exactly (case-sensitive). If absent and frontmatter exists, insert `<marker>:` as the first line of the block. If there is no frontmatter, prepend `---`, `<marker>:`, `---`, and a blank line.
- Embed present: the body (text after the frontmatter) contains an embed `![[target…]]` whose target, before any `|` or `#`, ends in `.pdf` case-insensitively, or contains `{{` or `<%`. If absent, append `EMBED_LINE` as the last line, separated from existing body text by one blank line, with a trailing line ending.
- `added` lists what was inserted, marker before embed. When nothing is missing, `text` is the input, identical.

`defaultTemplatePath`: a folder value is used when it is a non-empty string after trimming and stripping leading and trailing slashes, and is not `/`. Templater's folder wins over the core Templates folder; otherwise `Templates`. Result is `joinPath(folder, 'Wrapped PDF.md')`.

- [ ] **Step 1: Write the failing tests** in `tests/core/template.test.ts`:

```ts
test('default template has the marker and the embed', () => {
  expect(defaultTemplate('wrapped-pdf')).toBe('---\nwrapped-pdf:\n---\n\n![[{{title}}.pdf]]\n');
});
test('the default template needs nothing added', () => {
  const t = defaultTemplate('pdf'); expect(ensureTemplateComponents(t, 'pdf')).toEqual({ text: t, added: [] });
});
test('default path prefers Templater, then core Templates, then Templates', () => {
  expect(defaultTemplatePath({ templater: 'T', coreTemplates: 'C' })).toBe('T/Wrapped PDF.md');
  expect(defaultTemplatePath({ templater: null, coreTemplates: '/Meta/Templates/' })).toBe('Meta/Templates/Wrapped PDF.md');
  expect(defaultTemplatePath({ templater: '  ', coreTemplates: '/' })).toBe('Templates/Wrapped PDF.md');
  expect(defaultTemplatePath({ templater: null, coreTemplates: null })).toBe('Templates/Wrapped PDF.md');
});
test('templatePathWithExtension', () => {
  expect(templatePathWithExtension('T/pdf')).toBe('T/pdf.md'); expect(templatePathWithExtension('T/pdf.md')).toBe('T/pdf.md');
  expect(templatePathWithExtension('T/pdf.MD')).toBe('T/pdf.MD');
});
test('adds the marker as the first frontmatter line, leaving the rest byte-for-byte', () => {
  const t = '---\ncreated: <% tp.date.now() %>\ntags: [a, b]\n---\n# <% tp.file.title %>\n\n![[<% tp.file.title %>.pdf]]\n';
  const r = ensureTemplateComponents(t, 'wrapped-pdf');
  expect(r.added).toEqual(['marker']);
  expect(r.text).toBe('---\nwrapped-pdf:\ncreated: <% tp.date.now() %>\ntags: [a, b]\n---\n# <% tp.file.title %>\n\n![[<% tp.file.title %>.pdf]]\n');
});
test('adds frontmatter when there is none', () => {
  expect(ensureTemplateComponents('![[{{title}}.pdf]]\n', 'wrapped-pdf')).toEqual({ text: '---\nwrapped-pdf:\n---\n\n![[{{title}}.pdf]]\n', added: ['marker'] });
});
test('appends the embed when the body has none', () => {
  expect(ensureTemplateComponents('---\nwrapped-pdf:\n---\nNotes about {{title}}', 'wrapped-pdf'))
    .toEqual({ text: '---\nwrapped-pdf:\n---\nNotes about {{title}}\n\n![[{{title}}.pdf]]\n', added: ['embed'] });
});
test('empty template gets both', () => {
  expect(ensureTemplateComponents('', 'wrapped-pdf')).toEqual({ text: '---\nwrapped-pdf:\n---\n\n![[{{title}}.pdf]]\n', added: ['marker', 'embed'] });
});
test('existing marker with a value, or a different marker name', () => {
  expect(ensureTemplateComponents('---\nwrapped-pdf: "[[x.pdf]]"\n---\n![[a.pdf]]\n', 'wrapped-pdf').added).toEqual([]);
  expect(ensureTemplateComponents('---\nwrapped-pdf:\n---\n![[a.pdf]]\n', 'pdf').added).toEqual(['marker']);
  expect(ensureTemplateComponents('---\nwrapped-pdf-old:\n---\n![[a.pdf]]\n', 'wrapped-pdf').added).toEqual(['marker']);
});
test('what counts as an embed', () => {
  const has = (body: string) => !ensureTemplateComponents('---\nm:\n---\n' + body, 'm').added.includes('embed');
  expect(has('![[Scan.PDF]]')).toBe(true); expect(has('![[a/b.pdf#page=2|x]]')).toBe(true);
  expect(has('![[{{title}}]]')).toBe(true); expect(has('![[<% tp.file.title %>]]')).toBe(true);
  expect(has('[[a.pdf]]')).toBe(false); expect(has('![[photo.png]]')).toBe(false); expect(has('a.pdf')).toBe(false);
});
test('an embed mentioned only in the frontmatter does not count', () => {
  expect(ensureTemplateComponents('---\nm:\ncover: "![[a.pdf]]"\n---\ntext\n', 'm').added).toEqual(['embed']);
});
test('CRLF files keep CRLF', () => {
  const r = ensureTemplateComponents('---\r\ntitle: x\r\n---\r\nbody\r\n', 'm');
  expect(r.text).toBe('---\r\nm:\r\ntitle: x\r\n---\r\nbody\r\n\r\n![[{{title}}.pdf]]\r\n');
});
test('an unclosed frontmatter fence is treated as no frontmatter', () => {
  const r = ensureTemplateComponents('---\ntitle: x\nbody', 'm');
  expect(r.text.startsWith('---\nm:\n---\n\n---\ntitle: x\nbody')).toBe(true);
});
test('marker names with regex metacharacters are matched literally', () => {
  expect(ensureTemplateComponents('---\na.b:\n---\n![[x.pdf]]\n', 'a.b').added).toEqual([]);
  expect(ensureTemplateComponents('---\naxb:\n---\n![[x.pdf]]\n', 'a.b').added).toEqual(['marker']);
});
test('running it twice changes nothing the second time', () => {
  const once = ensureTemplateComponents('hello', 'm').text; expect(ensureTemplateComponents(once, 'm')).toEqual({ text: once, added: [] });
});
```

- [ ] **Step 2: Run** `npm test` — expected: FAIL, module not found.
- [ ] **Step 3: Implement** `src/core/template.ts`.
- [ ] **Step 4: Run** `npm test` — expected: PASS.
- [ ] **Step 5: Commit** `feat: prepare wrap templates without prerequisites`.

---

### Task 6: Wrap in place with the marker property

**Files:**
- Create: `src/obsidian/snapshot.ts`
- Modify: `src/pdf-wrapper.ts`, `src/main.ts`

**Interfaces:**
- Consumes: `parseClaim`, `formatClaim`, `isLinkSafeName` (Task 2); `Snapshot`, `NoteClaim` (Task 3); `rewriteEmbeds` (Task 4); `PdfWrapperSettings` (Task 1); `defaultTemplate`, `defaultTemplatePath`, `templatePathWithExtension`, `ensureTemplateComponents` (Task 6a).
- Produces:
  ```ts
  // src/obsidian/snapshot.ts
  export function readClaim(app: App, note: TFile, markerProperty: string): NoteClaim | null; // from metadataCache frontmatter; resolves with metadataCache.getFirstLinkpathDest(target, note.path)
  export function gatherSnapshot(app: App, markerProperty: string): Snapshot;
  export async function writeClaim(app: App, note: TFile, markerProperty: string, pdfPath: string, oldTargets: string[]): Promise<void>; // processFrontMatter sets the marker to formatClaim(pdfPath), then rewrites embeds in the body via vault.process
  // src/pdf-wrapper.ts
  export async function prepareTemplate(app: App, settings: PdfWrapperSettings, saveSettings: () => Promise<void>): Promise<TFile>; // creates or repairs the template; throws Error with a user-facing message
  export async function wrapPdf(app: App, settings: PdfWrapperSettings, saveSettings: () => Promise<void>, pdfFile: TFile, options: { open: boolean }): Promise<TFile>;
  ```
  Frontmatter key lookup for the marker is exact-match on the configured name.

- [ ] **Step 1: Implement `snapshot.ts`.** `gatherSnapshot` lists `vault.getFiles()` split by `isNote`/`isPdf` and collects `readClaim` for every note.

- [ ] **Step 2: Rewrite `wrapPdf`.** Remove `resolveAttachmentFolder`, `ensureFolder`, `updateFrontmatter`, `updateEmbedLinks` and every use of the attachment folder; the PDF is not moved. Keep `createNoteFromTemplate` and the Templater / core Templates code unchanged. New order: refuse if `!isLinkSafeName(pdfFile.path)` (message: "Cannot wrap <name>: file names containing [ ] | # ^ cannot be linked. Rename the PDF first."); refuse if the sibling note exists; `prepareTemplate` (below); create the note; `writeClaim(app, note, settings.markerProperty, pdfFile.path, [pdfFile.name, pdfFile.basename])`; open the note only when `options.open`. If Templater returns a file at a different path than `<folder>/<basename>.md` (a template that renames itself), move it back with `fileManager.renameFile` before writing the claim.

- [ ] **Step 2b: Implement `prepareTemplate`** in `src/pdf-wrapper.ts`. Wrapping has no prerequisites (spec, "No prerequisites"):
  - If `settings.templatePath` is empty: path = `defaultTemplatePath({ templater, coreTemplates })`, reading Templater's folder from `app.plugins.plugins['templater-obsidian'].settings.templates_folder` and the core plugin's from `internalPlugins.getPluginById('templates').instance.options.folder` (both undocumented; guard every step, treat anything unexpected as `null`). Create missing parent folders, create the file with `defaultTemplate(settings.markerProperty)`, store the path in `settings.templatePath` in the same form the settings tab stores it (without `.md`), `await saveSettings()`, Notice "Created a default template at <path>." If a file already exists at that path, use it instead of overwriting.
  - If `settings.templatePath` is set but no file exists at `templatePathWithExtension(...)`: create the default there (parents too), Notice "The template <path> was missing, so a default was created there." The setting is not changed.
  - Then, for whichever template file is in hand: read it, `ensureTemplateComponents(text, settings.markerProperty)`; if `added` is non-empty, write the new text with `vault.modify` and Notice "Updated the template <path>: added <the marker property `<name>` | a PDF embed | both, joined with ' and '>."
  - Every failure throws an `Error` whose message names the path and the reason: "Could not create the default template at <path>: <reason>." / "Could not update the template <path>: <reason>." / "<path> is a folder, not a template file." Reasons come from the caught error's message; a folder or non-markdown file at the path is detected explicitly. Nothing is swallowed.
  - Remove the "No PDF template configured" check and notice from `main.ts`; `handleWrapPdf` shows `Failed to wrap <name>: <message>` for any thrown error.

- [ ] **Step 3: Update `main.ts`.** Pass `() => this.saveSettings()` to `wrapPdf`. File-menu item passes `{ open: true }`. Add command id `wrap-active-pdf`, name "Wrap active PDF", using `checkCallback` that is available only when the active file is a PDF with no sibling note.

- [ ] **Step 4: Verify** `npm run build && npm run lint && npm test` — expected: pass.

- [ ] **Step 5: Add to the manual checklist** (create `docs/manual-test-checklist.md`): wrap from file menu and from palette; note appears beside the PDF; PDF did not move; marker property present in canonical form even when the template has no frontmatter; `![[{{title}}.pdf]]` in the template renders the PDF; wrapping `a|b.pdf` is refused; wrapping when the note exists is refused; with and without Templater. Fresh install with no template set: wrapping creates `Templates/Wrapped PDF.md` (or in the Templater / core Templates folder when one is set), fills the setting, and the note shows the PDF. Template setting pointing at a deleted file: a default appears at that path. A template with no frontmatter and no embed gains both and a notice says so; a Templater template with `<% %>` expressions in its frontmatter is otherwise unchanged byte for byte; wrapping again adds nothing. A folder named like the template path produces a notice naming it.

- [ ] **Step 6: Commit** `feat: wrap PDFs in place with a dedicated marker property`.

---

### Task 7: Decide reactions to vault events

**Files:**
- Create: `src/core/react.ts`, `tests/core/react.test.ts`
- Modify: `src/core/types.ts`

**Interfaces:**
- Consumes: Tasks 2–3.
- Produces:
  ```ts
  // types.ts
  export type VaultEvent =
    | { kind: 'rename'; path: string; oldPath: string; local: boolean }
    | { kind: 'delete'; path: string; local: boolean; claimedPdf: string | null } // for a deleted note: its resolved claim from the previous cache
    | { kind: 'create'; path: string; local: boolean };
  export type Action =
    | { type: 'rename'; from: string; to: string }
    | { type: 'copy'; from: string; to: string }
    | { type: 'setClaim'; notePath: string; pdfPath: string; oldTargets: string[] }
    | { type: 'removeClaim'; notePath: string }
    | { type: 'delete'; path: string }
    | { type: 'wrap'; pdfPath: string }
    | { type: 'notice'; message: string };
  export interface Reaction { actions: Action[]; recheck: boolean; pendingRemoved: string | null }
  // react.ts
  export function react(event: VaultEvent, snapshot: Snapshot): Reaction; // snapshot is taken AFTER the event
  export function shouldAutoWrap(pdfPath: string, snapshot: Snapshot, attachmentFolder: string | null): boolean;
  ```

Decision rules (the snapshot reflects the vault after the event):

*Rename of a note* (`isNote(path)`), with `claim` = that note's claim:
- No claim → nothing.
- `samePair(path, claim.pdfPath)` (partner already beside it, e.g. folder move) → `setClaim` only; `recheck: false`.
- Partner still at the old pair location, i.e. `claim.pdfPath !== null && samePair(oldPath, claim.pdfPath)`:
  - not `local` → no actions, `recheck: true`.
  - `local`, destination `joinPath(dirname(path), basename(path) + '.' + <partner's own extension, case preserved>)` free (not in `pdfPaths` or `notePaths`) → `rename` then `setClaim` with `oldTargets` = old PDF path, its file name, its base name.
  - `local`, destination taken → one `notice` ("Could not rename <pdf> to match <note>: a file with that name already exists."), `recheck: true`.
- Anything else (pair was already broken, or partner not found) → no actions, `recheck: true`.

*Rename of a PDF* (`isPdf(path)`): find the note at the old pair location (`samePair(note, oldPath)`) whose claim has `pdfPath === path`, or `pdfPath === null` with `rawTarget` equal to `oldPath` or `filename(oldPath)`. None → nothing. If that note already `samePair`s the new path → `setClaim` only. Otherwise mirror the note rules with roles swapped (rename the note to `basename(path) + '.md'` in `dirname(path)`).

*Delete of a note* with `claimedPdf` non-null, `samePair(path, claimedPdf)`, PDF still in `pdfPaths`:
- another claim in the snapshot resolves to `claimedPdf` → nothing.
- `local` → `[{ type: 'delete', path: claimedPdf }]`.
- not `local` → no actions, `recheck: true`, `pendingRemoved: claimedPdf`.
- Otherwise (broken pair, or PDF already gone) → nothing.

*Delete of a PDF*, any origin → no actions, `recheck: true`.

*Create* → no actions; `recheck: true` when the path is a note or PDF. (Auto-wrap is decided separately.)

`shouldAutoWrap`: true only when `pdfPath` is in `pdfPaths`, no claim resolves to it, no note `samePair`s it, and (`attachmentFolder === null` or not `isInFolder(pdfPath, attachmentFolder)`).

- [ ] **Step 1: Write the failing tests**, one per rule above. At minimum:

```ts
test('local note rename moves the PDF and rewrites the claim', () => {
  const r = react({ kind: 'rename', path: 'b/New.md', oldPath: 'a/Old.md', local: true },
    snap(['b/New.md'], ['a/Old.pdf'], [c('b/New.md', 'a/Old.pdf')]));
  expect(r.actions).toEqual([
    { type: 'rename', from: 'a/Old.pdf', to: 'b/New.pdf' },
    { type: 'setClaim', notePath: 'b/New.md', pdfPath: 'b/New.pdf', oldTargets: ['a/Old.pdf', 'Old.pdf', 'Old'] }]);
  expect(r.recheck).toBe(false); expect(r.pendingRemoved).toBeNull();
});
test('partner extension case is preserved', () => { /* a/Old.PDF → b/New.PDF */ });
test('non-local note rename does nothing but asks for a recheck', () => { /* same input, local:false → actions [], recheck true */ });
test('destination taken: nothing is renamed, user is told, pair is rechecked', () => {
  const r = react({ kind: 'rename', path: 'a/New.md', oldPath: 'a/Old.md', local: true },
    snap(['a/New.md'], ['a/Old.pdf', 'a/New.pdf'], [c('a/New.md', 'a/Old.pdf')]));
  expect(r.actions.map(a => a.type)).toEqual(['notice']); expect(r.recheck).toBe(true);
});
test('destination taken by a note of the same name when the PDF was renamed', () => { /* PDF a/Old.pdf→a/New.pdf, a/New.md exists → notice only */ });
test('folder move: partner already beside the note → setClaim only', () => { /* rename a/S.md→z/S.md, pdf z/S.pdf, claim resolves to z/S.pdf */ });
test('folder move: partner event not yet arrived → recheck only', () => { /* claim pdfPath null, rawTarget a/S.pdf, no z/S.pdf */ });
test('local PDF rename renames the note', () => { /* note a/Old.md claim pdfPath a/New.pdf → rename note to a/New.md + setClaim */ });
test('local PDF rename with unresolved claim matched by rawTarget', () => { /* claim pdfPath null rawTarget 'a/Old.pdf' */ });
test('renaming an unclaimed PDF or an unmarked note does nothing', () => {});
test('local delete of a healthy note deletes the PDF', () => {
  expect(react({ kind: 'delete', path: 'a/S.md', local: true, claimedPdf: 'a/S.pdf' }, snap([], ['a/S.pdf'], [])).actions)
    .toEqual([{ type: 'delete', path: 'a/S.pdf' }]);
});
test('non-local delete protects the PDF', () => {
  const r = react({ kind: 'delete', path: 'a/S.md', local: false, claimedPdf: 'a/S.pdf' }, snap([], ['a/S.pdf'], []));
  expect(r.actions).toEqual([]); expect(r.pendingRemoved).toBe('a/S.pdf'); expect(r.recheck).toBe(true);
});
test('local delete leaves a PDF another note still claims', () => { /* snapshot has c('a/S 1.md','a/S.pdf') → actions [] */ });
test('local delete of a broken pair\'s note does nothing', () => { /* claimedPdf 'att/S.pdf' → [] */ });
test('delete of a PDF never deletes the note', () => { /* local:true → actions [], recheck true */ });
test('shouldAutoWrap', () => {
  const s = snap(['a/S.md', 'a/N.md'], ['a/S.pdf', 'a/N.pdf', 'a/New.pdf', 'att/x.pdf'], [c('a/S.md', 'a/S.pdf')]);
  expect(shouldAutoWrap('a/New.pdf', s, 'att')).toBe(true);
  expect(shouldAutoWrap('a/S.pdf', s, 'att')).toBe(false);   // claimed
  expect(shouldAutoWrap('a/N.pdf', s, 'att')).toBe(false);   // note of that name exists
  expect(shouldAutoWrap('att/x.pdf', s, 'att')).toBe(false); // attachment folder
  expect(shouldAutoWrap('att/x.pdf', s, null)).toBe(true);
  expect(shouldAutoWrap('gone.pdf', s, null)).toBe(false);
});
```

Write real bodies for every commented test using the same helpers.

- [ ] **Step 2: Run** `npm test` — expected: FAIL.
- [ ] **Step 3: Implement** `react.ts`.
- [ ] **Step 4: Run** `npm test` — expected: PASS.
- [ ] **Step 5: Commit** `feat: decide pair reactions to vault events`.

---

### Task 8: Execute actions and follow in-app changes

**Files:**
- Create: `src/obsidian/execute.ts`, `src/obsidian/watcher.ts`
- Modify: `src/main.ts`, `src/spike/spike.ts` (share the one `LocalIntent`)

**Interfaces:**
- Consumes: `LocalIntent` (Task 5), `react`, `VaultEvent`, `Action` (Task 7), `gatherSnapshot`, `readClaim`, `writeClaim` (Task 6), `wrapPdf` (Task 6).
- Produces:
  ```ts
  // execute.ts
  export class OwnChanges { mark(path: string): void; consume(path: string): boolean } // same 5000 ms expiry as LocalIntent
  export class Executor {
    constructor(app: App, getSettings: () => PdfWrapperSettings, saveSettings: () => Promise<void>, own: OwnChanges);
    run(actions: Action[]): Promise<void>; // sequential; stops at the first failure, shows a Notice with the error, and rethrows
  }
  // watcher.ts
  export const SETTLE_MS = 2000; // replace with the value from the Task 5 results
  export class Watcher {
    constructor(plugin: Plugin, deps: { localIntent: LocalIntent; own: OwnChanges; executor: Executor; getSettings: () => PdfWrapperSettings; onRecheck: (pendingRemoved: string | null) => void });
    start(): void; // registers handlers inside workspace.onLayoutReady
  }
  ```

Execution of each action: `rename` → `own.mark(from)` then `fileManager.renameFile`, refusing (throw) if `to` exists. `copy` → `own.mark(to)` then `vault.copy`, refusing if `to` exists. `setClaim` → `writeClaim`. `removeClaim` → `processFrontMatter` deleting the marker key. `delete` → no-op if the file no longer exists (a folder delete removes both); otherwise `own.mark(path)` then `fileManager.trashFile`. `wrap` → `wrapPdf(app, settings, saveSettings, pdf, { open: false })` after marking the note path (the Executor is constructed with a `saveSettings` callback as well as `getSettings`). `notice` → `new Notice(message)`.

Watcher: on `vault` `rename` and `create`, and on `metadataCache` `deleted` (notes, with `claimedPdf` resolved from `prevCache.frontmatter[markerProperty]` via `parseClaim` and `getFirstLinkpathDest`) and `vault` `delete` (PDFs only): skip if `own.consume(path or oldPath)`; compute `local = localIntent.consume(oldPath ?? path)`; `react(event, gatherSnapshot(...))`; run the actions; if `recheck`, call `onRecheck(pendingRemoved)` once after `SETTLE_MS`, coalescing calls that fall within the same window. Folder rename events are ignored (their children fire their own).

- [ ] **Step 1: Implement** `execute.ts` and `watcher.ts`.
- [ ] **Step 2: Wire in `main.ts`**: create one `LocalIntent`, `register(localIntent.install())`, one `OwnChanges`, one `Executor`, one `Watcher` with `onRecheck` a no-op for now; `watcher.start()`.
- [ ] **Step 3: Verify** `npm run build && npm run lint && npm test` — expected: pass.
- [ ] **Step 4: Add to the manual checklist:** rename a wrapped note in the explorer → PDF follows, embed still renders, marker updated; move it to another folder; drag a folder of pairs; rename the PDF from its tab → note follows; delete the note → PDF gone the same way (check the system or vault trash per the Obsidian setting); delete only the PDF → note remains; rename a note onto a name whose PDF exists → notice, nothing overwritten; delete a wrapped note in Finder with Obsidian open → PDF stays.
- [ ] **Step 5: Commit** `feat: follow in-app rename, move and delete across the pair`.

---

### Task 9: Attention items and fixes

**Files:**
- Create: `src/core/fixes.ts`, `tests/core/fixes.test.ts`
- Modify: `src/core/types.ts`

**Interfaces:**
- Consumes: Tasks 2, 3, 7.
- Produces:
  ```ts
  // types.ts
  export type AttentionKind = Exclude<PairState, 'healthy'> | 'note-removed' | 'unwrapped';
  export interface AttentionItem { kind: AttentionKind; notePath: string | null; pdfPath: string | null; rawTarget: string | null }
  export type FixId = 'rename-pdf-to-note' | 'rename-note-to-pdf' | 'move-pdf-to-note' | 'copy-pdf-for-note'
    | 'choose-pdf' | 'remove-claim' | 'delete-pdf' | 'wrap' | 'keep-plain';
  // fixes.ts
  export function buildAttention(c: Classification, pendingRemoved: string[], opts: { includeUnwrapped: boolean; attachmentFolder: string | null }): AttentionItem[];
  export function fixesFor(kind: AttentionKind): FixId[]; // first entry is the default
  export function candidatesForMissing(item: AttentionItem, c: Classification): string[];
  export function planFix(item: AttentionItem, fix: FixId, snapshot: Snapshot, chosenPdf?: string): Action[];
  export function isBulkFixable(item: AttentionItem, snapshot: Snapshot): boolean;
  export function copyPath(path: string, taken: ReadonlySet<string>): string; // 'a/S.pdf' → 'a/S 1.pdf', then 'a/S 2.pdf', …
  ```

Fix table (default first): `missing` → `choose-pdf`, `remove-claim`. `misnamed` → `rename-pdf-to-note`, `rename-note-to-pdf`. `displaced` → `move-pdf-to-note`. `extra-claim` → `copy-pdf-for-note`, `remove-claim`. `contested` → `move-pdf-to-note`, `copy-pdf-for-note`, `remove-claim`. `note-removed` → `keep-plain`, `wrap`, `delete-pdf`. `unwrapped` → `wrap`.

`buildAttention`: one item per non-healthy pair; one `note-removed` item per `pendingRemoved` path that is still in `unwrappedPdfs` (paths that are gone or claimed again are dropped); when `includeUnwrapped`, one `unwrapped` item per unwrapped PDF that is not already a `note-removed` item and not inside `attachmentFolder`.

`planFix`: every rename/move/copy targets the name that makes the pair healthy and is followed by `setClaim`. If the destination is taken, return a single `notice` action and nothing else. `keep-plain` returns `[]` (the store drops the pending entry). `delete-pdf` returns one `delete`. `choose-pdf` requires `chosenPdf` and returns `rename` (to sit beside the note under its name) + `setClaim`.

`candidatesForMissing`: unclaimed PDFs in the note's folder first, then unclaimed PDFs elsewhere whose base name equals the note's base name or the base name of `rawTarget`; no duplicates.

`isBulkFixable`: `misnamed` or `displaced`, exactly one claim on the PDF, destination free.

- [ ] **Step 1: Write the failing tests**: `fixesFor` for all seven kinds; `buildAttention` (healthy excluded; pending dropped when PDF gone; pending dropped when re-claimed; unwrapped excluded when `includeUnwrapped` false; attachment folder excluded; a pending PDF is not also listed as unwrapped); `planFix` for each fix with exact action arrays, e.g.

```ts
test('displaced → move beside note', () => {
  expect(planFix(item('displaced', 'a/S.md', 'att/Scan 3.pdf'), 'move-pdf-to-note', s)).toEqual([
    { type: 'rename', from: 'att/Scan 3.pdf', to: 'a/S.pdf' },
    { type: 'setClaim', notePath: 'a/S.md', pdfPath: 'a/S.pdf', oldTargets: ['att/Scan 3.pdf', 'Scan 3.pdf', 'Scan 3'] }]);
});
test('destination taken → notice only', () => { /* a/S.pdf exists and is someone else's → [{type:'notice',…}] */ });
test('extra claim → copy the PDF for the copy', () => { /* a/S 1.md claims a/S.pdf → copy a/S.pdf → a/S 1.pdf, setClaim */ });
test('rename-note-to-pdf', () => { /* a/S.md + a/T.pdf → rename a/S.md → a/T.md, setClaim on a/T.md */ });
test('choose-pdf moves the chosen PDF beside the note', () => {});
test('delete-pdf and keep-plain', () => {});
test('copyPath numbering', () => {
  expect(copyPath('a/S.pdf', new Set())).toBe('a/S 1.pdf');
  expect(copyPath('a/S.pdf', new Set(['a/S 1.pdf', 'a/S 1.md']))).toBe('a/S 2.pdf');
  expect(copyPath('S.md', new Set())).toBe('S 1.md');
});
test('candidatesForMissing orders same-folder first and skips claimed PDFs', () => {});
test('isBulkFixable', () => { /* true for lone displaced with free destination; false when contested or destination taken or kind missing */ });
```

Write real bodies for every commented test.

- [ ] **Step 2: Run** `npm test` — expected: FAIL.
- [ ] **Step 3: Implement** `fixes.ts`.
- [ ] **Step 4: Run** `npm test` — expected: PASS.
- [ ] **Step 5: Commit** `feat: plan fixes for broken pairs`.

---

### Task 10: Scan, attention store and Needs attention list

**Files:**
- Create: `src/obsidian/attention-store.ts`, `src/ui/attention-modal.ts`
- Modify: `src/main.ts`, `styles.css`

**Interfaces:**
- Consumes: `classify`, `buildAttention`, `fixesFor`, `planFix`, `candidatesForMissing`, `isBulkFixable` (Tasks 3, 9); `gatherSnapshot` (Task 6); `Executor` (Task 8); `specificAttachmentFolder` (Task 1).
- Produces:
  ```ts
  export class AttentionStore {
    constructor(plugin: PdfWrapperPlugin, executor: Executor, isAutoWrapOn: () => boolean);
    refresh(pendingRemoved?: string | null): Promise<AttentionItem[]>; // adds the pending path if given, rescans, prunes and saves pendingRemovedPdfs, notifies listeners
    items(): AttentionItem[];
    classification(): Classification;
    applyFix(item: AttentionItem, fix: FixId, chosenPdf?: string): Promise<void>; // planFix → executor.run → refresh; 'keep-plain' removes the pending entry
    fixAll(): Promise<number>;  // applies the default fix to every isBulkFixable item, one at a time, re-planning against a fresh snapshot each time
    wrapAll(): Promise<number>; // 'unwrapped' items only
    onChange(listener: () => void): () => void;
  }
  export class AttentionModal extends Modal { constructor(app: App, store: AttentionStore) }
  ```

- [ ] **Step 1: Implement `AttentionStore`.** `refresh` never changes vault files. Read the attachment folder with the existing undocumented `vault.getConfig('attachmentFolderPath')` behind a narrow local interface, passed through `specificAttachmentFolder`. `isAutoWrapOn` is supplied as `() => false` until Task 11.

- [ ] **Step 2: Implement `AttentionModal`.** One row per item: file name (note if present, else PDF), folder, a plain-language state line, and one button per fix with the default styled as the call to action. State lines: Missing — "PDF not found. It may not have downloaded yet."; Misnamed — "PDF has a different name: <name>"; Displaced — "PDF is in another folder: <folder>"; Extra claim — "Points at another document's PDF"; Contested — "Shares a PDF with <n> other notes"; Note removed — "Its note was removed outside Obsidian"; Unwrapped — "Not wrapped". `choose-pdf` opens a `SuggestModal` over `candidatesForMissing` (empty list → button disabled with tooltip "No candidate PDFs found"). `delete-pdf` asks for confirmation naming the file. Header buttons "Fix all" and "Wrap all", each shown only when it would apply to at least one item. Empty state: "Everything is in order." Rows must wrap and buttons must be at least 44px tall on mobile (`Platform.isMobile`); put the styling in `styles.css` under a `pdf-wrapper-` class prefix. The modal re-renders on `store.onChange`.

- [ ] **Step 3: Wire in `main.ts`.** Command `show-needs-attention` ("Show documents needing attention") and `scan-pairs` ("Check wrapped documents") which refreshes then opens the modal. Pass `store.refresh` as the Watcher's `onRecheck`. On layout ready, after `SETTLE_MS`, refresh; if the list is non-empty, wait `SETTLE_MS` again, refresh again, and only then show a Notice "<n> wrapped documents need attention" that opens the modal when clicked.

- [ ] **Step 4: Verify** `npm run build && npm run lint && npm test` — expected: pass.

- [ ] **Step 5: Add to the manual checklist:** with Obsidian closed, rename a wrapped note in Finder → on launch it is listed as Misnamed, nothing changed on disk, "Rename PDF to match" fixes it; move a note to another folder in Finder → Displaced → fix; "Make a copy" of a wrapped note → copy listed as Extra claim, original unaffected, "Copy the PDF" works; delete a wrapped note in Finder with Obsidian open → "note removed" entry survives a restart and each of its three fixes works; delete the PDF too → entry disappears by itself; list is usable on a phone.

- [ ] **Step 6: Commit** `feat: scan for broken pairs and list fixes`.

---

### Task 11: Automatic wrapping

**Files:**
- Create: `src/obsidian/auto-wrap.ts`
- Modify: `src/obsidian/watcher.ts`, `src/settings.ts`, `src/main.ts`

**Interfaces:**
- Consumes: `shouldAutoWrap` (Task 7), `Executor`, `OwnChanges`, `SETTLE_MS` (Task 8), `AttentionStore` (Task 10).
- Produces:
  ```ts
  export const AUTO_WRAP_KEY = 'pdf-wrapper-auto-wrap';
  export function isAutoWrapOn(app: App): boolean;            // app.loadLocalStorage(AUTO_WRAP_KEY) === true
  export function setAutoWrap(app: App, on: boolean): void;   // app.saveLocalStorage
  export class AutoWrapper {
    constructor(app: App, executor: Executor, getSettings: () => PdfWrapperSettings, attachmentFolder: () => string | null);
    onPdfCreated(path: string): void; // waits SETTLE_MS, then re-gathers the snapshot and wraps only if shouldAutoWrap is still true
  }
  ```

- [ ] **Step 1: Implement `auto-wrap.ts`.** After a successful wrap show a Notice "Wrapped <name>". Automatic wrapping goes through the same `wrapPdf` as a manual wrap, so it creates or repairs the template when needed; it never skips a PDF for want of a template. If `wrapPdf` throws, show its message once per distinct message per session, so a broken template does not produce a notice for every PDF. Pending timers are cleared on unload.

- [ ] **Step 2: Hook the Watcher.** On `create` of a PDF that was not the plugin's own change, call `autoWrapper.onPdfCreated(path)` when `isAutoWrapOn(app)`.

- [ ] **Step 3: Settings toggle** "Wrap new PDFs automatically" with description "Applies to this device only. PDFs that arrive while Obsidian is closed are listed for you to wrap." It reads and writes through `isAutoWrapOn` / `setAutoWrap`, not the synced settings. Pass `() => isAutoWrapOn(app)` to `AttentionStore`, and refresh the store when the toggle changes.

- [ ] **Step 4: Verify** `npm run build && npm run lint && npm test` — expected: pass.

- [ ] **Step 5: Add to the manual checklist:** toggle on; drop a PDF into the explorer → wrapped within a few seconds, note not opened; save a PDF into the vault folder from Finder → wrapped; paste a PDF into another note with a named attachment folder set → not wrapped; with two devices on, add a PDF on one → exactly one note results on both; toggle state differs per device; a PDF added while Obsidian was closed appears as Unwrapped with "Wrap all"; toggle off → no Unwrapped entries.

- [ ] **Step 6: Commit** `feat: wrap newly added PDFs automatically`.

---

### Task 12: Duplicate wrapped document

**Files:**
- Create: `src/obsidian/duplicate.ts`
- Modify: `src/main.ts`

**Interfaces:**
- Consumes: `copyPath` (Task 9), `Executor` (Task 8), `readClaim`, `gatherSnapshot` (Task 6), `samePair` (Task 2).
- Produces: `export async function duplicateWrapped(app: App, executor: Executor, settings: PdfWrapperSettings, note: TFile): Promise<void>`

- [ ] **Step 1: Implement.** Refuse with a Notice unless `note` is the note of a healthy pair. Build the taken set from the snapshot; choose the first `n` for which both `copyPath`-style names (`<base> n.md`, `<base> n.<pdf ext>`) are free, so the two copies share a number. Run `copy` (note), `copy` (PDF), `setClaim` on the new note with `oldTargets` = the original PDF's path, file name and base name. Open the new note.

- [ ] **Step 2: Wire in `main.ts`.** File-menu item "Duplicate wrapped document" on notes that are healthy pairs, and command `duplicate-wrapped-document` with `checkCallback` on the active note.

- [ ] **Step 3: Verify** `npm run build && npm run lint && npm test` — expected: pass.
- [ ] **Step 4: Add to the manual checklist:** duplicate → `S 1.md` and `S 1.pdf` appear, the copy's marker and embed point at `S 1.pdf`, the original is unchanged, nothing lands in Needs attention, and auto-wrap does not fire a second wrap for the copied PDF.
- [ ] **Step 5: Commit** `feat: add duplicate wrapped document command`.

---

### Task 13: One row in the file explorer

**Files:**
- Create: `src/obsidian/explorer-style.ts`
- Modify: `src/main.ts`, `src/settings.ts`

**Interfaces:**
- Consumes: `buildExplorerCss` (Task 4), `healthyPairs` (Task 3), `AttentionStore.classification()` and `onChange` (Task 10).
- Produces:
  ```ts
  export class ExplorerStyle {
    constructor(doc: Document);
    update(pairs: { notePath: string; pdfPath: string }[], hide: boolean): void; // replaceSync on one CSSStyleSheet held in doc.adoptedStyleSheets
    remove(): void;
  }
  ```

- [ ] **Step 1: Implement `ExplorerStyle`.** Add the sheet to `adoptedStyleSheets` once; `update` only calls `replaceSync` and skips it when the generated text is unchanged; `remove` filters the sheet out. If `CSSStyleSheet` construction is unavailable, do nothing (the feature silently degrades to two visible rows).

- [ ] **Step 2: Wire in `main.ts`.** Update on every `store.onChange` and when the "Hide paired PDFs" toggle changes; `register(() => style.remove())`. Because the store only refreshes on recheck, also refresh the store after the Executor completes any action list, so a followed rename updates the hidden row immediately.

- [ ] **Step 3: Apply the Task 5 result.** If the spike showed gaps or missing rows at the owner's document count, change `DEFAULT_SETTINGS.hidePairedPdfs` to `false`, update its test in `tests/core/settings-data.test.ts`, and add "Off by default: hiding many rows can leave gaps in the file explorer in large vaults." to the setting's description.

- [ ] **Step 4: Verify** `npm run build && npm run lint && npm test` — expected: pass.
- [ ] **Step 5: Add to the manual checklist:** wrapped documents show one row with the marker; unwrapped PDFs still show; toggling the setting shows and hides the rows at once; rename, move, delete and duplicate keep the right rows hidden; a broken pair's PDF becomes visible; after restart rows are still hidden; disabling the plugin restores every row; same on a phone.
- [ ] **Step 6: Commit** `feat: show wrapped documents as one row in the file explorer`.

---

### Task 14: Remove the spike, align names, document, version

**Files:**
- Delete: `src/spike/spike.ts`
- Modify: `src/main.ts`, `README.md`, `CLAUDE.md`, `package.json`, `package-lock.json`, `manifest.json`, `versions.json`, `docs/manual-test-checklist.md`

- [ ] **Step 1: Remove the spike** commands and file. Keep `local-intent.ts`.
- [ ] **Step 2: Names.** `package.json` `name` → `obsidian-pdf-wrapper`. Search the repo for `wrap-pdf`, `Wrap PDF` (as a plugin name, not the menu item title) and `src/wrap-pdf.ts`; replace with `pdf-wrapper`, "PDF Wrapper", `src/pdf-wrapper.ts`. Console messages use the prefix `PDF Wrapper:`.
- [ ] **Step 3: Rewrite `README.md`** for the new behaviour: what a wrapped document is (side by side, marker property); wrapping and automatic wrapping; what follows in-app actions; what is listed instead and why (outside changes and sync); the Needs attention list; the explorer setting and its limits (core explorer only; PDF still appears in switcher and search); settings; template tips using the marker property (and that `attachments` is no longer written); a "Sync" section stating the per-device auto-wrap switch and that deletes made inside Obsidian follow the user's Obsidian trash setting. No claim that the plugin is in the community directory unless it is.
- [ ] **Step 4: Rewrite `CLAUDE.md`** Architecture and Key design decisions to match the file structure and rules in this plan; add `npm test`; list the undocumented APIs still used (Templater plugin lookup, core Templates options, `vault.getConfig('attachmentFolderPath')`) and the `Vault` method wrapping.
- [ ] **Step 5: Version.** Set `2.0.0` in `package.json` and `manifest.json`; add `"2.0.0": "1.8.7"` to `versions.json`. Do not tag or release.
- [ ] **Step 6: Finish `docs/manual-test-checklist.md`**: add a header saying it must be run in an iCloud vault and an Obsidian Sync vault on desktop and phone before release, and a final section "After an Obsidian update" listing the three checks most likely to regress (rows hidden, in-app rename followed, in-app delete followed).
- [ ] **Step 7: Dependabot.** Leave the three open Dependabot pull requests for the owner to merge; do not fold their changes into this branch. Mention them in the hand-off.
- [ ] **Step 8: Verify** `npm run build && npm run lint && npm test`, and `grep -rn "wrap-pdf\|spike" src README.md CLAUDE.md package.json` returns nothing.
- [ ] **Step 9: Commit** `docs: describe paired documents and align plugin naming`.
- [ ] **Step 10: Hand the build and `docs/manual-test-checklist.md` to the owner.** The work is not done until they have run it; report which sections remain unrun.
