# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## What is this?

**PDF Wrapper** — an Obsidian plugin (not in the community directory) that keeps a markdown note and its PDF together as one *wrapped document*: the note and the PDF sit side by side (same folder, same base name, e.g. `Statement.md` + `Statement.pdf`), and the note carries a *marker property* (default `wrapped-pdf`) holding a link to the PDF. In-app renames, moves, deletes and duplicates apply to both files; changes made outside Obsidian are listed in a "Needs attention" list with one-click fixes and, by design, not acted on directly. Optionally every new PDF is wrapped automatically, and in the core file explorer a healthy pair shows as one row.

Plugin ID: `pdf-wrapper` (in `manifest.json`); npm package `obsidian-pdf-wrapper`. Current version 2.0.0 (not released or tagged).

The design is in `docs/superpowers/specs/2026-11-15-paired-pdf-documents-design.md`. Read it before changing behaviour. `README.md` is what users read and must stay true to the code; `docs/manual-test-checklist.md` is what the owner runs in real vaults.

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
- **`src/pdf-wrapper.ts`** — `wrapPdf()`: creates the note beside the PDF from the template (Templater, else core Templates placeholders), creates or repairs the template, sets the marker, rewrites the embed. Also the Templater / core Templates / `moment` lookups.
- **`src/core/`** — Pure logic. Takes plain data (paths, a snapshot of notes, PDFs and claims) and returns decisions; **no `obsidian` import**, so it is unit-tested directly. Holds: `claims` (parse the marker value), `classify` (healthy / missing / misnamed / displaced / extra claim / contested), `react` (what to do for a vault event), `fixes` (fix plans for the Needs attention list), `attention` (list text and labels), `auto-wrap` (settle times, which PDFs to wrap), `duplicate` (copy naming), `template` (template repair by text insertion), `frontmatter` and `embeds` (text-level edits), `explorer-css` (the generated hiding rules), `marks` (local-intent and own-change bookkeeping), `paths`, `snapshot`, `settings-data`, `types`, plus small helpers `refresh-scheduler`, `then-hook`, `wait`.
- **`src/obsidian/`** — The thin layer that touches Obsidian: gathers the snapshot from `vault` and `metadataCache` (`snapshot`), runs the actions the core returns (`execute`), listens to vault events and to `metadataCache` `changed`, which only asks for a refresh, except that a note created inside Obsidian moments before is passed to `react` again as that `create`, so an in-app copy of a wrapped note copies its PDF once its claim is indexed (`watcher`), wraps `Vault` methods (`local-intent`), holds the Needs attention list (`attention-store`), automatic wrapping (`auto-wrap`), duplicate (`duplicate`), the commands and file-menu items (`commands`) and the explorer stylesheet (`explorer-style`).
- **`src/ui/`** — `attention-modal.ts`, the Needs attention list (and its small confirmation and PDF-chooser modals).
- **`tests/`** — Vitest tests for `src/core` (`tests/core`) and the pure parts of the explorer style (`tests/obsidian`).
- **`styles.css`** — Styles for the Needs attention list.
- **`esbuild.config.mjs`** — Bundles `src/main.ts` → `main.js` (CJS, ES2018). Obsidian-provided modules are external.
- **`docs/`** — Spec, plan and progress under `docs/superpowers/`, the manual test checklist, and the notes from the throwaway test build (its commands were removed after commit `f2a3fc6`).

## Design rules — do not break these

