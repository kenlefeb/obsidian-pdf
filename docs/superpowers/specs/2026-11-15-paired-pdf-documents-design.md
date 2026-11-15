# Paired PDF documents — design

Date: 2026-11-15
Status: approved by owner 2026-11-15 (revision 5: following in-app changes is a setting; spike 2 no longer gates the build)

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

Later, the owner intends to fill frontmatter from the PDF's own contents. That
is not part of this work, but wrapping should be one clear step that such
extraction can later plug into.

## Goals

1. A wrapped document is laid out as a note and a PDF **side by side: same
   folder, same base name** (`Statement.md` + `Statement.pdf`).
2. Rename, move, delete and duplicate done inside Obsidian apply to both
   files.
3. Changes made outside Obsidian (Finder, sync, scripts), including while
   Obsidian was closed, are detected and listed with one-click fixes. The PDF
   is protected until the user decides.
4. Optionally, every PDF added to the vault is wrapped automatically.
5. It is safe on every device the owner uses, desktop and mobile, with vaults
   synced by iCloud and by Obsidian Sync, and the plugin running on all of
   them at once.
6. In the core file explorer the pair looks like one file.
7. The vault stays plain files that are fully usable without the plugin.

## Non-goals

- Adopting the owner's existing hand-wrapped documents (PDFs currently in the
  attachment folder, listed under an `attachments` property). That is a
  separate one-time migration outside the plugin, which moves each PDF beside
  its note and adds the marker property defined below. The plugin ignores
  those notes until then.
- Extracting frontmatter from PDF contents (future work; see Intent).
- More than one PDF, or other file types, per document.
- A custom container or archive file type. Rejected: Obsidian only indexes
  `.md`, so frontmatter inside a container would not be queryable.
- A folder-per-document layout or macOS package. Considered and set aside; see
  Approaches.
- Hiding the PDF anywhere other than the core file explorer (quick switcher,
  search, graph, third-party explorers).
- Redirecting "open the PDF" to open the note.
- A Finder extension or any companion app.
- Multi-select / batch wrapping from the file menu.

## Anti-goals

These would make the result a failure even if it technically works:

- **Losing a file the user did not mean to delete.** The plugin deletes a PDF
  only as part of a delete the user performed inside Obsidian on this device.
  It never deletes because of a scan, a sync-delivered change, or anything
  done outside Obsidian.
- **A second source of truth for pairs.** No registry, index or cache of pairs
  that can disagree with what is on disk.
- **Breaking when the cosmetics break.** If an Obsidian update defeats the
  explorer hiding, pairing and syncing must be unaffected; the user just sees
  two files.
- **Depending on file-explorer internals.** The explorer is touched by styling
  rules only.

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

## The governing rule

Decided by the owner for deletes, and extended by the designer to every
operation *(call)*:

> **The plugin acts on its own only in response to something the user did
> inside Obsidian on this device. Everything else — changes made in Finder,
> delivered by sync, or made while Obsidian or the plugin was not running —
> it protects and lists, and the user makes the call.**

The owner's reasoning for deletes: a user who deletes a wrapped note in
Obsidian believes they are deleting the document, so the PDF should go with
it, with no quarantine. A note that vanishes any other way is not evidence of
that intent.

Extending the rule to renames and moves also removes the multi-device race:
a device that merely *receives* a rename through sync never acts on it, so two
devices cannot both rename the same PDF.

**The owner's decision on the unproven part (revision 5).** Whether the
plugin can reliably tell a local action from an outside one has not been
tested in the owner's vaults. Rather than gate the build on that test, the
owner chose to assume detection works and to give the user the switch:

- "Delete the PDF when its note is deleted in Obsidian" — on by default. When
  off, a wrapped note's PDF is never deleted by the plugin; it is kept and
  listed, exactly as for a note removed outside Obsidian.
- "Rename and move the PDF with its note" — on by default *(call: the owner
  asked for the delete switch; the same detection drives renames and moves,
  so they get the same escape hatch)*. When off, in-app renames and moves are
  treated like outside ones: nothing follows, and the pair is listed.

Each setting's description says plainly what it relies on and when to turn it
off.

This rule depends on telling a local action from everything else. See "Local
intent" under Technical notes; it is the main thing spike 2 must confirm. If a
change cannot be positively identified as local, it is treated as not local.

## Definitions

Everything below marked *(call)* is the designer's decision, not something the
owner specified.

