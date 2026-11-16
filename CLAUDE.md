# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## What is this?

**PDF Wrapper** — an Obsidian plugin (not in the community directory) that keeps a markdown note and its PDF together as one *wrapped document*: the note and the PDF sit side by side (same folder, same base name, e.g. `Statement.md` + `Statement.pdf`), and the note carries a *marker property* (default `wrapped-pdf`) set to `true`. **Nothing in the note names the PDF**: the pair is found by name and folder alone, and the PDF is shown in the note by a fenced code block with the language `wrapped-pdf`, which the plugin renders. So renaming, moving or copying a pair changes file names only and edits no file. In-app renames, moves, deletes, copies and duplicates apply to both files; changes made outside Obsidian are listed in a "Needs attention" list with one-click fixes and, by design, not acted on directly. Optionally every new PDF is wrapped automatically, and in the core file explorer a healthy pair shows as one row.

Plugin ID: `pdf-wrapper` (in `manifest.json`); npm package `obsidian-pdf-wrapper`. Current version 2.0.0 (not released or tagged).

The design is in `docs/superpowers/specs/2026-11-15-paired-pdf-documents-design.md` (revision 7). Read it before changing behaviour. `docs/superpowers/specs/2026-11-15-name-independent-pairing-design.md` is the change that became revision 7 and says why a note must not name its PDF (sync duplicated notes that were renamed and edited at once). `README.md` is what users read and must stay true to the code; `docs/manual-test-checklist.md` is what the owner runs in real vaults.

## Commands

```bash
npm install          # Install dependencies
npm run dev          # Compile in watch mode (development)
npm run build        # Type-check (tsc --noEmit) then production build (minified, no sourcemaps)
npm run lint         # ESLint with obsidian-specific rules (eslint-plugin-obsidianmd)
npm test             # Vitest unit tests (tests/**/*.test.ts); no Obsidian needed
```

There is no Obsidian instance in CI or in the cloud environment. Never claim behaviour that depends on Obsidian was exercised; say it is unverified. To try the plugin, copy `main.js`, `manifest.json`, `styles.css` into `<Vault>/.obsidian/plugins/pdf-wrapper/` and reload Obsidian.

Tests import with the `.ts` extension (`import { x } from '../../src/core/x.ts'`) and import `test`/`expect` from `vitest`. Source and tests use tabs.

## File layout

