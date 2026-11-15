# Paired PDF documents — design

Date: 2026-11-15
Status: awaiting approval

## Intent

Make a PDF a first-class document in an Obsidian vault. A *wrapped document*
is a markdown note plus a PDF that the user treats as one file: the PDF is the
content (embedded in the note), and the note carries frontmatter so the
document can be queried with Bases, Dataview, search and the properties panel.

The owner maintains such pairs by hand today and finds it fragile: renames,
moves and deletes have to be done twice, and anything that touches the files
outside Obsidian silently breaks the pair. The plugin's job is to make the pair
hold together.

Today the plugin does one thing: a "Wrap PDF" action that moves a PDF to the
attachment folder and creates a note from a template. That becomes the entry
point to the new behaviour; everything else here is new.

## Goals

1. A wrapped document is laid out as a note and a PDF **side by side: same
   folder, same base name** (`Statement.md` + `Statement.pdf`).
2. Rename, move, delete and duplicate apply to both files.
3. Changes made outside Obsidian (Finder, sync, scripts), including while
   Obsidian was closed, are detected. Unambiguous breaks are repaired; the rest
   are listed for the user to resolve.
4. In the core file explorer the pair looks like one file.
5. The vault stays plain files that are fully usable without the plugin.

## Non-goals

- Adopting the owner's existing hand-wrapped documents (PDFs currently in the
  attachment folder). That is a separate one-time migration outside the
  plugin. See "Side effect" under Needs attention.
- More than one PDF, or other file types, per document.
- A custom container or archive file type. Rejected: Obsidian only indexes
  `.md`, so frontmatter inside a container would not be queryable.
- A folder-per-document layout or macOS package. Considered and set aside; see
  Approaches.
- Hiding the PDF anywhere other than the core file explorer (quick switcher,
  search, graph, third-party explorers).
- Redirecting "open the PDF" to open the note.
- A Finder extension or any companion app.
- Multi-select / batch wrapping.

## Anti-goals

These would make the result a failure even if it technically works:

- **Losing a file.** The plugin must never permanently delete anything, and
  must never delete as a result of a scan.
- **A second source of truth.** No registry, index or cache that can disagree
  with what is on disk.
- **Breaking when the cosmetics break.** If an Obsidian update defeats the
  explorer hiding, pairing and syncing must be unaffected; the user just sees
  two files.
- **Depending on Obsidian internals for correctness.** Undocumented APIs are
  acceptable only where already used (Templater, core Templates options) and
  never for the explorer.

## Constraints

- Existing project constraints stand: single bundled `main.js` (CJS),
  `isDesktopOnly: false`, no Node/Electron-only APIs, `main.ts` stays
  lifecycle-only, lint with `eslint-plugin-obsidianmd`.
- No Obsidian instance is available in CI or in the cloud development
  environment. Behaviour that depends on real Obsidian events can only be
  verified by the owner in a vault. The design therefore pushes as much logic
  as possible into code that is testable without Obsidian.
- The plugin has one public release (1.0.0) and no known users; the owner does
  not use it today. Backward compatibility with 1.0.0 behaviour is not
  required.

## Approaches

### Layout (decided by the owner)

1. *Note in place, PDF in the attachment folder* (current behaviour). One
   visible item natively, but name collisions in a shared folder and weak
   recovery after external changes.
2. **Side by side, same name, same folder — chosen.** Pairing is evident from
   file names to any tool and survives most external handling. Cost: two
   explorer rows, hidden cosmetically.
3. *Folder per document*, optionally a macOS package (`Statement.pdfdoc/`).
   Allows extra files and a single Finder item, but making the folder act like
   a file in Obsidian needs explorer internals. Research into existing plugins
   (Folder Notes, alx-folder-note, Front Matter Title) showed every
   internals-based plugin had at least one hard break across Obsidian 1.5–1.7
   and ongoing upkeep; CSS-only hiding plugins fail soft.

The owner chose 2 after that research.

### Record-keeping (decided by the owner)

1. **Files are the only record — chosen.** A pair is whatever the files and
   frontmatter say. Cannot go stale or conflict between devices. Recovery
   after offline changes is limited to what the files make evident; the rest
   needs the user to confirm.
2. *Plugin registry with PDF fingerprints.* Better automatic recovery, but a
   second source of truth, sync conflicts, and fingerprinting cost on startup.

The owner chose 1. A registry can be added later without changing the layout.

## Definitions

Everything below marked *(call)* is the designer's decision, not something the
owner specified. The owner saw a summary of the behaviour table and raised no
objection, but has not confirmed details.

**Claim.** A note *claims* a PDF when its frontmatter has an `attachment`
property (or an `attachments` list) containing exactly one link that names a
`.pdf` file and nothing else. Key matching is case-insensitive, as today. A
note whose list holds more than one entry (PDF or otherwise) claims nothing
and is ignored by the plugin. *(call)*

