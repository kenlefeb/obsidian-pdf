# Manual test checklist

Run in a real Obsidian vault with the built `main.js`, `manifest.json` and `styles.css` copied into
`<Vault>/.obsidian/plugins/pdf-wrapper/`. Nothing below can be checked by the automated tests.

## Wrap

Run each item twice: once with Templater enabled, once with Templater disabled (core Templates only).

- [ ] Wrap a PDF from its file-explorer menu ("Wrap PDF"). The note opens.
- [ ] Open a PDF, then run "Wrap active PDF" from the command palette. The note opens.
- [ ] "Wrap active PDF" is not offered when the active file is not a PDF, or when the PDF already has a note beside it.
- [ ] The note `<name>.md` appears in the same folder as the PDF.
- [ ] The PDF did not move.
- [ ] The note's frontmatter has the marker property (default `wrapped-pdf`) set to `[[<vault path to pdf>|<pdf file name>]]`, also when the template has no frontmatter.
- [ ] A template containing `![[{{title}}.pdf]]` gives a note whose embed shows the PDF.
- [ ] Wrapping `a|b.pdf` (or any name containing `[ ] | # ^`) is refused with a notice saying why.
- [ ] Wrapping a PDF whose note already exists is refused with a notice naming the note.
- [ ] The plugin did not add or change `attachment` / `attachments` in the note.
- [ ] With Templater: a template that renames or moves its own note still ends with the note beside the PDF.
- [ ] Wrapping a PDF whose note exists under a different letter case (for example `s.md` beside `S.pdf`, on macOS or Windows) is refused with a notice naming `s.md`.
- [ ] Refusal notices read as one sentence (no "Failed to wrap X: Cannot wrap X").
- [ ] Start a wrap from the file menu and immediately run "Wrap active PDF" on the same PDF: the second is refused with "<name> is already being wrapped." and only one note is created.
- [ ] Failure after the note exists: with Templater, use a template whose frontmatter has `title: <% tp.file.title %>` (unquoted), and wrap a PDF named `Report: 2024.pdf`. The notice says `Failed to wrap Report: 2024.pdf: Created Report: 2024.md but could not mark it as wrapping Report: 2024.pdf: <reason>. Delete the note and wrap again, or add the "wrapped-pdf" property to it by hand.`, the note is still there without the marker, and after deleting it a second wrap (with a fixed template) works.
- [ ] With Templater, a template that renames its own note (`tp.file.rename`) or moves it (`tp.file.move`): the note ends beside the PDF and is marked. If the rename back fails (for example, the moved note's original path was taken meanwhile), the notice starts "Created <where the note is> but could not mark it". Confirms that `fileManager.renameFile` onto an existing path throws rather than overwrites.
- [ ] With Templater, a template whose code throws (for example `<% tp.user.missing() %>`): note what happens. Templater may show its own error. If Templater left the note behind, the plugin uses that note and marks it (the console shows "PDF Wrapper: Templater failed after creating the note"); otherwise it creates the note without Templater. Either way there is no "already exists" error. Record which happened and whether the note content is acceptable.
- [ ] Wrap `Templates/Wrapped PDF.pdf` with no template set: the default template `Templates/Wrapped PDF.md` is created, then the wrap is refused with "Cannot wrap Wrapped PDF.pdf: its note would be the template file Templates/Wrapped PDF.md."

## No prerequisites

- [ ] Fresh install, no template set, no Templater or core Templates folder: wrapping creates `Templates/Wrapped PDF.md`, a notice names it, the template setting shows `Templates/Wrapped PDF`, and the new note shows the PDF.
- [ ] Same, with a Templater template folder set: the default appears in that folder.
- [ ] Same, with no Templater folder but a core Templates folder set: the default appears in that folder.
- [ ] No template set, but a file already exists at the default path: it is used, not overwritten, and the setting is filled.
- [ ] Template setting pointing at a deleted file: a default appears at that path, a notice says so, and the setting is unchanged.
- [ ] A template with no frontmatter and no embed gains both, and a notice says what was added (the marker name in double quotes).
- [ ] A Templater template with `<% %>` expressions in its frontmatter but no marker gains only the marker line; everything else in the file is unchanged byte for byte.
- [ ] Wrapping again with the repaired template adds nothing, shows no "Updated the template" notice, and does not change the template's modified time.
- [ ] A folder named like the template path (for example a folder `Templates/Wrapped PDF.md`) makes the wrap fail with a notice naming that path.
- [ ] If saving settings fails after the default is created (hard to force; skip if you cannot), the notice says "Created a default template at <path>, but could not save it as the template setting: …".
- [ ] A note whose frontmatter mentions `![[<name>.pdf]]` in another property keeps that value unchanged; only body embeds are rewritten.
- [ ] If opening the new note fails (hard to force; skip if you cannot), the notice reads "Wrapped <pdf> as <note>, but could not open the note: …" with no "Failed to wrap" prefix, and the PDF counts as wrapped.
- [ ] If the embed rewrite fails after the marker is written (hard to force; skip if you cannot), the notice reads "Created and marked <note>, but could not update its PDF embed: …" with no "Failed to wrap" prefix, and the note carries the marker.

## Following in-app changes

Do these with both "Delete the PDF when its note is deleted in Obsidian" and "Rename and move the PDF with its
note" on (the defaults), on desktop and on a phone. Open the developer console (desktop) to see any
"PDF Wrapper:" errors.

- [ ] Rename a wrapped note in the file explorer: the PDF is renamed to match, the note's embed still shows the PDF, and the marker property reads `[[<new pdf path>|<new pdf name>]]`.
- [ ] Move a wrapped note to another folder (drag in the explorer, and with "Move file to…"): the PDF moves beside it; embed and marker as above.
- [ ] Drag a folder holding several pairs into another folder, and rename a folder holding pairs: both files of every pair end up together, every embed still renders, every marker points at the new path, and no notice appears.
- [ ] Rename a PDF from its tab (the title in the view header): the note is renamed to match; embed and marker as above.
- [ ] Move a PDF to another folder: the note follows.
- [ ] Delete a wrapped note: the PDF is deleted the same way (check the system trash or the vault's `.trash` folder, per Settings → Files and links → Deleted files).
- [ ] Delete a wrapped note whose PDF another note also claims: the PDF stays.
- [ ] Delete a folder holding pairs: everything goes, and no "Could not delete" notice appears.
- [ ] Delete only the PDF of a pair: the note stays.
- [ ] Rename a note onto a name whose PDF already exists in that folder (for example rename `A.md` to `B.md` where `B.pdf` exists but `B.md` does not): a notice says the PDF could not be renamed because a file with that name already exists, `B.pdf` is unchanged, and `A.pdf` is still there.
- [ ] Same, where the existing name differs only in letter case (`b.pdf` exists, rename `A.md` to `B.md`), on macOS or Windows: notice, nothing overwritten.
- [ ] Case-only rename of a wrapped note (`report.md` to `Report.md`) on macOS or Windows: the PDF becomes `Report.pdf`, no notice, nothing lost.
- [ ] Delete a wrapped note in Finder (or Explorer) with Obsidian open: the PDF stays.
- [ ] Rename a wrapped note in Finder with Obsidian open: the PDF is not renamed.
- [ ] Turn "Delete the PDF when its note is deleted in Obsidian" off, delete a wrapped note in Obsidian: the PDF stays.
- [ ] Turn "Rename and move the PDF with its note" off, rename a wrapped note in Obsidian: the PDF is not renamed.
- [ ] Rename a wrapped note, then rename it back by hand: the PDF follows both times.
- [ ] Rename a wrapped note twice in quick succession (rename, then immediately rename again): the pair ends up matched under the second name, no notice.
- [ ] With "Spike: toggle event log" on, rename a wrapped note: the PDF still follows (the spike log must not take the local-intent mark).
- [ ] "Spike: rename a test pair" still renames the note and its PDF with a "Renamed the pair" notice and no "Could not" notice.
- [ ] Wrap a PDF from the file menu: nothing else is renamed, moved or deleted, and no extra notice appears.

### Assumptions about Obsidian the code relies on (unverified; confirm each)

The plugin's event handling was built without a running Obsidian. Each line is a behaviour the code assumes;
report any that does not hold.

- [ ] A rename or move in the explorer fires `vault` `rename` with the new file and the old path, and goes through `Vault.rename` (so it is recognised as local). Check with the spike log: `local` is `true` for in-app renames, moves and deletes, and `false` for Finder changes.
- [ ] When `vault` `rename` fires for a note, `metadataCache` already has that note's frontmatter under the new path (a followed rename works on the first try, not only after a recheck).
- [ ] After renaming a PDF in Obsidian, the note's claim either still names the old path or already names the new one when the plugin looks; both are handled. Confirm the marker ends up canonical and is not rewritten a second time by Obsidian's link updater into a different form.
- [ ] A folder rename or move fires one `rename` per file inside it, and by the time the plugin handles the first, Obsidian's file list already shows every file at its new path (otherwise the plugin may try to rename a partner that has already moved; it then stops quietly).
- [ ] `fileManager.renameFile` onto an existing path throws rather than overwrites (the plugin checks first, so this only matters if the check races).
- [ ] A case-only rename through `fileManager.renameFile` works on macOS and Windows, and `vault.getAbstractFileByPath` returns either nothing or the file itself for the new spelling.
- [ ] `fileManager.trashFile` fires `vault` `delete` for the PDF (synchronously or not); the plugin then ignores it as its own change.
- [ ] Deleting a note fires `metadataCache` `deleted` with the note's previous cache (including frontmatter), and `metadataCache.getFirstLinkpathDest(<claim>, <deleted note path>)` still resolves the claimed PDF at that moment.
- [ ] `metadataCache` `deleted` fires for notes only (not for PDFs), so each deletion is handled once.
- [ ] Deleting a folder: by the time the plugin handles the note's deletion, the PDF is already gone from Obsidian's file list (no "Could not delete" notice).
- [ ] The plugin's own rename of a partner fires `vault` `rename` within 5 seconds, so it is recognised as the plugin's own and not followed back.
- [ ] Obsidian Sync and iCloud apply remote renames and deletes without going through `Vault.rename`, `Vault.trash` or `Vault.delete` (otherwise a receiving device would act on them; the two settings above are the remedy).