**Marker property.** The frontmatter property that marks a note as wrapping a
PDF. Its name is a setting (owner's decision); the default is `wrapped-pdf`
*(call)*. This document uses the default name.

**Claim.** A note *claims* a PDF when its marker property holds a single link
to a `.pdf` file. Notes without the property are invisible to the plugin,
whatever else they link to. The owner asked for a dedicated property so that
notes the plugin did not wrap are never touched.

The plugin no longer reads or writes `attachment` / `attachments`. The owner
usually keeps an `attachments` list; a template can still include the PDF
there, and Obsidian's own link updating keeps it current on rename. *(call)*

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

**Unwrapped PDF.** A PDF no note claims. The files alone cannot say whether it
was once wrapped. See "Unwrapped PDFs" below for when these are listed.

**Canonical form.** In a healthy pair the marker value is written as
`[[<vault path to pdf>|<pdf file name>]]` (the format the plugin writes
today), and any embed of the PDF in the note body points at the same path.
The plugin rewrites the claim and embed to canonical form whenever it repairs
or changes a pair. *(call)*

## Behaviour

### Wrap

"Wrap PDF" on a PDF's file menu, plus a command-palette command that acts on
the active PDF *(call)*.

- Creates `<name>.md` beside the PDF from the template. **The PDF no longer
  moves.** The attachment-folder logic is removed.
- Template handling is unchanged: Templater if present, otherwise the core
  Templates placeholders (`{{title}}`, `{{date}}`, `{{time}}`).
- The plugin always sets the marker property on the new note, whether or not
  the template mentions it.
- Embed placeholders in the template (`![[{{title}}.pdf]]` and the variants
  handled today) resolve to the canonical path.
- Refuses, with a clear notice, if a note of that name already exists.

**No prerequisites** (owner's decision, revision 4). Wrapping must work
straight after installing the plugin, with nothing configured.

- *No template.* If no template is configured, the plugin creates a default
  one, saves its path in settings, tells the user where it is, and carries on
  with the wrap. If a template is configured but the file does not exist, the
  default is created at that configured path so the setting stands.
- *Default template.* A frontmatter block containing the marker property, and
  one line embedding the PDF (`![[{{title}}.pdf]]`). It needs neither
  Templater nor the core Templates plugin.
- *Where the default goes* *(call)*: the Templater template folder if one is
  set; otherwise the core Templates folder if one is set; otherwise a
  `Templates` folder at the vault root, created if needed. The file is named
  `Wrapped PDF.md`.
- *Template lacks something.* The necessary components are the marker
  property in the frontmatter and an embed of the PDF in the body. Each time
  a PDF is wrapped the template is checked; whatever is missing is added to
  the template file itself, and the user is told what was added.
- *How the template is edited* *(call)*: by minimal text insertion only. One
  line is added to the existing frontmatter, or a frontmatter block is added
  if there is none, and the embed line is appended at the end. The
  frontmatter is never parsed and re-written, because that can mangle
  Templater expressions.
- *What counts as an embed being present* *(call)*: any embed of a `.pdf`
  target, or any embed whose target contains a placeholder (`{{…}}` or a
  Templater `<% … %>` expression). Such a template is left alone.
- *Failure.* If any of this cannot be done, the wrap stops and a notice names
  the file and the reason (for example, "Could not create the default
  template at X: a folder with that name exists."). There is no generic
  "no template configured" message.

Known sync risk: two devices that both find no template before settings have
synced will each create the default. The contents are identical, so the worst
case is a duplicate file.

### Automatic wrapping

A setting (owner's decision): wrap every PDF that is added to the vault while
the plugin is running. The owner will have it on. Default off *(call)*:
wrapping every new PDF on a fresh install, unasked, would be surprising.
Automatic wrapping prepares the template exactly as a manual wrap does; it
never gives up for want of one.

Details, all *(call)*:

- "Added" means a PDF file appearing after the vault has finished loading,
  however it got there: dropped into Obsidian, saved into the vault folder by
  another app, or delivered by sync.
- The plugin waits a settle period, then wraps only if the PDF still exists,
  no note claims it, and no note of that name exists. This is what stops a
  device from wrapping a PDF whose note is about to arrive by sync.
- Automatic wrapping does not open the new note; it shows a notice.
- PDFs created in Obsidian's configured attachment folder are skipped when
  that setting names a specific folder. Those are files pasted or dropped into
  other notes, not documents.
- **The switch is per device**, stored locally and not synced with the rest of
  the settings. When the same new PDF reaches two devices at once (for
  example a scanner saving into iCloud), both could wrap it and produce
  conflicting notes. The settle-and-check reduces this but cannot remove it. A
  per-device switch lets the owner run it everywhere and fall back to one
  device if conflicts appear.
- PDFs that arrived while Obsidian was closed are not wrapped automatically;
  they appear under Unwrapped PDFs with a "wrap all".

### Things the user does inside Obsidian

| Action | Response |
|---|---|
| Rename or move the note of a healthy pair | Rename/move the PDF to match at once; rewrite claim and embed. |
| Rename or move the PDF of a healthy pair | Rename/move the note to match at once; rewrite claim and embed. |
| Rename or move a folder containing pairs | Both files move together; rewrite claims and embeds if needed. |
| Delete the note of a healthy pair | Delete the PDF too, the same way the note was deleted (the user's Obsidian setting: system trash, vault trash, or permanent). No wait, no quarantine. Skipped if another note still claims the PDF. |
| Delete the note of a broken pair | Nothing. The plugin only acts on PDFs it can see are paired. *(call)* |
| Delete the PDF of a pair | Leave the note. It is now Missing and is listed. *(call)* |
| Duplicate wrapped document (new command) | Copy both files using Obsidian's naming for copies (`Statement 1.md`, `Statement 1.pdf`) and write the new claim. |
| Copy only the note by other means | The copy is an Extra claim and is listed, with a "copy the PDF for this note" fix. The original is unaffected. |
| Partner cannot follow (destination name taken) | The user's action stands. Show a notice; the pair is now broken and is listed. *(call)* |

### Everything else

Changes that are not a local action — made in Finder or by another app while
Obsidian is open, or delivered by sync — are never acted on directly. After a
settle period the affected pair is re-examined:

- If it is healthy (for example, sync has since delivered the partner's
  change), nothing happens.
- If it is broken, it is listed.
- If a healthy pair's note has gone and the PDF remains, the PDF is kept and
  listed as "note removed outside Obsidian", with fixes: delete the PDF too,
  wrap it again, or keep it as a plain PDF. If the PDF then disappears as well
  (sync catching up), the entry clears itself.

To survive a restart, these "note removed" entries are kept in the plugin's
data. This is a list of open questions for the user, not a record of pairs;
losing it loses nothing but the reminder. *(call)*

### Scan

A scan runs at startup, after the vault has loaded and a settle period has
passed, and on demand from a command. It classifies every note with a claim
and, when automatic wrapping is on for this device, collects unwrapped PDFs.

**A scan never changes files.** Before the startup notice is shown, entries
are re-checked so that pairs sync has since completed drop off the list.

### Needs attention

A command opens the list; at startup a notice appears if it is non-empty. The
list must be usable on a phone. Each entry shows the file, the state, and the
available fixes:

| State | Fixes offered |
|---|---|
| Missing | Pick from candidate PDFs (unclaimed PDFs in the same folder first, then unclaimed PDFs anywhere whose name matches the note or the old claim); or remove the claim. |
| Misnamed | Rename PDF to match note (default); or rename note to match PDF. |
| Displaced | Move the PDF beside the note (renaming to match). |
| Extra claim | Copy the PDF for this note; or remove this note's claim. |
| Contested | Per note: move/rename the PDF to this note; copy the PDF for this note; or remove this note's claim. |
| Note removed outside Obsidian | Delete the PDF too; wrap it again; or keep as a plain PDF. |
| Unwrapped PDF | Wrap. |

"Fix all" covers Misnamed and Displaced entries where the PDF has a single
claimant and the destination is free, and "wrap all" covers unwrapped PDFs.

A Missing PDF may simply not have been downloaded yet (iCloud can leave files
in the cloud). The entry says so, and nothing destructive is ever the default.

**Unwrapped PDFs.** Listed only when automatic wrapping is on for this device,
since that is when every PDF is meant to be wrapped. They cover PDFs that
arrived while Obsidian was closed, and PDFs whose note was removed while the
plugin was not running (which the files alone cannot distinguish from a new
PDF). With automatic wrapping off, a lone PDF is just a visible PDF in the
explorer; its reappearing row is the signal. PDFs in the configured attachment
folder are excluded, as for automatic wrapping. *(call)*

### One file in the explorer

- A setting, on by default, hides the PDF row of every healthy pair in the
  core file explorer.
- Implemented only as generated styling rules keyed on each row's file path.
  No explorer internals, no DOM observers, no patched explorer handlers.
- Wrapper notes get a small visual marker by the same mechanism so wrapped
  documents are recognisable. *(call)*
- The rules are regenerated when pairs change.
- Known risk: existing hide-by-style plugins have reports of blank space or
  missing rows at the bottom of the explorer when many rows are hidden. See
  Spikes.

### Settings

- Template path (existing). May be empty; a default is created on first wrap.
- Marker property name (default `wrapped-pdf`). Changing it does not rename
  the property in existing notes; the setting's description says so, since
  notes carrying the old name stop being recognised. *(call)*
- Wrap new PDFs automatically (per device, default off).
- Hide paired PDFs in the file explorer (default on).
- Delete the PDF when its note is deleted in Obsidian (default on).
- Rename and move the PDF with its note (default on).

The earlier draft's "on delete: trash / leave" setting is dropped; the owner's
delete rule makes it unnecessary.

## Technical notes for the builder

- **Fix first:** on `main`, `PdfWrapperSettings` is a class holding `app`, and
  the instance is passed to `saveData`. This should fail to serialise and has
  not been verified in Obsidian. Settings should go back to a plain data
  object. The cached attachment-folder lookup goes away with the feature.
- **Local intent.** Obsidian's vault events do not say where a change came
  from. The designer's proposed mechanism: wrap the documented `Vault` methods
  that in-app actions go through (`rename`, `trash`, `delete`) so the plugin
  notes "this path is being changed locally" just before the event fires.
  Changes Obsidian picks up from the file system should not pass through those
  methods. This wraps public API, not explorer internals, but it is still an
  interception and is **unverified**: in particular, whether Obsidian Sync
  applies remote changes through the same methods is unknown. Spike 2 settles
  it. Whatever the mechanism, the default when unsure is "not local".
- **Shape the core for testing.** Put pair classification and fix planning in
  a module that takes a plain snapshot (file paths, and each note's claim) and
  returns states and intended actions, with no Obsidian imports. A thin layer
  gathers the snapshot from `vault`/`metadataCache` and executes actions. Add
  a unit-test runner (the designer suggests Vitest) and run it in CI alongside
  build and lint.
- **Reconcile, do not mirror.** Events arrive in uncertain order (a folder
  move fires for every child). Treat an event as a hint to re-examine the
  affected pair, make every action idempotent (a rename whose destination
  already holds the partner is a no-op), and guard against reacting to the
  plugin's own changes, including PDFs it creates when duplicating.
- **Useful APIs** (present in the installed typings): `vault.on('rename')`
  gives the old path; `metadataCache.on('deleted')` gives the deleted note's
  previous cache, which is how to tell a deleted note was a wrapper;
  `fileManager.renameFile` updates links; `fileManager.processFrontMatter` for
  claims; `fileManager.trashFile` deletes according to the user's setting;
  `app.saveLocalStorage` / `loadLocalStorage` for the per-device switch.
  Register `create` handling only after layout is ready, since the vault fires
  `create` for every file on load. Raise `minAppVersion` to whatever these
  require.
- **Naming is inconsistent after the rename to `pdf-wrapper`.** README,
  CLAUDE.md and `package.json` still say `wrap-pdf` / "Wrap PDF" and reference
  `src/wrap-pdf.ts`. Bring them in line and rewrite the README for the new
  behaviour.
- Three Dependabot PRs are open; merge or supersede as convenient.

## Spikes (need the owner's hands in real vaults)

These are throwaway and gate decisions in the plan.

1. **Explorer hiding at scale.** Hide several hundred, then a few thousand,
   rows by styling rules, on desktop and on mobile. Look for gaps or missing
   rows, and behaviour after restart. If it misbehaves at the owner's real
   document count, ship the setting defaulting to off and say so.
2. **Event shapes and local intent.** With a logging build that includes the
   proposed `Vault` method wrapping, in one iCloud vault and one Obsidian Sync
   vault, with a second device (including a phone) open: rename, move and
   delete a note and a PDF in Obsidian; move a folder; do the same in Finder;
   add a new PDF by each route the owner uses. Establish:
   - whether every in-app action is identified as local, on desktop and
     mobile;
   - whether any Finder or sync-delivered change is wrongly identified as
     local (Obsidian Sync especially);
   - whether a rename made on device A arrives on device B as a rename or as
     delete-then-create, and how far apart the note and PDF arrive;
   - how long after a new PDF appears its note reaches the other device;
   - what a not-yet-downloaded iCloud PDF looks like to the plugin.
   The results confirm or replace the local-intent mechanism and set the
   settle durations.

## Risks

- **Local intent may not be dependable.** It is assumed to work (owner's
  decision, revision 5) and has not been verified. If in-app actions are not
  recognised, nothing follows and pairs are listed. If sync-delivered or
  Finder changes are mistaken for local ones, a receiving device could repeat
  a rename, or trash a PDF whose note arrived as delete-then-create. The two
  settings above are the remedy, and the README must say so. Spike 2 remains
  available as an optional diagnostic.
- **In-app delete follows the user's Obsidian setting**, which may be
  permanent deletion. This is the owner's explicit choice.
- **Automatic wrapping on several devices** can produce conflicting notes for
  the same PDF. Mitigated by settle-and-check and the per-device switch;
  residual risk until spike 2.
- **Marker name differing between devices** (if settings are not synced) makes
  one device blind to pairs. It would then leave everything alone, which is
  safe but confusing.
- **Explorer hiding** may regress with Obsidian updates. Accepted: it fails to
  "two rows visible".

## Left to the builder

- Module layout beyond "testable core, thin Obsidian layer, minimal `main.ts`".
- Exact settle durations (informed by spike 2).
- The form of the Needs attention UI (modal or sidebar view) and of the
  visual marker on wrapper notes.
- How copies are numbered when `Statement 1` exists.
- Version number for the release.
- Order of work, provided the settings fix and test setup come first and the
  spikes run before the features they gate.