- **`src/main.ts`** — Plugin lifecycle only: wires the pieces together and adds the settings tab. The commands, `file-menu` items and the startup notice are in `src/obsidian/commands.ts`.
- **`src/settings.ts`** — The settings tab (`PdfWrapperSettingTab`). The settings data type, defaults and `mergeSettings` live in `src/core/settings-data.ts`.
- **`src/pdf-wrapper.ts`** — `wrapPdf()`: creates the note beside the PDF from the template (Templater, else core Templates placeholders), creates or repairs the template, then converts the new note as Convert would (marker set to `true`, any link to the PDF the template put in taken out) and says what it removed. Also the Templater / core Templates / `moment` lookups.
- **`src/core/`** — Pure logic. Takes plain data (paths, a snapshot of notes, PDFs and marked notes) and returns decisions; **no `obsidian` import**, so it is unit-tested directly. Holds: `model` (the types: `MarkedNote`, `VaultSnapshot`, `Pair`, `FollowEvent`, `FileAction`, `ListItem`, `RepairId`), `marker` (is a property value a marker, the link target of an old link-valued marker, does a note still link to its own PDF, is a path a template), `pairing` (`pairUp`: marked note + PDF of its name beside it; `findPdfBeside` / `findNoteBeside`), `block` (the `wrapped-pdf` block's text, its detection, and what it shows), `convert` (take the links to a note's own PDF out of its properties and body), `follow` (what to do for a vault event: rename, copy or delete the partner, never an edit; also how a copy is recognised by name and text), `repairs` (the Needs attention list, its fixes, Convert and the bulk tests), `list-text` (entry names, fix labels, notices), `auto-wrap` (settle times, which PDFs to wrap, the guard for a note still arriving), `duplicate` (copy naming), `template` (the default template and its repair by text insertion), `frontmatter` (where the frontmatter block is), `links` (does a note's text link to a given PDF), `templater-outcome` (which notes are new after a Templater call), `explorer-css` (the generated hiding rules), `marks` (local-intent, own-change, pending-create and copy-source bookkeeping), `paths`, `settings-data`, plus small helpers `refresh-scheduler`, `then-hook`, `wait`.
- **`src/obsidian/`** — The thin layer that touches Obsidian: gathers the snapshot from `vault` and `metadataCache`, reads a note's links to its own PDF and runs Convert on a note (`vault-snapshot`), runs the actions the core returns (`execute`), renders the `wrapped-pdf` block (`pdf-block`), listens to vault events and to `metadataCache` `changed`, which only asks for a refresh, except that a note created inside Obsidian moments before is passed to `follow` again as that `create`, so an in-app copy of a wrapped note copies its PDF once its marker is indexed (`watcher`), wraps `Vault` methods (`local-intent`), holds the Needs attention list (`attention-store`), automatic wrapping (`auto-wrap`), duplicate (`duplicate`), the commands and file-menu items (`commands`) and the explorer stylesheet (`explorer-style`).
- **`src/ui/`** — `attention-modal.ts`, the Needs attention list (and its small confirmation and PDF-chooser modals).
- **`tests/`** — Vitest tests for `src/core` (`tests/core`) and the pure parts of the explorer style (`tests/obsidian`).
- **`styles.css`** — Styles for the Needs attention list and for the block's "no PDF" message.
- **`esbuild.config.mjs`** — Bundles `src/main.ts` → `main.js` (CJS, ES2018). Obsidian-provided modules are external.
- **`docs/`** — Spec, plan and progress under `docs/superpowers/`, the manual test checklist, and the notes from the throwaway test build (its commands were removed after commit `f2a3fc6`).

## Design rules — do not break these

1. **The core is pure.** Nothing under `src/core/` imports `obsidian`. Decisions are made there from snapshots; `src/obsidian/` only gathers and executes.
2. **The plugin acts on its own only for changes identified as local** (made inside Obsidian on this device, as seen through `LocalIntent`). A change not positively identified as local is treated as not local: it is protected and listed.
3. **It never deletes outside a followed in-app delete.** A PDF is deleted only as part of a note deletion the user made in Obsidian on this device (and only if "Delete the PDF when its note is deleted in Obsidian" is on, and no other note links to or embeds the PDF according to `metadataCache.resolvedLinks`), or by an explicit confirmed "Delete the PDF" fix. Never because of a scan, a sync-delivered change or an outside change.
4. **A scan never changes files.** Scans and refreshes only read, and so does the renderer of the `wrapped-pdf` block; files change only through user-triggered fixes and followed in-app actions. The `metadataCache` `changed` handler is read-only too, with one exception: for a note created inside Obsidian in the last 10 s (the Watcher's pending creates) it re-runs `follow` for that `create`, which continues a followed in-app copy (it copies the PDF; it does not edit the note).
5. **The explorer is touched by styling rules only.** One constructed stylesheet keyed on row paths; no patching of, or calls into, the explorer view, no DOM observers. If it breaks, the user sees two rows and nothing else is affected.
6. **Templates are edited by text insertion, and replacement of known lines, only** (the marker line, the block, the title-placeholder embed). Never parse and rewrite template frontmatter; it can mangle Templater expressions.
7. **No second source of truth for pairs.** A pair is whatever the files and frontmatter say: a marked note and the PDF of its name beside it. The only stored extras are the settings and the list of PDFs kept after their note was deleted ("Its note was deleted; the PDF was kept": the note was removed outside Obsidian, deleted in Obsidian with following deletes off, or deleted while other notes still link to the PDF), which is a reminder, not a record.
8. **Actions are idempotent and every fix re-checks that the item is still as listed** before changing anything.
9. The plugin does not read or write `attachment` / `attachments` by name. Convert treats every property other than the marker alike.
10. **A wrapped note never names its PDF, and no code path writes a link to a note's own PDF into that note.** The marker is written as `true`; the PDF is shown by the `wrapped-pdf` block. Renaming, moving, copying or duplicating a wrapped document edits no file contents: following renames, copies or deletes the partner file and nothing else. A note is edited only by wrap (the note it has just created), by the Convert / Convert all and "Remove the marker" fixes, and never by a scan, a refresh, the block's renderer or a followed change. Do not reintroduce a link-valued marker or a literal embed of the PDF.

## Pairs and the Needs attention list

- **Marked note**: the marker property is present with any value other than `false`, the text `false`, empty or null. The plugin writes `true`; a link value (the earlier format) still counts. Templates (the configured template file, and anything in the Templater or core Templates folder) are never marked notes.
- **Healthy pair**: a marked note and a PDF with the same base name in the same folder. Base name and folder match exactly; the PDF's extension may be in any case (`S.md` + `S.PDF`). To ask which PDF is beside a note use `findPdfBeside` / `findNoteBeside` (they return the real path); `pdfBeside` / `noteBeside` in `paths` only build a destination name.
- The pair states are just `healthy` and `pdf-not-found`. The list has four kinds of entry, named verbatim:
  - **PDF not found** — a marked note with no PDF beside it. Fixes: `Use a PDF`, `Rename note to match`, `Copy another document's PDF`, `Remove the marker`.
  - **Links to its own PDF** — a marked note that still links to or embeds its PDF anywhere (a link-valued marker, another property, the body), whether or not the PDF is beside it. Fix: `Convert`; in bulk `Convert all`, which covers only notes whose PDF is already beside them and so never moves a file.
  - **Its note was deleted; the PDF was kept** — fixes: `Keep as a plain PDF`, `Wrap`, `Delete the PDF`.
  - **Not wrapped** — an unwrapped PDF, listed only when automatic wrapping is on. Fix: `Wrap`; in bulk `Wrap all`.
- **Unwrapped PDF**: in no healthy pair, and no marked note's link-valued marker points to it (such a marker still protects its PDF until the note is converted).
- **Convert**: marker to `true`; the PDF taken out of every other property; in the body, embeds of it become the block and plain links become text. With a PDF already beside the note it never moves a file (a different PDF the marker pointed at stays put and becomes unwrapped). With none beside it, the marker's PDF is moved there first, unless the name is taken, another marker points to it, or it is another wrapped document's PDF (then it is not moved and the note shows PDF not found). The Executor stops a plan at the first failed action.
- **Copy**: an in-app copy of a wrapped note is followed when it went through the wrapped `Vault.copy` (the source is known), or else when exactly one healthy pair's note in the same folder has identical text **and** the new note's name reads as a copy of its name (`Name 1`, `Name copy`).
- **The block** (`src/obsidian/pdf-block.ts`): draws nothing outside a note (a canvas card); shows `No PDF named <name>.pdf beside this note.` when there is none; falls back to a rendered embed with a link, then to the link alone, when Obsidian's PDF viewer cannot be loaded. The block language is the fixed string `wrapped-pdf`, not the marker setting.
- **Wrap** converts whatever the template put in the new note and says so once per run. **Template repair** inserts the marker line and the block, sets an empty or placeholder marker to `true`, and replaces only the title-placeholder embed (`![[{{title}}.pdf]]` and its variants) with the block.
- **Automatic wrapping** does not wrap a PDF that arrived from outside while a marked note without a PDF is in its folder or has its name (a pair still arriving by sync); such a PDF is dropped, not retried, and stays listed as Not wrapped.
- The earlier states built on a note "claiming" a PDF by link are gone; see "What was removed in revision 7" in the spec.

## Other constraints

- Output must be a single `main.js` file (CJS). No unbundled runtime dependencies (`monkey-around` is bundled).
- `obsidian`, `electron`, `@codemirror/*`, `@lezer/*` are provided by Obsidian at runtime — never bundle them.
- `isDesktopOnly` is `false` — avoid Node/Electron-only APIs.
- Keep `main.ts` minimal (lifecycle only). Delegate feature logic.
- Console messages use the prefix `PDF Wrapper:`.
- `minAppVersion` is 1.8.7 (`versions.json` maps plugin versions to it).

## Undocumented Obsidian APIs still used

Not in the public type definitions. The plugin, config and embed lookups below are read defensively inside try/catch and degrade quietly; the explorer markup is not code the plugin calls, so it cannot be guarded that way and fails soft instead (see its entry):

- `app.plugins.plugins["templater-obsidian"]` — Templater lookup, its `templater.create_new_note_from_template(...)`, and `settings.templates_folder` (`src/pdf-wrapper.ts`).
- `app.internalPlugins.getPluginById("templates")` — core Templates `instance.options` (`folder`, `dateFormat`, `timeFormat`) (`src/pdf-wrapper.ts`).
- `app.embedRegistry.embedByExtension.pdf(...)` — the creator of Obsidian's own PDF embed, and the embed's `loadFile()` / `unload()`, used to show the PDF in the `wrapped-pdf` block (`src/obsidian/pdf-block.ts`). If it is missing or fails, the block falls back to `MarkdownRenderer.render` of an embed plus a plain link.
- `vault.getConfig("attachmentFolderPath")` — the attachment folder, so PDFs landing in a specifically named folder are skipped by automatic wrapping and the unwrapped list (`src/obsidian/attention-store.ts`).
- The core file explorer's markup: the selectors `.nav-file`, `.nav-file-title[data-path]` and `.nav-file-title-content`, and CSS `:has()`, in `src/core/explorer-css.ts`, applied through `document.adoptedStyleSheets` in `src/obsidian/explorer-style.ts`. Not guarded by try/catch; it fails soft by simply not matching, so rows reappear.
- `window.moment` — date formatting for `{{date}}` / `{{time}}` (`src/pdf-wrapper.ts`).

## Wrapping of `Vault` and `FileManager` methods (`src/obsidian/local-intent.ts`)

Obsidian's vault events do not say where a change came from. `LocalIntent.install()` uses `monkey-around` to wrap, on the `app.vault` and `app.fileManager` instances (not the prototypes):

- `Vault.rename`, `Vault.trash`, `Vault.delete` — mark the path (a file mark is used up by the first match; a folder mark answers for everything inside it for 5 s) so the event that follows is read as local.
- `Vault.create`, `Vault.createBinary`, `Vault.copy` — mark the destination, so a PDF made inside Obsidian (drop, paste, copy) reads as local, and so an in-app copy of a wrapped note reads as local, which copies its PDF (only with the note's own file mark, not a folder mark, and only while "Rename and move the PDF with its note" is on). `Vault.copy` of a single file also records which file the copy was made from, for 10 s, so the Watcher knows the copy's source. A folder copy is only followed, not marked.
- `FileManager.renameFile` — no mark of its own; it only keeps the operation "in flight" while Obsidian rewrites links, so the Watcher waits (capped at 10 s) until the user's operation has finished.

This interception is **unverified**, in particular whether Obsidian Sync or iCloud apply remote changes through these methods. The two settings "Delete the PDF when its note is deleted in Obsidian" and "Rename and move the PDF with its note" are the user's escape hatch, and the README says so. Uninstalling restores the originals. The plugin's own changes are tracked separately by `OwnChanges` (`src/core/marks.ts`) so it never reacts to itself.

## Releasing

Version in `package.json` and `manifest.json` (and `package-lock.json`), plus an entry in `versions.json`. Tagging is the owner's decision; `.github/workflows/release.yml` builds and attaches `main.js`, `manifest.json`, `styles.css`.

## CI

GitHub Actions (`.github/workflows/lint.yml`) runs `npm ci`, `npm run build`, `npm test` and `npm run lint` on every push/PR across Node 20.x and 22.x.

## AGENTS.md

Contains detailed Obsidian plugin development guidelines (security, UX, performance, coding conventions). Consult for plugin-specific patterns.
