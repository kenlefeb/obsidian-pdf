# Paired PDF documents — design

Date: 2026-11-15
Status: approved by owner 2026-11-15 (revision 7: name-independent pairing; a wrapped note no longer names its PDF)

Revision 7 folds in `2026-11-15-name-independent-pairing-design.md`, which is kept beside this file as the
record of why the change was made and what the owner decided. Where the two differ in detail, this document
describes what was built. See "Revision 7" below, "What was removed in revision 7" and "Revision history" at
the end.

## Intent

Make a PDF a first-class document in an Obsidian vault. A *wrapped document*
is a markdown note plus a PDF that the user treats as one file: the PDF is the
content (shown in the note), and the note carries frontmatter so the
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
   (Weakened in revision 7: without the plugin the note no longer shows its
   PDF. See "What gets weaker".)
8. Renaming, moving, copying or duplicating a wrapped document edits no file
   contents, on the acting device or any other (revision 7).

## Non-goals

- Adopting the owner's existing hand-wrapped documents (PDFs currently in the
  attachment folder, listed under an `attachments` property). That is a
  separate one-time migration outside the plugin. It writes the current form
  directly: move each PDF beside its note under the note's name, set the
  marker to `true`, take the PDF out of `attachments`, and replace the PDF
  embed with the block. A migration that only moves the PDFs and adds the
  marker also works: the notes are then listed as "Links to its own PDF" and
  "Convert all" does the rest. The plugin ignores those notes until then.
- Recovering *where a PDF went* by following a link. Since revision 7 there
  is no link; recovery is by name and folder.
- Showing the PDF in the note when the plugin is not installed.
- Options inside the block (page, size). The block's content is reserved. An
  embed that carried a page or size (`![[X.pdf#page=3]]`) loses it on Convert.
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

## Revision 7: a wrapped note does not name its PDF

### Why

Found by the owner in an iCloud vault. A wrapped pair was renamed on the phone.
On the Mac the PDF's new name arrived, but the note ended up twice: once under
the new name and once under the old name. Repeating it with the plugin turned
off on the Mac gave the same result, and the surviving old-named note held the
form of link that Obsidian's own link updater writes, not the plugin's.

Root cause: up to revision 6 a wrapped note referred to its PDF **by name**, in
the marker link and in the `![[Name.pdf]]` embed. Whenever the pair was renamed
the note was therefore renamed *and* edited within a moment: by the plugin on
the device where the rename was made, and by Obsidian's link updater on every
device that saw the PDF's new name. Sync does not reliably merge a rename and
an edit of the same file, and the note was duplicated. The same would happen to
a pair kept in step by hand. It could not be fixed in the follow logic.

### The change (decided by the owner)

**A wrapped note no longer refers to its PDF by name.** Renaming, moving or
copying a pair then changes file names only. No file's contents change, on any
device, so there is nothing for sync to collide on. Whether this cures the
duplication has not been run in Obsidian; it is the first check in
`docs/manual-test-checklist.md`.

Two things in the note changed:

1. **The marker is a flag, not a link.** `wrapped-pdf: true`.
2. **The PDF is shown by a block the plugin fills in**, not by a literal
   `![[Name.pdf]]` embed:

       ```wrapped-pdf
       ```

   The plugin renders the PDF that sits beside the note in place of the block.

No code path writes a link to a note's own PDF into that note.

### What gets weaker (accepted by the owner)

- Without the plugin, the note shows an empty code block instead of the PDF.
  The PDF is still beside the note under the same name.
- Obsidian no longer sees a link from the note to its PDF: the PDF is absent
  from the note's outgoing links and from the graph, and tools that clean up
  "unused attachments" may flag it. The README says so.
- A property query can no longer follow the marker to the PDF. A formula on
  the note's own name (`<name>.pdf` in the same folder) does the same job.
