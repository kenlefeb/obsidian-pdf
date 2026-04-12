# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## What is this?

**Wrap PDF** — an Obsidian community plugin that wraps PDF files in markdown notes. When the user right-clicks a PDF in the file explorer and selects "Wrap PDF", the plugin:

1. Moves the PDF to the vault's configured attachment folder
2. Creates a markdown note (same name, original location) from a user-configured template
3. Triggers Templater or core Templates to resolve placeholders
4. Sets the `attachment`/`attachments` frontmatter property to the PDF's new path
5. Fixes any embed links (`![[file.pdf]]`) to point to the moved PDF

Plugin ID: `wrap-pdf` (defined in `manifest.json`).

## Build commands

```bash
npm install          # Install dependencies
npm run dev          # Compile in watch mode (development)
npm run build        # Type-check (tsc --noEmit) then production build (minified, no sourcemaps)
npm run lint         # ESLint with obsidian-specific rules (eslint-plugin-obsidianmd)
```

Testing is manual: copy `main.js`, `manifest.json`, `styles.css` into `<Vault>/.obsidian/plugins/wrap-pdf/` and reload Obsidian.

## Architecture

- **`src/main.ts`** — Plugin lifecycle. Registers the `file-menu` event (context menu on PDFs) and the settings tab. Delegates wrap logic to `wrap-pdf.ts`.
- **`src/settings.ts`** — `WrapPdfSettings` interface (single `templatePath` field), defaults, and `WrapPdfSettingTab`.
- **`src/wrap-pdf.ts`** — Core `wrapPdf()` function. Handles: resolving the attachment folder from Obsidian's config, moving the PDF, creating the note via Templater API or core Templates fallback, updating frontmatter, and fixing embed links.
- **`esbuild.config.mjs`** — Bundles `src/main.ts` → `main.js` (CJS, ES2018). Obsidian-provided modules are external.

## Key design decisions

- **Templater-first, core Templates fallback**: `wrap-pdf.ts` checks for the Templater plugin at `app.plugins.plugins["templater-obsidian"]` and uses `create_new_note_from_template` if available. Otherwise it reads the template, resolves `{{title}}`, `{{date}}`, `{{time}}` manually, and creates the file.
- **Undocumented Obsidian APIs**: `vault.getConfig("attachmentFolderPath")` and `internalPlugins.getPluginById("templates")` are not in the public type definitions. The file-level eslint-disable in `wrap-pdf.ts` covers these.
- **Attachment folder resolution**: The raw config value can be `"/"` (vault root), `"./..."` (relative to file), or an absolute vault path. `resolveAttachmentFolder()` handles all three.
- **Frontmatter**: Only updates `attachment`/`attachments` if the key already exists in the rendered template. Uses `app.fileManager.processFrontMatter()`.

## Key constraints

- Output must be a single `main.js` file (CJS). No unbundled runtime dependencies.
- `obsidian`, `electron`, `@codemirror/*`, `@lezer/*` are provided by Obsidian at runtime — never bundle them.
- `isDesktopOnly` is `false` — avoid Node/Electron-only APIs.
- Keep `main.ts` minimal (lifecycle only). Delegate feature logic to `wrap-pdf.ts`.

## CI

GitHub Actions (`.github/workflows/lint.yml`) runs `npm ci`, `npm run build`, and `npm run lint` on every push/PR across Node 20.x and 22.x.

## AGENTS.md

Contains detailed Obsidian plugin development guidelines (security, UX, performance, coding conventions). Consult for plugin-specific patterns.