1. **The core is pure.** Nothing under `src/core/` imports `obsidian`. Decisions are made there from snapshots; `src/obsidian/` only gathers and executes.
2. **The plugin acts on its own only for changes identified as local** (made inside Obsidian on this device, as seen through `LocalIntent`). A change not positively identified as local is treated as not local: it is protected and listed.
3. **It never deletes outside a followed in-app delete.** A PDF is deleted only as part of a note deletion the user made in Obsidian on this device (and only if "Delete the PDF when its note is deleted in Obsidian" is on, and no other note links to or embeds the PDF according to `metadataCache.resolvedLinks`), or by an explicit confirmed "Delete the PDF" fix. Never because of a scan, a sync-delivered change or an outside change.
4. **A scan never changes files.** Scans and refreshes only read; files change only through user-triggered fixes and followed in-app actions. The `metadataCache` `changed` handler is read-only too, with one exception: for a note created inside Obsidian in the last 10 s (the Watcher's pending creates) it re-runs `react` for that `create`, which continues a followed in-app copy.
5. **The explorer is touched by styling rules only.** One constructed stylesheet keyed on row paths; no patching of, or calls into, the explorer view, no DOM observers. If it breaks, the user sees two rows and nothing else is affected.
6. **Templates are edited by text insertion only.** Never parse and rewrite template frontmatter; it can mangle Templater expressions.
7. **No second source of truth for pairs.** A pair is whatever the files and frontmatter say. The only stored extras are the settings and the list of PDFs kept after their note was deleted ("Its note was deleted; the PDF was kept": the note was removed outside Obsidian, deleted in Obsidian with following deletes off, or deleted while other notes still link to the PDF), which is a reminder, not a record.
8. **Actions are idempotent and every fix re-checks that the item is still as listed** before changing anything.
9. The plugin no longer reads or writes `attachment` / `attachments`.

## Other constraints

- Output must be a single `main.js` file (CJS). No unbundled runtime dependencies (`monkey-around` is bundled).
- `obsidian`, `electron`, `@codemirror/*`, `@lezer/*` are provided by Obsidian at runtime — never bundle them.
- `isDesktopOnly` is `false` — avoid Node/Electron-only APIs.
- Keep `main.ts` minimal (lifecycle only). Delegate feature logic.
- Console messages use the prefix `PDF Wrapper:`.
- `minAppVersion` is 1.8.7 (`versions.json` maps plugin versions to it).

## Undocumented Obsidian APIs still used

Not in the public type definitions. The plugin and config lookups below are read defensively inside try/catch and degrade quietly; the explorer markup is not code the plugin calls, so it cannot be guarded that way and fails soft instead (see its entry):

- `app.plugins.plugins["templater-obsidian"]` — Templater lookup, its `templater.create_new_note_from_template(...)`, and `settings.templates_folder` (`src/pdf-wrapper.ts`).
- `app.internalPlugins.getPluginById("templates")` — core Templates `instance.options` (`folder`, `dateFormat`, `timeFormat`) (`src/pdf-wrapper.ts`).
- `vault.getConfig("attachmentFolderPath")` — the attachment folder, so PDFs landing in a specifically named folder are skipped by automatic wrapping and the unwrapped list (`src/obsidian/attention-store.ts`).
- The core file explorer's markup: the selectors `.nav-file`, `.nav-file-title[data-path]` and `.nav-file-title-content`, and CSS `:has()`, in `src/core/explorer-css.ts`, applied through `document.adoptedStyleSheets` in `src/obsidian/explorer-style.ts`. Not guarded by try/catch; it fails soft by simply not matching, so rows reappear.
- `window.moment` — date formatting for `{{date}}` / `{{time}}` (`src/pdf-wrapper.ts`).

## Wrapping of `Vault` and `FileManager` methods (`src/obsidian/local-intent.ts`)

Obsidian's vault events do not say where a change came from. `LocalIntent.install()` uses `monkey-around` to wrap, on the `app.vault` and `app.fileManager` instances (not the prototypes):

- `Vault.rename`, `Vault.trash`, `Vault.delete` — mark the path (a file mark is used up by the first match; a folder mark answers for everything inside it for 5 s) so the event that follows is read as local.
- `Vault.create`, `Vault.createBinary`, `Vault.copy` — mark the destination, so a PDF made inside Obsidian (drop, paste, copy) reads as local. A folder copy is only followed, not marked.
- `FileManager.renameFile` — no mark of its own; it only keeps the operation "in flight" while Obsidian rewrites links, so the Watcher waits (capped at 10 s) until the user's operation has finished.

This interception is **unverified**, in particular whether Obsidian Sync or iCloud apply remote changes through these methods. The two settings "Delete the PDF when its note is deleted in Obsidian" and "Rename and move the PDF with its note" are the user's escape hatch, and the README says so. Uninstalling restores the originals. The plugin's own changes are tracked separately by `OwnChanges` (`src/core/marks.ts`) so it never reacts to itself.

## Releasing

Version in `package.json` and `manifest.json` (and `package-lock.json`), plus an entry in `versions.json`. Tagging is the owner's decision; `.github/workflows/release.yml` builds and attaches `main.js`, `manifest.json`, `styles.css`.

## CI

GitHub Actions (`.github/workflows/lint.yml`) runs `npm ci`, `npm run build`, `npm test` and `npm run lint` on every push/PR across Node 20.x and 22.x.

## AGENTS.md

Contains detailed Obsidian plugin development guidelines (security, UX, performance, coding conventions). Consult for plugin-specific patterns.