**Wrapped document (healthy pair).** A note that claims a PDF, where the PDF
exists, is in the same folder, and has the same base name as the note.

**Broken pair.** A note with a claim that is not healthy:

| State | Meaning |
|---|---|
| Missing | The claimed PDF does not exist. |
| Misnamed | The claimed PDF is in the note's folder under a different name. |
| Displaced | The claimed PDF exists in a different folder. |
| Extra claim | The claimed PDF is the partner of a *different* note's healthy pair (typically this note is a copy). |
| Contested | Two or more notes claim the same PDF and none of them forms a healthy pair with it. |

A healthy pair stays healthy when other notes also claim its PDF: the
name-matching note owns the PDF, keeps its hidden row, and keeps following
renames. Only the other claimants are flagged. *(call)*

A PDF with no claimant is simply an unwrapped PDF. It is never flagged; the
plugin has no way to know it was once wrapped, by design.

**Canonical form.** In a healthy pair the claim is written as
`[[<vault path to pdf>|<pdf file name>]]` (the format the plugin writes
today), and any embed of the PDF in the note body points at the same path.
The plugin rewrites the claim and embed to canonical form whenever it repairs
or changes a pair. *(call)*

## Behaviour

### Wrap

"Wrap PDF" on a PDF's file menu, plus a command-palette command that acts on
the active PDF *(call)*.

- Creates `<name>.md` beside the PDF from the configured template. **The PDF
  no longer moves.** The attachment-folder logic is removed.
- Template handling is unchanged: Templater if present, otherwise the core
  Templates placeholders (`{{title}}`, `{{date}}`, `{{time}}`).
- The claim is now required, so if the rendered template has neither
  `attachment` nor `attachments`, the plugin adds `attachment`. (Today it only
  fills a key that already exists.) *(call)*
- Embed placeholders in the template (`![[{{title}}.pdf]]` and the variants
  handled today) resolve to the canonical path.
- Refuses, with a clear notice, if a note of that name already exists or no
  template is configured.

### Live operations

These react to Obsidian's vault events, which fire for in-app actions and for
external changes Obsidian notices while running.

| Event | Response |
|---|---|
| Note of a healthy pair renamed or moved | Rename/move the PDF to match; rewrite claim and embed. |
| PDF of a healthy pair renamed or moved | Rename/move the note to match; rewrite claim and embed. |
| Folder containing pairs renamed or moved | Both files have already moved together; only rewrite claims and embeds if needed. |
| Note of a healthy pair deleted | After a grace period, send the PDF to trash (see below). |
| Note of a broken pair deleted | Nothing. The plugin only acts on PDFs it can see are paired. *(call)* |
| PDF of a pair deleted | Leave the note. It is now Missing and appears in Needs attention. *(call)* |
| Partner cannot follow (destination name taken) | Do not undo the user's action. Show a notice; the pair is now broken and appears in Needs attention. *(call)* |

**Deleting.** An in-app delete and an external delete look identical to a
plugin, and some sync tools and external moves surface as delete-then-create.
So *(call)*:

- On deletion of the note of a healthy pair, wait a short grace period (a few seconds). If
  a note claiming the same PDF appears in that time, treat it as a move, not a
  delete.
- Otherwise, if no other note still claims the PDF, move it to trash and show
  a notice naming it. If another note claims it, leave it.
- The plugin always uses a recoverable trash (system trash, or the vault's
  `.trash` folder where system trash is unavailable), even if the user has set
  Obsidian to delete permanently.
- A setting lets the user turn this off: "When a wrapped note is deleted:
  trash its PDF / leave the PDF".

**Duplicating.** A "Duplicate wrapped document" command (file menu on a
wrapper note, and command palette) copies both files using Obsidian's naming
convention for copies (`Statement 1.md`, `Statement 1.pdf`) and writes the new
claim. If the user copies only the note by other means, the copy claims the
original's PDF; the copy is an Extra claim and shows in Needs attention with a
"copy the PDF for this note" fix. The original is unaffected.

### Scan and repair

A scan runs once the vault has finished loading at startup, and on demand from
a command. It examines every note with a claim.

Automatic repair is limited to one case *(call)*:

- **Misnamed**, where the PDF is claimed by this note only and the note-named
  destination is free → rename the PDF to match the note. (When Obsidian was
  closed, this state arises from the note being renamed externally, so the
  note's name is taken as the intent.)

Everything else is left untouched and listed. A scan never deletes or trashes.

### Needs attention

A command opens a list of broken pairs; at startup a notice appears if the
list is non-empty. Each entry shows the note, the state, and the available
fixes:

| State | Fixes offered |
|---|---|
| Missing | Pick from candidate PDFs (unclaimed PDFs in the same folder first, then unclaimed PDFs anywhere whose name matches the note or the old claim); or remove the claim. |
| Misnamed (not auto-repaired) | Rename PDF to match note; or rename note to match PDF. |
| Displaced | Move the PDF beside the note (renaming to match). |
| Extra claim | Copy the PDF for this note; or remove this note's claim. |
| Contested | Per note: move/rename the PDF to this note; copy the PDF for this note; or remove this note's claim. |

There is a "fix all" for Displaced entries where the PDF has a single claimant
and the destination is free.

**Side effect, to be stated in the README.** A vault with hand-wrapped notes
whose PDFs live in the attachment folder will show every one of them as
Displaced. "Fix all" would bring those PDFs beside their notes. This is a
consequence of the stateless model, not an adoption feature; the owner plans a
separate migration and may or may not use it.

### One file in the explorer

- A setting, on by default, hides the PDF row of every healthy pair in the
  core file explorer.
- Implemented only as generated styling rules keyed on each row's file path.
  No explorer internals, no DOM observers, no patched handlers.
- Wrapper notes get a small visual marker by the same mechanism so wrapped
  documents are recognisable. *(call)*
- The rules are regenerated when pairs change.
- Known risk: existing hide-by-style plugins have reports of blank space or
  missing rows at the bottom of the explorer when many rows are hidden. See
  Spikes.

### Settings

- Template path (existing).
- Hide paired PDFs in the file explorer (default on).
- On delete: trash the PDF / leave it (default trash).

## Technical notes for the builder

- **Fix first:** on `main`, `PdfWrapperSettings` is a class holding `app`, and
  the instance is passed to `saveData`. This should fail to serialise and has
  not been verified in Obsidian. Settings should go back to a plain data
  object. The cached attachment-folder lookup goes away with the feature.
- **Shape the core for testing.** Put pair classification and repair planning
  in a module that takes a plain snapshot (file paths, and each note's claim)
  and returns states and intended actions, with no Obsidian imports. A thin
  layer gathers the snapshot from `vault`/`metadataCache` and executes actions.
  Add a unit-test runner (the designer suggests Vitest) and run it in CI
  alongside build and lint.
- **Prefer reconcile over mirror.** Events arrive in uncertain order (a folder
  move fires for every child). Treat an event as a hint to reconcile the
  affected pair after a brief settle, and make reconciliation idempotent, so a
  partner that has already moved is a no-op. Guard against reacting to the
  plugin's own renames.
- **Useful APIs** (present in the installed typings): `vault.on('rename')`
  gives the old path; `metadataCache.on('deleted')` gives the deleted note's
  previous cache, which is how to tell a deleted note was a wrapper;
  `fileManager.renameFile` updates links; `fileManager.processFrontMatter` for
  claims; `fileManager.trashFile` / `vault.trash` for trash. Register `create`
  handling only after layout is ready, since the vault fires `create` for every
  file on load. Raise `minAppVersion` to whatever these require.
- **Naming is inconsistent after the rename to `pdf-wrapper`.** README,
  CLAUDE.md and `package.json` still say `wrap-pdf` / "Wrap PDF" and reference
  `src/wrap-pdf.ts`. Bring them in line and rewrite the README for the new
  behaviour.
- Three Dependabot PRs are open; merge or supersede as convenient.

## Spikes (need the owner's hands in a real vault)

These are throwaway and gate decisions in the plan.

1. **Explorer hiding at scale.** Hide several hundred, then a few thousand,
   rows by styling rules. Look for gaps or missing rows, and behaviour after
   restart. If it misbehaves at the owner's real document count, ship the
   setting defaulting to off and say so.
2. **Event shapes.** Record what Obsidian reports for: in-app rename, move,
   delete; folder move; external rename/move/delete with Obsidian open; and
   the same arriving through the owner's sync. This confirms the settle delay
   and the delete grace period.

## Risks

- **Multi-device sync races.** When a pair is renamed on device A, device B
  may receive the note's rename before the PDF's. The plugin on B could rename
  the PDF itself just before sync does. Idempotent reconciliation and the
  settle delay are the mitigation; the result with the owner's sync tool is
  unverified and must be tested (spike 2). Which sync the owner uses is not
  known.
- **Delete ambiguity** (above). The grace period and trash-only rule are the
  mitigation.
- **Explorer hiding** may regress with Obsidian updates. Accepted: it fails to
  "two rows visible".

## Left to the builder

- Module layout beyond "testable core, thin Obsidian layer, minimal `main.ts`".
- Exact settle and grace durations (informed by spike 2).
- The form of the Needs attention UI (modal or sidebar view) and of the
  wrapper marker.
- How copies are numbered when `Statement 1` exists.
- Version number for the release.
- Order of work, provided the settings fix and test setup come first and the
  spikes run before the features they gate.