- After changes made outside Obsidian the plugin can only say "this note's PDF
  is not beside it" and suggest candidates. The finer states of revisions 1
  to 6 are gone (see "What was removed in revision 7").

## Definitions

Everything below marked *(call)* is the designer's decision, not something the
owner specified. The definitions are those of revision 7.

**Marker property.** The frontmatter property that marks a note as wrapping a
PDF. Its name is a setting (owner's decision); the default is `wrapped-pdf`
*(call)*. This document uses the default name.

**Marked note.** A note whose frontmatter has the marker property with any
value other than `false`, the text `false`, empty or null. The plugin writes
`true`. A link value (the format of revisions 1 to 6) still counts as marked,
and so does a list with at least one such entry. Notes without the property
are invisible to the plugin, whatever else they link to. The owner asked for a
dedicated property so that notes the plugin did not wrap are never touched.
*(call)*

**Wrapped document (healthy pair).** A marked note and a PDF with the same
base name in the same folder. That is the whole rule; nothing in the note names
the PDF. Folder and base name must match exactly, letter case included. The
extension may be in any case, so `Statement.md` pairs with `Statement.PDF`
(decided during the build). A healthy pair is always a pair for following,
hiding and duplicating, whether or not the note still links to its PDF.

**PDF not found.** A marked note with no same-named PDF beside it.

**Links to its own PDF.** A marked note that still refers to its PDF by name
anywhere: a link-valued marker (the old format), an entry in any other
property such as `attachments`, or a link or embed in the body. "Its PDF" here
is the PDF beside the note and the PDF a link-valued marker points to. Found
from Obsidian's own record of the note's links (body links, embeds and links
in properties). Such a note works as a pair but still has the problem revision
7 removes, until converted. The owner decided that the plugin lists these and
removes the links on Convert.

The plugin does not read or write `attachment` / `attachments` by name;
Convert treats every property other than the marker alike. The earlier advice
that a template may list the PDF under `attachments` is withdrawn: the
`wrapped-pdf` flag says the same thing without a link.

**Unwrapped PDF.** A PDF with no marked note of its name beside it, and which
no marked note's link-valued marker points to. A link-valued marker still
protects its PDF until the note is converted: that PDF is not listed as Not
wrapped, not offered to other notes, and not wrapped automatically. *(call)*
The files alone cannot say whether an unwrapped PDF was once wrapped. See
"Unwrapped PDFs" below for when these are listed.

**"Its note was deleted; the PDF was kept".** A PDF whose marked note was
removed outside Obsidian, deleted in Obsidian with following deletes off, or
deleted while other notes still link to the PDF. Unchanged by revision 7.

**Templates are not documents.** The configured template file, and every note
inside the Templater template folder or the core Templates folder, is ignored
by pairing: never a marked note, never listed. (The default template carries
`wrapped-pdf: true` and would otherwise be listed as "PDF not found" at every
launch.) A folder setting that is empty or names the whole vault is not a
template folder. *(call)*

## Behaviour

### Wrap

"Wrap PDF" on a PDF's file menu, plus a command-palette command that acts on
the active PDF *(call)*.

- Creates `<name>.md` beside the PDF from the template. **The PDF no longer
  moves.** The attachment-folder logic is removed.
- Template handling is unchanged: Templater if present, otherwise the core
  Templates placeholders (`{{title}}`, `{{date}}`, `{{time}}`).
- The plugin always sets the marker property on the new note to `true`,
  whether or not the template mentions it.
- After the note is created it is converted exactly as Convert would (see
  Needs attention): a link-valued marker becomes `true`, the PDF is taken out
  of other properties, embeds of it become the block and plain links to it
  become text. So a template the plugin could not repair, or one that lists
  the PDF under `attachments`, still yields a note with no link to its PDF.
  When this removes something the template put there, the user is told which
  property or what kind of line, so they can fix the template; a run over
  several PDFs (automatic wrapping, "Wrap all") says it once. *(call)*
- Refuses, with a clear notice, if a note of that name already exists, or if
  the PDF's name contains a character a link cannot hold (`[ ] | # ^`).

**No prerequisites** (owner's decision, revision 4). Wrapping must work
straight after installing the plugin, with nothing configured.

- *No template.* If no template is configured, the plugin creates a default
  one, saves its path in settings, tells the user where it is, and carries on
  with the wrap. If a template is configured but the file does not exist, the
  default is created at that configured path so the setting stands.
- *Default template.* A frontmatter block with the marker property set to
  `true`, and the `wrapped-pdf` block. It needs neither Templater nor the
  core Templates plugin.
- *Where the default goes* *(call)*: the Templater template folder if one is
  set; otherwise the core Templates folder if one is set; otherwise a
  `Templates` folder at the vault root, created if needed. The file is named
  `Wrapped PDF.md`.
- *Template lacks something.* The necessary components are the marker
  property in the frontmatter and the `wrapped-pdf` block in the body. Each
  time a PDF is wrapped the template is checked; whatever is missing is added
  to the template file itself, and the user is told what was changed.
- *How the template is edited* *(call)*: by text insertion, and replacement
  of known lines, only. A marker line is added to the existing frontmatter,
  or a frontmatter block is added if there is none; a marker line that is
  empty or holds the old placeholder link (`[[{{title}}.pdf]]`) is set to
  `true`; the block is appended at the end if the body has none. The
  frontmatter is never parsed and re-written, because that can mangle
  Templater expressions.
- *The old placeholder embed* *(call)*: an embed whose file name is the title
  placeholder and nothing else (`![[{{title}}.pdf]]`, `{{file}}`, Templater's
  `<% tp.file.title %>`, with or without `.pdf`, in any folder) is **replaced
  by the block**, and the user is told. Only that embed is replaced. Any
  other embed or link in the template (a fixed file, a name built from
  something else) is left in the template; if it turns out to point at the
  note's own PDF, the conversion after the wrap takes it out of the note.
- *Failure.* If any of this cannot be done, the wrap stops and a notice names
  the file and the reason (for example, "Could not create the default
  template at X: a folder with that name exists."). There is no generic
  "no template configured" message.

Known sync risk: two devices that both find no template before settings have
synced will each create the default. The contents are identical, so the worst
case is a duplicate file.

### The block (revision 7)

- A fenced code block with the language `wrapped-pdf` *(call: fixed name, not
  tied to the marker setting)*. Its content is ignored.
- In reading view and live preview, on desktop and mobile, the plugin renders
  in its place the PDF beside the note. It works in any note, but shows the
  PDF only if one with the note's name is beside it; otherwise it shows
  "No PDF named <name>.pdf beside this note."
- It updates when the note or the PDF is renamed, moved, created or deleted.
- Rendering never edits a file.
- Decided during the build: the block draws nothing when it is not in a note
  (for example a canvas card). It uses Obsidian's own PDF viewer for embeds
  (`app.embedRegistry`, undocumented and guarded). When that viewer cannot be
  loaded, it asks Obsidian to render an ordinary embed of the PDF and puts a
  plain link to the PDF under it; when even that fails, the link alone. So
  the block never ends up empty in a note.
- None of this has been run in Obsidian.

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
  no link-valued marker points to it, and no note of that name exists. This
  is what stops a device from wrapping a PDF whose note is about to arrive by
  sync.
- **Guard for a pair in transit** (revision 7) *(call)*: a PDF that arrives
  from outside is **not** wrapped automatically while there is a marked note
  whose PDF is not found and which is either in the same folder as the
  arriving PDF (a rename in transit) or has the same base name anywhere in
  the vault (a move in transit). That is what a pair looks like on a second
  device while its rename or move is still arriving, PDF first and note
  later; wrapping it would create the very duplicate note revision 7 exists
  to prevent. A PDF held back by the guard is not retried automatically. It
  stays listed as Not wrapped; if the note then arrives the pair is simply
  healthy, and if it was a false alarm the owner wraps it from the list. A
  PDF made inside Obsidian is not held.
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

Same rules as before revision 7, simpler mechanics. No marker or embed is ever
rewritten: following changes file names only.

| Action | Response |
|---|---|
| Rename or move the note of a healthy pair | Rename/move the PDF to match at once. |
| Rename or move the PDF of a healthy pair | Rename/move the note to match at once. |
| Rename or move a folder containing pairs | Both files move together; nothing to do. |
| Delete the note of a healthy pair | Delete the PDF too, the same way the note was deleted (the user's Obsidian setting: system trash, vault trash, or permanent). No wait, no quarantine. Skipped, with a notice, if another note links to or embeds the PDF; the PDF is then listed as "Its note was deleted; the PDF was kept". |
| Delete a marked note with no PDF beside it | Nothing. The plugin only acts on PDFs it can see are paired. *(call)* |
| Delete the PDF of a pair | Leave the note. It is now "PDF not found" and is listed. *(call)* |
| Duplicate wrapped document (plugin command) | Copy both files using Obsidian's naming for copies (`Statement 1.md`, `Statement 1.pdf`); nothing else. |
| Copy the note with Obsidian's own copy action ("Make a copy" / "Duplicate" in the file menu), or any other in-app copy | Copy the PDF too, under the copy's name (owner's decision, revision 6: the user expects the whole document to be duplicated). The copy note is not edited. See "Copy, in detail". Nothing is overwritten: if a PDF with the copy's name is already there, the copy simply pairs with it (pairing is by name) and nothing is copied; if the name is taken only in another letter case, a notice says so and the copy is listed as "PDF not found". The original is unaffected. |
| A copy of the note that arrives from outside (Finder, sync) | Not acted on. The copy is listed as "PDF not found", with a "Copy another document's PDF" fix. |
| Partner cannot follow (destination name taken) | The user's action stands. Show a notice; a note left without a PDF is listed as "PDF not found". A note renamed onto the name of an existing PDF pairs with that PDF, by the name rule, and its former PDF is left as an unwrapped PDF. *(call)* |

"Healthy before the action" is decided from the old path: the note was marked
and a PDF with its old name was beside it.

**Copy, in detail** *(call)*. A copied note carries the marker but has no PDF.
The plugin copies the PDF when it can tell which document was copied:

- If Obsidian's copy goes through `Vault.copy`, the plugin's wrapper sees the
  source note; if that source is the note of a healthy pair, its PDF is
  copied.
- Otherwise (the copy was made some other in-app way), once the new note is
  indexed: if it is marked, has no PDF, and exactly one healthy pair's note in
  the same folder has identical text **and** the new note's name reads as a
  copy of that note's name (the name, followed by something that does not
  start with a letter or digit: `Name 1`, `Name copy`, `Name (1)`), that
  pair's PDF is copied. The name test was added during the build, because
  notes made from one template are identical.
- If neither applies, the copy is listed as "PDF not found".

As before, this needs the copy to be recognised as made inside Obsidian (the
new note's own file mark, not a folder mark) and is governed by "Rename and
move the PDF with its note". Both routes are unverified in Obsidian. The
Watcher's second look at a newly created note, once the metadata cache has
indexed it, is kept: the marker of a fresh copy is usually not readable when
its `create` event arrives.

### Everything else

Changes that are not a local action — made in Finder or by another app while
Obsidian is open, or delivered by sync — are never acted on directly. After a
settle period the affected pair is re-examined:

- If it is healthy (for example, sync has since delivered the partner's
  change), nothing happens.
- If the note has no PDF beside it, it is listed as "PDF not found".
- If a healthy pair's note has gone and the PDF remains, the PDF is kept and
  listed as "Its note was deleted; the PDF was kept", with fixes: keep it as
  a plain PDF, wrap it again, or delete the PDF too. If the PDF then disappears as well
  (sync catching up), the entry clears itself.

To survive a restart, these "note removed" entries are kept in the plugin's
data. This is a list of open questions for the user, not a record of pairs;
losing it loses nothing but the reminder. *(call)*

### Scan

A scan runs at startup, after the vault has loaded and a settle period has
passed, and on demand from a command. It pairs every marked note with the PDF
beside it and, when automatic wrapping is on for this device, collects
unwrapped PDFs.

**A scan never changes files.** Nor does the block's renderer. Before the startup notice is shown, entries
are re-checked so that pairs sync has since completed drop off the list.

### Needs attention

A command opens the list; at startup a notice appears if it is non-empty. The
list must be usable on a phone. Each entry shows the file, the state, and the
available fixes. At most one entry per marked note: "Links to its own PDF"
when it still links to its PDF (whether or not a PDF is beside it), else "PDF
not found" when it has none.

| Entry | Fixes offered |
|---|---|
| PDF not found | **Use a PDF**: pick from unwrapped PDFs (same folder first, then same name elsewhere); it is moved and renamed to the note's name. **Rename note to match**: for an unwrapped PDF in the same folder, the note takes the PDF's name instead. **Copy another document's PDF**: pick a wrapped document; its PDF is copied under this note's name. **Remove the marker.** A fix that needs a choice is offered only when there is something to choose. |
| Links to its own PDF | **Convert**, described below. |
| Its note was deleted; the PDF was kept | Keep as a plain PDF; Wrap; Delete the PDF (asks first). |
| Not wrapped | Wrap. |

**Convert** does all of the following to one note, after saying what it will
do and asking for confirmation:

1. If the note has **no** PDF beside it and its marker is a link to a PDF
   elsewhere, that PDF is first moved and renamed beside the note. This is
   refused, with a notice, if the name is taken or another note's marker
   points to the same PDF.
2. The marker becomes `true`.
3. The PDF is taken out of every other property: removed from a list, leaving
   the other entries; a property holding only that link is emptied.
4. In the body, each embed of the PDF becomes the block, and each plain link
   to it becomes its display text (the alias, else the file name).

Decided during the build:

- With a PDF already beside the note, Convert never moves a file. If the
  marker points at a *different* PDF, that one stays where it is and is then
  an ordinary unwrapped PDF (listed as Not wrapped when automatic wrapping is
  on).
- If the marker's PDF is the PDF of another wrapped document, Convert does
  not move it. The note is converted and then shows as PDF not found.
- If the marker's PDF does not exist, the note is converted and then shows as
  PDF not found.
- A failed move stops the fix: the note is not converted after it.
- Step 4 leaves fenced code blocks and inline code alone. It does not
  recognise comments, math or indented code, so a link to the PDF written
  there may be changed too. An embed inside a list item, quote or table cell
  is replaced by a block on its own lines, which breaks that list, quote or
  table. A page or size on an embed is lost. *(calls: the details of 3 and
  4)*

"Convert all" covers only "Links to its own PDF" entries whose PDF is already
beside the note under its name, so the bulk action never moves a file. It asks
once before it runs. There is no bulk fix for PDF not found: every such entry
needs a choice. "Wrap all" covers unwrapped PDFs.

A PDF that is not found may simply not have been downloaded yet (iCloud can
leave files in the cloud). The entry says so, and nothing destructive is ever
the default. Every fix re-checks that the entry is still as listed before
changing anything.

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
- **Shape the core for testing.** Put pairing and fix planning in
  a module that takes a plain snapshot (file paths, and the marked notes) and
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
  the marker (wrap, Convert, Remove the marker); `fileManager.trashFile` deletes according to the user's setting;
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

Added in revision 7:

- **The cure itself is unverified.** That a rename which edits no file is
  delivered by iCloud and Obsidian Sync without duplicating the note has not
  been run.
- **The block renders through Obsidian's PDF viewer for embeds**, reached
  through an undocumented API. Believed to work in both views and on mobile;
  not run. If it fails the block falls back to a rendered embed and a link.
- **Other notes that link to the PDF are still edited by Obsidian on every
  device when the PDF is renamed.** Those notes are not being renamed at the
  same moment, and each device writes the same text, so this is ordinary
  Obsidian behaviour and not expected to duplicate anything; unverified.
- **The rename itself still arrives as two events on another device.** With
  nothing to edit, the worst case is a brief "PDF not found" entry that
  clears. The automatic-wrapping guard covers the one case that could act on
  it.
- **Copy detection** depends on how Obsidian's own copy action creates the
  file; both routes are unverified.
- **A wrapped note merged into another note loses its PDF.** Up to revision
  6, Note composer's merge left an embed of the PDF in the target note, and
  the "another note links to it" guard kept the PDF. The block names no PDF,
  so after a merge nothing links to it and the followed delete removes it
  (the way the note was deleted, which may be permanent). The README says so;
  unverified.
- **Notes wrapped by test builds so far link to their own PDF.** They keep
  working as pairs and are listed with Convert / Convert all, but keep the
  duplication problem until converted.

## Left to the builder

- Module layout beyond "testable core, thin Obsidian layer, minimal `main.ts`".
- Exact settle durations (informed by spike 2).
- The form of the Needs attention UI (modal or sidebar view) and of the
  visual marker on wrapper notes.
- How copies are numbered when `Statement 1` exists.
- Version number for the release.
- Order of work, provided the settings fix and test setup come first and the
  spikes run before the features they gate.

## What was removed in revision 7

- The link-valued marker and its canonical form
  (`[[<vault path to pdf>|<pdf file name>]]`); writing or rewriting the
  marker after a rename, copy or fix. A link-valued marker is still *read*:
  it marks the note, protects its PDF, and is what Convert replaces.
- Rewriting embeds after a rename, copy or fix. The text transform is kept
  only for wrap and for Convert.
- The idea of a *claim* (a note naming a PDF through its marker), and the
  states built on it, with their fixes:

  | State (revisions 1 to 6) | Meant | Now |
  |---|---|---|
  | Missing | The claimed PDF does not exist. | PDF not found. |
  | Misnamed | The claimed PDF is in the note's folder under a different name. | PDF not found; "Use a PDF" or "Rename note to match". For a note with a link-valued marker: Links to its own PDF, and Convert moves the PDF. |
  | Displaced | The claimed PDF exists in a different folder. | PDF not found; "Use a PDF" offers a same-named PDF elsewhere. For a link-valued marker, as above. |
  | Extra claim | The claimed PDF is the partner of a different note's healthy pair (typically a copy). | PDF not found; "Copy another document's PDF". |
  | Contested | Two or more notes claim the same PDF and none forms a healthy pair with it. | Each note is PDF not found (or Links to its own PDF; Convert refuses to move a PDF two markers point to). |

- "Fix all" (it covered Misnamed and Displaced). Replaced by "Convert all".
- The guard "skip the delete if another note still claims the PDF". The guard
  for other notes that link to or embed the PDF stays.
- The advice that a template may list the PDF under `attachments`.

## Revision history

- Revisions 1 to 3: the original design (side-by-side layout, files as the
  only record, the governing rule).
- Revision 4: no prerequisites; the default template and template repair.
- Revision 5: local-intent detection is assumed to work, with the two follow
  settings as the user's switch.
- Revision 6: an in-app copy of a wrapped note copies its PDF too.
- Revision 7: name-independent pairing. The marker is a flag, the PDF is
  shown by the `wrapped-pdf` block, and following edits no note. Change
  document: `2026-11-15-name-independent-pairing-design.md`.
