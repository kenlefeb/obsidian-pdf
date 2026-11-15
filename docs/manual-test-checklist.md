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
- [ ] Rename a wrapped PDF from its tab, and (separately) from the explorer, where other notes link to that PDF: the note follows, its body and frontmatter are intact (nothing duplicated, cut off or reverted), its marker reads `[[<new pdf path>|<new pdf name>]]`, and the other notes now link to the new PDF name.
- [ ] Move a folder holding several pairs inside Obsidian: no error notice, every pair is intact (note and PDF together, markers point at the new paths), nothing lands in the trash.
- [ ] Delete a folder holding several pairs inside Obsidian: no error notice, every pair is gone together, and nothing from it lands in the trash outside that folder (the trash holds the folder, not loose files).

### Assumptions about Obsidian the code relies on (unverified; confirm each)

The plugin's event handling was built without a running Obsidian. Each line is a behaviour the code assumes;
report any that does not hold.

- [ ] The plugin's wrapper is in place: with the plugin enabled, paste `app.fileManager.renameFile.toString()` into the developer console. It should print monkey-around's short wrapper function, containing `current.apply(this, args)`, not Obsidian's own long implementation of the rename. Also `Object.prototype.hasOwnProperty.call(app.fileManager, "renameFile")` should print `true`. If either is not so, Obsidian's UI may not go through the wrapped method, and the plugin may react before Obsidian has finished updating links.
- [ ] Obsidian's own rename from the explorer and from a tab's title goes through `app.fileManager.renameFile` (the plugin waits for that call to finish before following, so links are rewritten first).
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
- [ ] `vault.create` fires its `create` event before its promise resolves (the plugin's mark on a new note is released once the wrap finishes). Check: wrap a PDF and confirm nothing odd happens to the new note: it is not renamed, moved or reacted to a second time, and it is not listed as needing attention.
- [ ] With Settings → Files and links → "Automatically update internal links" off, rename a wrapped PDF in Obsidian: answer the "Update links?" dialog, then confirm the note follows and its content is intact. Repeat, leaving the dialog open for more than ten seconds before answering, and record what happens (the plugin stops waiting after ten seconds, logs a "PDF Wrapper:" warning in the console, and reacts anyway).
- [ ] With Templater, wrap a PDF with a template that moves its own note (`tp.file.move`): afterwards the pair is intact (note beside the PDF, marker canonical) and nothing was renamed a second time.

## Needs attention

The startup check runs about two seconds after the vault loads, and again two seconds later before its notice
appears. "Check wrapped documents" runs it on demand and opens the list; "Show documents needing attention"
opens the list as last checked.

- [ ] With Obsidian closed, rename a wrapped note in Finder (or Explorer). On launch a notice "1 wrapped document needs attention" appears; clicking it opens the list, where the note is listed with "PDF has a different name: <old name>.pdf". Nothing changed on disk before you click a fix. "Rename PDF to match" fixes it and the entry disappears.
- [ ] With Obsidian closed, move a wrapped note to another folder in Finder: listed with "PDF is in another folder: <folder>"; "Move PDF beside note" fixes it.
- [ ] "Make a copy" of a wrapped note in Finder: the copy is listed with "Points at another document's PDF", the original is not listed and is unchanged; "Copy the PDF" gives the copy its own PDF and the entry disappears.
- [ ] Delete a wrapped note in Finder with Obsidian open: within a few seconds the PDF is listed with "Its note was removed outside Obsidian". Restart Obsidian: the entry is still there. On three such entries, check each fix: "Keep as a plain PDF" removes the entry and changes no file; "Wrap" wraps it again; "Delete the PDF" first asks for confirmation naming the PDF, then deletes it as the "Deleted files" setting says.
- [ ] Delete a wrapped note in Finder, then delete its PDF in Finder too: the "note removed" entry disappears by itself (run "Check wrapped documents" if the list is not open).
- [ ] A note whose PDF is missing (delete the PDF in Finder): listed with "PDF not found. It may not have downloaded yet."; "Choose a PDF" lists candidate PDFs (unclaimed ones beside the note first) and pairing with one works; with no candidates the button is disabled with the tooltip "No candidate PDFs found".
- [ ] Leave the list open, change a listed document in Finder so its entry no longer applies (for example rename the note back), then click its fix: a notice says "This has changed since it was listed. Check the list again." and the list refreshes. Nothing else changes.
- [ ] With several misnamed or displaced entries, one of which cannot be fixed (for example make its destination folder read-only, or lock the PDF in another app on Windows): "Fix all" fixes the others up to that one, shows the failure notice, then "Stopped after fixing <n> documents." and lists what is left.
- [ ] "Fix all" with nothing blocking: "Fixed <n> documents." and every misnamed or displaced entry with a single claimant is gone. Neither "Fix all" nor "Wrap all" appears when it would do nothing.
- [ ] With nothing broken, the list says "Everything is in order." and no startup notice appears.
- [ ] On a phone: the list opens from the command palette, long names wrap instead of overflowing, every button is easy to tap (at least 44px tall), and each fix works.
- [ ] Open the list, then disable PDF Wrapper in Settings → Community plugins: the list closes (and so does an open "Delete the PDF?" confirmation or PDF chooser). Repeat, clicking a fix (or confirming "Delete the PDF") just before disabling: no file changes after the plugin is disabled.
- [ ] Delete a wrapped note in Finder with Obsidian open, wait for its "note removed" entry, then copy the note back in Finder: on the next check the entry clears. Clicking "Delete the PDF" (and confirming) before it clears is refused with "A note named <note> now exists beside this PDF. Check the list again." and the PDF stays.
- [ ] Run "Show documents needing attention" straight after launch, before the startup check has run: the list says "Checking…" and then fills in.
- [ ] A Missing entry with no candidates shows "No candidate PDFs found" as a line in the row (as well as on the disabled button's tooltip on desktop).

## Automatic wrapping

The switch is Settings → PDF Wrapper → "Wrap new PDFs automatically". It is stored on the device, not synced.
None of this has been run in Obsidian yet.

- [ ] Toggle on; drop a PDF into the file explorer: it is wrapped in about 2 seconds, a notice "Wrapped <name>" appears and the new note is not opened. Time it. (Unverified: that Obsidian's own drag and drop goes through `Vault.create`, `createBinary` or `copy`, which is what makes it count as local. If it takes 15-30 s, it does not.)
- [ ] Save a PDF into the vault folder from Finder while Obsidian is running: it is wrapped in 15-30 seconds. Time it, three times; the delay varies.
- [ ] Download a PDF from a browser straight into the vault folder: it is wrapped once the download finishes and the file gets its final name (15-30 s later), not while it is still a temporary name.
- [ ] Paste a PDF into another note with a specific "Default location for new attachments" folder set: the PDF lands in that folder and is not wrapped.
- [ ] Drop 20 PDFs at once (a folder dragged in): each gets exactly one note, no PDF is skipped, and no note is created twice. Note how long the last one took. The notices are one "Wrapped 20 PDFs." at the end of the pass (not 20), and with 1 to 3 PDFs one "Wrapped <name>" each.
- [ ] With the template path empty or pointing at a missing file, drop several PDFs: they are still wrapped (the template is created), with no failure notice.
- [ ] Make wrapping fail for every PDF (for example a read-only folder), then drop 5 PDFs: one notice "Could not wrap 5 PDFs. First problem: ... The rest are listed under documents needing attention."; with a single PDF, its own message once. The PDFs are listed as Unwrapped.
- [ ] Wrap with a template that makes the embed update fail (so the wrap is incomplete): the PDF is wrapped, one notice with the problem, and no "Wrapped <name>" for it.
- [ ] Two devices on and a PDF arriving on both: the later device does not show a failure notice for the note that already exists (it silently skips).
- [ ] Toggle off during the settle period (within two seconds of dropping a PDF): the PDF is not wrapped.
- [ ] Disable the plugin within two seconds of dropping a PDF: nothing is wrapped afterwards.
- [ ] With two devices both on, add a PDF on one: exactly one note results, on both devices. Record how long the second device waited before it saw the note (and whether it ever wrapped the PDF itself). Repeat with the PDF saved into iCloud from a third app so both see it from outside at the same moment; repeat 5 times and count duplicate notes.
- [ ] The toggle state differs per device: turn it on here, check another device still has it off.
- [ ] A PDF added while Obsidian was closed appears as "Unwrapped" in the list with "Wrap all", and is not wrapped on its own at startup.
- [ ] Toggle off: no "Unwrapped" entries are listed, and the list refreshes straight away when the switch is flipped.

## Duplicate

"Duplicate wrapped document" (file menu on a note, and the command palette). None of this has been run in Obsidian yet.

- [ ] Duplicate a wrapped document `S`: `S 1.md` and `S 1.pdf` appear beside it and `S 1.md` opens. The copy's marker and embed point at `S 1.pdf`, the original note and PDF are unchanged, nothing lands in Needs attention, and with automatic wrapping on the copied PDF is not wrapped a second time.
- [ ] Duplicate `S` again: `S 2.md` and `S 2.pdf` appear (the first copy is `S 1`).
- [ ] With `S 1.md` present but no `S 1.pdf`, duplicate `S`: both copies are named `S 2`.
- [ ] The menu item and command are absent for a note without the marker, with a missing PDF, or with a PDF elsewhere or under another name (the command is not listed in the palette; the file menu has no item).
- [ ] Trigger the command twice quickly: only one copy pair is made.
- [ ] Leave a Templater prompt open during an automatic wrap: after 60 seconds the console shows a "PDF Wrapper:" warning; the wrap is not abandoned and later PDFs wait.
