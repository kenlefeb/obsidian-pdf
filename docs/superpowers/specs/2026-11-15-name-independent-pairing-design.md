# Name-independent pairing — design change

Date: 2026-11-15
Status: awaiting approval
Amends: `2026-11-15-paired-pdf-documents-design.md` (this would become its revision 7)

## Why

Found by the owner in an iCloud vault. A wrapped pair was renamed on the phone.
On the Mac the PDF's new name arrived, but the note ended up twice: once under
the new name and once under the old name. Repeating it with the plugin turned
off on the Mac gave the same result, and the surviving old-named note read

    wrapped-pdf: "[[Another test from phone.pdf|Another test.pdf]]"

That is the form Obsidian's own link updater writes, not the plugin's.

Root cause: a wrapped note refers to its PDF **by name**, in the marker link
and in the `![[Name.pdf]]` embed. Whenever the pair is renamed the note is
therefore renamed *and* edited within a moment: by the plugin on the device
where the rename was made, and by Obsidian's link updater on every device that
sees the PDF's new name. Sync does not reliably merge a rename and an edit of
the same file, and the note is duplicated. The same would happen to a pair
kept in step by hand. It cannot be fixed in the follow logic.

## The change (decided by the owner: "option 1")

**A wrapped note no longer refers to its PDF by name.** Renaming, moving or
copying a pair then changes file names only. No file's contents change, on any
device, so there is nothing for sync to collide on.

Two things in the note change:

1. **The marker is a flag, not a link.** `wrapped-pdf: true`.
2. **The PDF is shown by a block the plugin fills in**, not by a literal
   `![[Name.pdf]]` embed:

       ```wrapped-pdf
       ```

   The plugin renders the PDF that sits beside the note in place of the block.

Everything below marked *(call)* is the designer's decision.

## Goals

1. Renaming, moving, copying or duplicating a wrapped document edits no file
   contents, on the acting device or any other.
2. Everything the owner has tested and accepted keeps working: wrapping from
   the menu, following in-app rename, move and delete, explorer hiding,
   pairing a hand-made pair by adding the property.
3. Existing wrapped notes that link to their PDF keep working as pairs and can
   be converted with one click.

## Non-goals

- Recovering *where a PDF went* by following a link. There is no link any
  more; recovery is by name and folder. See "What gets weaker".
- Showing the PDF in the note when the plugin is not installed.
- Options inside the block (page, size). The block's content is reserved. An
  embed that carried a page or size (`![[X.pdf#page=3]]`) loses it on Convert.

## What gets weaker (accepted by the owner in choosing this option)

- Without the plugin, the note shows an empty code block instead of the PDF.
  The PDF is still beside the note under the same name.
- Obsidian no longer sees a link from the note to its PDF: the PDF is absent
  from the note's outgoing links and from the graph, and tools that clean up
  "unused attachments" may flag it. The README must say so.
- A property query can no longer follow the marker to the PDF. A formula on
  the note's own name (`<name>.pdf` in the same folder) does the same job.
- After changes made outside Obsidian the plugin can only say "this note's PDF
  is not beside it" and suggest candidates. The Misnamed, Displaced, Extra
  claim and Contested states go away.

## Definitions (replace those in the main spec)

**Marked note.** A note whose frontmatter has the marker property (name from
settings, default `wrapped-pdf`) with any value other than `false`, empty or
null. The plugin writes `true`. A link value (the earlier format) still counts as
marked. *(call)*

**Wrapped document (healthy pair).** A marked note and a PDF with the same
base name in the same folder. That is the whole rule; nothing in the note names
the PDF.

**PDF not found.** A marked note with no same-named PDF beside it.

**Links to its own PDF.** A marked note that still refers to its PDF by name
anywhere: a link-valued marker (the old format), an entry in any other
property such as `attachments`, or a link or embed in the body. Found from
Obsidian's own record of the note's links. Such a note works as a pair but
still has the problem this change removes, until converted. The owner decided
that the plugin lists these and removes the links on Convert.

The earlier advice that a template may list the PDF under `attachments` is
withdrawn: the `wrapped-pdf` flag says the same thing without a link.

**Unwrapped PDF.** A PDF with no marked note of its name beside it, and which
no marked note's link-valued marker points to. A link-valued marker still protects
its PDF until the note is converted: that PDF is not listed as Not wrapped, not
offered to other notes, and not wrapped automatically. *(call)*

**"Its note was deleted; the PDF was kept"**: unchanged.

**Templates are not documents.** The configured template file, and every note
inside the Templater template folder or the core Templates folder, is ignored
by pairing: never a marked note, never listed. (The new default template
carries `wrapped-pdf: true` and would otherwise be listed as "PDF not found"
at every launch.) *(call)*

## Behaviour changes

### Wrap

- The note gets `wrapped-pdf: true`.
- The default template becomes: frontmatter with the marker set to `true`, and
  the block.
- Template check and repair (by text insertion only, as now): the necessary
  parts are the marker line and the block. A template that has the old
  placeholder embed (`![[{{title}}.pdf]]` and the variants handled today) has
  that embed **replaced by the block**, and the user is told. *(call)*
- After the note is created it is converted exactly as Convert would (above):
  a link-valued marker becomes `true`, the PDF is taken out of other
  properties, embeds become the block and plain links become text. So a
  template the plugin could not repair, or one that lists the PDF under
  `attachments`, still yields a note with no link to its PDF. When this
  removes something the template put there, the user is told which property
  or line, so they can fix the template. *(call)*

### The block

- A fenced code block with the language `wrapped-pdf` *(call: fixed name, not
  tied to the marker setting)*.
- In reading view and live preview, on desktop and mobile, the plugin renders
  in its place an embed of the PDF beside the note. It works in any note, but
  shows the PDF only if one with the note's name is beside it; otherwise it
  shows "No PDF named <name>.pdf beside this note."
- It updates when the note or the PDF is renamed, moved, created or deleted.
- Rendering never edits a file.

### Following in-app changes

Same rules, simpler mechanics. No marker or embed is ever rewritten.

| Action inside Obsidian | Response |
|---|---|
| Rename or move the note of a healthy pair | Rename/move the PDF to match. |
| Rename or move the PDF of a healthy pair | Rename/move the note to match. |
| Delete the note of a healthy pair | Delete the PDF the same way, unless another note links to or embeds it (existing rule). The "another note claims it" guard goes away: there are no claims. |
| Copy the note (Obsidian's own copy action) | Copy the PDF under the copy's name. |
| Duplicate wrapped document (plugin command) | Copy both; nothing else. |

"Healthy before the action" is decided from the old path: the note was marked
and a PDF with its old name was beside it.

**Copy, in detail** *(call)*. A copied note carries the marker but has no PDF.
The plugin copies the PDF when it can tell which document was copied:

- If Obsidian's copy goes through `Vault.copy`, the wrapper sees the source
  note; if that source is the note of a healthy pair, its PDF is copied at
  once.
- Otherwise (the copy was made some other in-app way), once the new note is
  indexed: if it is marked, has no PDF, and exactly one healthy pair's note in
  the same folder has identical text, that pair's PDF is copied.
- If neither applies, the copy is listed as "PDF not found".

As today, this needs the copy to be recognised as made inside Obsidian and is
governed by "Rename and move the PDF with its note".

### Outside changes, the list and fixes

A scan still never changes files.

| Entry | Fixes offered |
|---|---|
| PDF not found | **Use a PDF**: pick from unwrapped PDFs (same folder first, then same name elsewhere); it is moved and renamed to the note's name. **Rename note to match**: for an unwrapped PDF in the same folder, the note takes the PDF's name instead. **Copy another document's PDF**: pick a wrapped document; its PDF is copied under this note's name. **Remove the marker.** |
| Links to its own PDF | **Convert**, which does all of the following to that one note, after saying what it will do: (1) if the marker is a link to a PDF that is not beside the note under its name, that PDF is first moved and renamed there (refused, with a notice, if the name is taken or another note's marker points to the same PDF); (2) the marker becomes `true`; (3) the PDF is taken out of every other property: removed from a list, leaving the other entries; a property holding only that link is emptied; (4) in the body, each embed of the PDF becomes the block, and each plain link to it becomes its display text. If the marker's PDF does not exist, the note is converted and then shows as PDF not found. *(calls: the details of 3 and 4)* |
| Its note was deleted; the PDF was kept | Unchanged. |
| Not wrapped | Unchanged. |

"Fix all" becomes "Convert all" *(call)*. It covers only "Links to its own PDF" entries
whose PDF is already beside the note under its name, so the bulk action never
moves a file. There is no bulk fix for PDF not found: every such entry needs a
choice.

### Automatic wrapping

Unchanged, with one added guard *(call)*: a PDF that arrives from outside is
**not** wrapped automatically while there is a marked note whose PDF is not
found and which is either in the same folder as the arriving PDF (a rename in
transit) or has the same base name anywhere in the vault (a move in transit).
That is what a pair looks like on a second device while its rename or move is
still arriving, PDF first and note later; wrapping it would create the very
duplicate note this change exists to prevent.

A PDF held back by the guard is not retried automatically. It stays listed as
Not wrapped; if the note then arrives the pair is simply healthy, and if it
was a false alarm the owner wraps it from the list.

### Explorer hiding, settings

Unchanged. Hiding still keys on healthy pairs. No new setting.

## What is removed

- The link-valued marker and its canonical form; writing or rewriting the
  marker after a rename, copy or fix.
- Rewriting embeds after a rename, copy or fix (the text transform is kept
  only for wrap and for Convert).
- The states Misnamed, Displaced, Extra claim, Contested and their fixes.
- The Watcher's special case that re-ran a `create` when the metadata cache
  caught up, if the copy rule above makes it unnecessary; the builder decides.

## Risks and what stays unverified

- **The block renders an embed through Obsidian's renderer.** Believed to work
  in both views and on mobile; not run here.
- **Other notes that link to the PDF are still edited by Obsidian on every
  device when the PDF is renamed.** Those notes are not being renamed at the
  same moment, and each device writes the same text, so this is ordinary
  Obsidian behaviour and not expected to duplicate anything; unverified.
- **The rename itself still arrives as two events on another device.** With
  nothing to edit, the worst case is a brief "PDF not found" entry that clears.
  The automatic-wrapping guard covers the one case that could act on it.
- **Copy detection** depends on how Obsidian's own copy action creates the
  file; both routes above are unverified.
- Everything in the main spec's risk list about detecting in-app changes
  still applies.

## Migration

- Notes wrapped by test builds so far link to their own PDF: they keep
  working and are listed with Convert / Convert all.
- The owner's real documents are not wrapped yet; their one-time migration
  writes the new form directly: move each PDF beside its note under the
  note's name, set the marker to `true`, take the PDF out of `attachments`,
  replace the PDF embed with the block. A migration that only moves the PDFs
  and adds the marker also works: the notes are then listed and Convert all
  does the rest.

## Left to the builder

- How the block re-renders when files change.
- Module changes in the pure core (classification, reactions, fixes); the
  existing split between `src/core` and `src/obsidian` stays.
- Whether detection of links to the note's own PDF reuses the existing claim,
  embed and link parsers or reads Obsidian's link records.
- Order of work, provided the pure core changes come first with their tests.
- Updating the main spec, README, CLAUDE.md and the manual checklist to match.
