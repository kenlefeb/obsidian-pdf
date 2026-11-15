# Manual test checklist

Run in a real Obsidian vault with the built `main.js`, `manifest.json` and `styles.css` copied into
`<Vault>/.obsidian/plugins/pdf-wrapper/`. Nothing below can be checked by the automated tests.

**This checklist must be run in an iCloud vault and in an Obsidian Sync vault, on desktop and on a phone, before
release.** Use a test vault (or a copy), never the real one. Open the developer console on desktop to see any
"PDF Wrapper:" messages.

Status: only the explorer-hiding mechanism has been run by the owner (300 and 3,000 rows, desktop, Obsidian 1.15.1;
not after a restart, not on a phone). Everything else below has not been run in Obsidian yet.

## Start here

The ten checks that matter most. Tick them in their own sections below.

1. Wrap a PDF (Wrap, first check).
2. Following a rename: rename a wrapped note, the PDF follows (Following in-app changes).
3. Following a delete: delete a wrapped note, the PDF goes the same way (Following in-app changes).
4. An outside delete protects the PDF: delete a wrapped note in Finder with Obsidian open, the PDF stays and is listed (Outside changes and Needs attention).
5. A Needs attention fix: rename a note in Finder, then fix it from the list (Outside changes and Needs attention).
6. Automatic wrap: drop a PDF in with the switch on (Automatic wrapping).
7. Duplicate a wrapped document (Duplicate).
8. Explorer hiding: wrapped documents show one row (File explorer).
9. Disabling the plugin restores the PDF rows (File explorer).
10. Two-device rename: rename on one device, the other does not repeat it and nothing is duplicated (Sync and several devices).

## Wrap

Run each item twice: once with Templater enabled, once with Templater disabled (core Templates only).

- [ ] Wrap a PDF from its file-explorer menu ("Wrap PDF"). The note opens.
- [ ] Open a PDF, then run "Wrap active PDF" from the command palette. The note opens.
- [ ] "Wrap active PDF" is not offered when the active file is not a PDF, or when the PDF already has a note beside it.
- [ ] The file-explorer menu of a PDF that already has a note beside it (a wrapped PDF, or one with an unmarked note of the same name) has no "Wrap PDF" item; a PDF without a note has it.
- [ ] The note `<name>.md` appears in the same folder as the PDF.
- [ ] The PDF did not move.
- [ ] The note's frontmatter has the marker property (default `wrapped-pdf`) set to `[[<vault path to pdf>|<pdf file name>]]`, also when the template has no frontmatter.
- [ ] A template containing `![[{{title}}.pdf]]` gives a note whose embed shows the PDF.
- [ ] The plugin did not add or change `attachment` / `attachments` in the note.
- [ ] Wrapping a PDF from the file menu renames, moves and deletes nothing else, shows no extra notice, and the new note is not reacted to a second time: it is not renamed or moved, and it is not listed as needing attention. (Assumes `vault.create` fires its `create` event before its promise resolves.)
- [ ] Wrapping `a|b.pdf` (or any name containing `[ ] | # ^`) is refused with a notice saying why.
- [ ] Wrapping a PDF whose note already exists is refused with a notice naming the note.
- [ ] Wrapping a PDF whose note exists under a different letter case (for example `s.md` beside `S.pdf`, on macOS or Windows) is refused with a notice naming `s.md`.
- [ ] Refusal notices read as one sentence (no "Failed to wrap X: Cannot wrap X").
- [ ] Start a wrap from the file menu and immediately run "Wrap active PDF" on the same PDF: the second is refused with "<name> is already being wrapped." and only one note is created.
- [ ] Wrap `Templates/Wrapped PDF.pdf` with no template set: the default template `Templates/Wrapped PDF.md` is created, then the wrap is refused with "Cannot wrap Wrapped PDF.pdf: its note would be the template file Templates/Wrapped PDF.md."
- [ ] A note whose frontmatter mentions `![[<name>.pdf]]` in another property keeps that value unchanged; only body embeds are rewritten.
- [ ] With Templater, a template that renames its own note (`tp.file.rename`) or moves it (`tp.file.move`): the note ends beside the PDF and is marked, the pair is intact (marker canonical) and nothing is renamed a second time. If the rename back fails (for example, the moved note's original path was taken meanwhile), the notice starts "Failed to wrap <pdf name>: Created <where the note is> but could not mark it". Confirms that `fileManager.renameFile` onto an existing path throws rather than overwrites.
- [ ] With Templater, a template whose code throws (for example `<% tp.user.missing() %>`): note what happens. Templater may show its own error. If Templater left the note behind, the plugin uses that note and marks it (the console shows "PDF Wrapper: Templater failed after creating the note"); otherwise it creates the note without Templater. Either way there is no "already exists" error. Record which happened and whether the note content is acceptable.
- [ ] Failure after the note exists: with Templater, use a template whose frontmatter has `title: <% tp.file.title %>` (unquoted), and wrap a PDF named `@Report 2024.pdf`. The note's frontmatter becomes `title: @Report 2024`, which is not valid YAML (`@` may not start an unquoted value), so setting the marker fails. The notice says `Failed to wrap @Report 2024.pdf: Created @Report 2024.md but could not mark it as wrapping @Report 2024.pdf: <reason>. Delete the note and wrap again, or add the "wrapped-pdf" property to it by hand.`, the note is still there without the marker, and after deleting it a second wrap (with a fixed template, for example `title: "<% tp.file.title %>"`) works. If the marker is set anyway, Obsidian's frontmatter parser accepted the value: record that and the name used.
- [ ] With Templater, if `create_new_note_from_template` returns no note and none is beside the PDF (a template that moves its own note elsewhere; may not be reproducible, skip if you cannot): the notice reads `Failed to wrap <pdf name>: Templater created the note somewhere else and it could not be found. Look for a new note, move it beside <pdf name>, and add the "wrapped-pdf" property — or change the template so it does not rename or move its note.`, and no second note is created beside the PDF.
- [ ] If opening the new note fails (hard to force; skip if you cannot), the notice reads "Wrapped <pdf> as <note>, but could not open the note: …" with no "Failed to wrap" prefix, and the PDF counts as wrapped.
- [ ] If the embed rewrite fails after the marker is written (hard to force; skip if you cannot), the notice reads "Created and marked <note>, but could not update its PDF embed: …" with no "Failed to wrap" prefix, and the note carries the marker.

## Templates (no prerequisites)

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
- [ ] Marker property setting: with automatic wrapping on, type a new name slowly (for example `pdf-doc`) and drop a PDF in while typing. Nothing is saved until you leave the field (click elsewhere, or close the settings): the template gains no partial name such as `pd:`, and the new note is marked with the old name. After you leave the field, the list refreshes at once (notes with the old name are no longer recognised). Empty the field and leave it: it shows `wrapped-pdf` again and that name is used.

## Following in-app changes

Do these with both "Delete the PDF when its note is deleted in Obsidian" and "Rename and move the PDF with its
note" on (the defaults), on desktop and on a phone.

- [ ] Rename a wrapped note in the file explorer: the PDF is renamed to match, the note's embed still shows the PDF, and the marker property reads `[[<new pdf path>|<new pdf name>]]`.
- [ ] Move a wrapped note to another folder (drag in the explorer, and with "Move file to…"): the PDF moves beside it; embed and marker as above.
- [ ] Rename a PDF from its tab (the title in the view header), and (separately) from the explorer, where other notes link to that PDF: the note follows, its body and frontmatter are intact (nothing duplicated, cut off or reverted), its marker reads `[[<new pdf path>|<new pdf name>]]`, and the other notes now link to the new PDF name.
- [ ] Move a PDF to another folder: the note follows.
- [ ] Rename a wrapped note, then rename it back by hand: the PDF follows both times.
- [ ] Rename a wrapped note twice in quick succession (rename, then immediately rename again): the pair ends up matched under the second name, no notice.
- [ ] Rename a note onto a name whose PDF already exists in that folder (for example rename `A.md` to `B.md` where `B.pdf` exists but `B.md` does not): a notice says the PDF could not be renamed because a file with that name already exists, `B.pdf` is unchanged, and `A.pdf` is still there.
- [ ] Same, where the existing name differs only in letter case (`b.pdf` exists, rename `A.md` to `B.md`), on macOS or Windows: notice, nothing overwritten.
- [ ] Case-only rename of a wrapped note (`report.md` to `Report.md`) on macOS or Windows: the PDF becomes `Report.pdf`, no notice, nothing lost.
- [ ] Move a folder holding several pairs (drag it into another folder), and rename a folder holding pairs: no error notice, both files of every pair end up together, every embed still renders, every marker points at the new path, and nothing lands in the trash. If Obsidian has already updated a marker to the new path, the plugin does not write that note again (with a sync service, each note shows one change, not two).
- [ ] Delete a wrapped note: the PDF is deleted the same way (check the system trash or the vault's `.trash` folder, per Settings → Files and links → Deleted files).
- [ ] Delete a wrapped note whose PDF another note also claims: the PDF stays.
- [ ] Merge a wrapped note `A.md` into another note `B.md` with the core Note composer ("Merge entire file with…"): `B.md` now embeds `A.pdf`, `A.md` is deleted, `A.pdf` stays, a notice says "Kept A.pdf: other notes still link to it.", B's embed still shows the PDF, and `A.pdf` is listed with "Its note was deleted; the PDF was kept". Repeat with a plain note that embeds `![[A.pdf]]` (or links `[[A.pdf]]`) and deleting the wrapped note `A.md` from the explorer: same result.
- [ ] Delete a wrapped note whose PDF no other note links to: the PDF is still deleted as before (the link check does not keep every PDF).
- [ ] Delete a folder holding several pairs: no "Could not delete" or other error notice, every pair is gone together, and nothing from it lands in the trash outside that folder (the trash holds the folder, not loose files).
- [ ] Delete only the PDF of a pair: the note stays.
- [ ] Turn "Delete the PDF when its note is deleted in Obsidian" off, delete a wrapped note in Obsidian: the PDF stays and is listed with "Its note was deleted; the PDF was kept".
- [ ] Turn "Rename and move the PDF with its note" off, rename a wrapped note in Obsidian: the PDF is not renamed.
- [ ] Unwrap a document by deleting its `wrapped-pdf` property in the properties panel (no rename, create or delete): within a couple of seconds the PDF's row reappears in the file explorer and the note loses its "PDF" marker. Add the property back (or undo): the row is hidden again within a couple of seconds. Typing in the body of a wrapped note causes no visible refresh or flicker.

### Assumptions about Obsidian the code relies on (unverified; confirm each)

The plugin's event handling was built without a running Obsidian. Each line is a behaviour the code assumes;
report any that does not hold. (The spike log that once helped here has been removed from the plugin; the outcomes
in the checks above are the evidence.)

- [ ] The plugin's wrapper is in place: with the plugin enabled, paste `app.fileManager.renameFile.toString()` into the developer console. It should print monkey-around's short wrapper function, containing `current.apply(this, args)`, not Obsidian's own long implementation of the rename. Also `Object.prototype.hasOwnProperty.call(app.fileManager, "renameFile")` should print `true`. If either is not so, Obsidian's UI may not go through the wrapped method, and the plugin may react before Obsidian has finished updating links.
- [ ] Obsidian's own rename from the explorer and from a tab's title goes through `app.fileManager.renameFile` (the plugin waits for that call to finish before following, so links are rewritten first).
- [ ] A rename or move in the explorer fires `vault` `rename` with the new file and the old path, and goes through `Vault.rename`, and a delete goes through `Vault.trash` or `Vault.delete`, so each is recognised as local: the in-app checks above follow, and the Finder checks below do not.
- [ ] When `vault` `rename` fires for a note, `metadataCache` already has that note's frontmatter under the new path (a followed rename works on the first try, not only after a recheck).
- [ ] After renaming a PDF in Obsidian, the note's claim either still names the old path or already names the new one when the plugin looks; both are handled. Confirm the marker ends up canonical and is not rewritten a second time by Obsidian's link updater into a different form.
- [ ] A folder rename or move fires one `rename` per file inside it, and by the time the plugin handles the first, Obsidian's file list already shows every file at its new path (otherwise the plugin may try to rename a partner that has already moved; it then stops quietly).
- [ ] `fileManager.renameFile` onto an existing path throws rather than overwrites (the plugin checks first, so this only matters if the check races).
- [ ] A case-only rename through `fileManager.renameFile` works on macOS and Windows, and `vault.getAbstractFileByPath` returns either nothing or the file itself for the new spelling.
- [ ] `fileManager.trashFile` fires `vault` `delete` for the PDF (synchronously or not); the plugin then ignores it as its own change.
- [ ] `metadataCache` `changed` fires after a property is deleted in the properties panel, and after sync delivers a modified note (the unwrap check above and its second-device version below depend on it).
- [ ] Note composer's merge deletes the merged note through `Vault.trash` or `Vault.delete` (so it reads as local), and by the time the plugin handles that delete, `metadataCache.resolvedLinks` already lists the new embed in the target note. If the cache lags, the PDF would be deleted: report it.
- [ ] Whether `metadataCache.resolvedLinks` includes links held in another note's frontmatter properties (for example `attachments: "[[A.pdf]]"`), or only body links: delete a wrapped note whose PDF only another note's property links to, and record whether the PDF was kept.
- [ ] Deleting a note fires `metadataCache` `deleted` with the note's previous cache (including frontmatter), and `metadataCache.getFirstLinkpathDest(<claim>, <deleted note path>)` still resolves the claimed PDF at that moment.
- [ ] `metadataCache` `deleted` fires for notes only (not for PDFs), so each deletion is handled once.
- [ ] Deleting a folder: by the time the plugin handles the note's deletion, the PDF is already gone from Obsidian's file list (no "Could not delete" notice).
- [ ] The plugin's own rename of a partner fires `vault` `rename` within 5 seconds, so it is recognised as the plugin's own and not followed back.
- [ ] With Settings → Files and links → "Automatically update internal links" off, rename a wrapped PDF in Obsidian: answer the "Update links?" dialog, then confirm the note follows and its content is intact. Repeat, leaving the dialog open for more than ten seconds before answering, and record what happens (the plugin stops waiting after ten seconds, logs a "PDF Wrapper:" warning in the console, and reacts anyway).

## Outside changes and Needs attention

Changes made in Finder (or Explorer), by another app, or while Obsidian was closed are never acted on; they are
listed. The startup check runs about two seconds after the vault loads, and again two seconds later before its
notice appears. "Check wrapped documents" runs it on demand and opens the list; "Show documents needing
attention" opens the list as last checked.

- [ ] Delete a wrapped note in Finder (or Explorer) with Obsidian open: the PDF stays, and within a few seconds it is listed with "Its note was deleted; the PDF was kept". Restart Obsidian: the entry is still there. On three such entries, check each fix: "Keep as a plain PDF" removes the entry and changes no file; "Wrap" wraps it again; "Delete the PDF" first asks for confirmation naming the PDF, then deletes it as the "Deleted files" setting says.
- [ ] Delete a wrapped note in Finder, then delete its PDF in Finder too: the "Its note was deleted; the PDF was kept" entry disappears by itself (run "Check wrapped documents" if the list is not open).
- [ ] Delete a wrapped note in Finder with Obsidian open, wait for its "Its note was deleted; the PDF was kept" entry, then copy the note back in Finder: on the next check the entry clears. Clicking "Delete the PDF" (and confirming) before it clears is refused with "A note named <note> now exists beside this PDF. Check the list again." and the PDF stays.
- [ ] Rename a wrapped note in Finder with Obsidian open: the PDF is not renamed, and the pair is listed.
- [ ] With Obsidian closed, rename a wrapped note in Finder. On launch a notice "1 document needs attention" appears; clicking it opens the list, where the note is listed with "PDF has a different name: <old name>.pdf". Nothing changed on disk before you click a fix. "Rename PDF to match" fixes it and the entry disappears.
- [ ] With Obsidian closed, move a wrapped note to another folder in Finder: listed with "PDF is in another folder: <folder>"; "Move PDF beside note" fixes it.
- [ ] "Make a copy" of a wrapped note in Finder: the copy is listed with "Points at another document's PDF", the original is not listed and is unchanged; "Copy the PDF" gives the copy its own PDF and the entry disappears.
- [ ] A note whose PDF is missing (delete the PDF in Finder): listed with "PDF not found. It may not have downloaded yet."; "Choose a PDF" lists candidate PDFs (unclaimed ones beside the note first) and pairing with one works; with no candidates the button is disabled with the tooltip "No candidate PDFs found" (on desktop) and the row also shows "No candidate PDFs found" as a line.
- [ ] Leave the list open, change a listed document in Finder so its entry no longer applies (for example rename the note back), then click its fix: a notice says "This has changed since it was listed. Check the list again." and the list refreshes. Nothing else changes.
- [ ] With several misnamed or displaced entries, one of which cannot be fixed (for example make its destination folder read-only, or lock the PDF in another app on Windows): "Fix all" fixes the others up to that one, shows the failure notice, then "Stopped after fixing <n> documents." and lists what is left.
- [ ] "Fix all" with nothing blocking: "Fixed <n> documents." and every misnamed or displaced entry with a single claimant is gone. "Fix all" appears only when such an entry is listed, and "Wrap all" only when a "Not wrapped" entry is listed.
- [ ] With nothing broken, the list says "Everything is in order." and no startup notice appears.
- [ ] Run "Show documents needing attention" straight after launch, before the startup check has run: the list says "Checking…" and then fills in.
- [ ] If that first check fails (hard to force; skip if you cannot), the list says "Could not check wrapped documents. Close this and try again." instead of staying on "Checking…".
- [ ] On a phone: the list opens from the command palette, long names wrap instead of overflowing, every button is easy to tap (at least 44px tall), and each fix works.
- [ ] Open the list, then disable PDF Wrapper in Settings → Community plugins: the list closes (and so does an open "Delete the PDF?" confirmation or PDF chooser). Repeat, clicking a fix (or confirming "Delete the PDF") just before disabling: no file changes after the plugin is disabled.

## Automatic wrapping

The switch is Settings → PDF Wrapper → "Wrap new PDFs automatically". It is stored on the device, not synced.

- [ ] Toggle on; drop a PDF into the file explorer: it is wrapped in about 2 seconds, a notice "Wrapped <name>" appears and the new note is not opened. Time it. (Unverified: that Obsidian's own drag and drop goes through `Vault.create`, `createBinary` or `copy`, which is what makes it count as local. If it takes 15-30 s, it does not.)
- [ ] Save a PDF into the vault folder from Finder while Obsidian is running: it is wrapped in 15-30 seconds. Time it, three times; the delay varies.
- [ ] Download a PDF from a browser straight into the vault folder: it is wrapped once the download finishes and the file gets its final name (15-30 s later), not while it is still a temporary name.
- [ ] Paste a PDF into another note with a specific "Default location for new attachments" folder set: the PDF lands in that folder and is not wrapped.
- [ ] Drop 20 PDFs at once (a folder dragged in): each gets exactly one note, no PDF is skipped, and no note is created twice. Note how long the last one took. The notices are one "Wrapped 20 PDFs." at the end of the pass (not 20), and with 1 to 3 PDFs one "Wrapped <name>" each.
- [ ] With the template path empty or pointing at a missing file, drop several PDFs: they are still wrapped (the template is created), with no failure notice.
- [ ] Make wrapping fail for every PDF (for example a read-only folder), then drop 5 PDFs: one notice "Could not wrap 5 PDFs. First problem: ... The rest are listed under documents needing attention."; with a single PDF, its own message once. The PDFs are listed as "Not wrapped".
- [ ] Wrap with a template that makes the embed update fail (so the wrap is incomplete): the PDF is wrapped, one notice with the problem, and no "Wrapped <name>" for it.
- [ ] Toggle off during the settle period (within two seconds of dropping a PDF): the PDF is not wrapped.
- [ ] Disable the plugin within two seconds of dropping a PDF: nothing is wrapped afterwards.
- [ ] Enable the plugin and disable it again at once, before Obsidian's layout has finished loading (for example at startup; skip if you cannot time it): no "PDF Wrapper:" errors in the console, no startup notice, and no rows hidden.
- [ ] Leave a Templater prompt open during an automatic wrap: after 60 seconds the console shows a "PDF Wrapper:" warning; the wrap is not abandoned and later PDFs wait.
- [ ] A PDF added while Obsidian was closed appears as "Not wrapped" in the list with "Wrap all", and is not wrapped on its own at startup.
- [ ] Wrap all while automatic wrapping runs: copy 10 PDFs into the vault folder from Finder, open the list within a few seconds (they are listed as "Not wrapped"), and click "Wrap all" while the automatic wraps start (15 to 30 s after arrival). No "is already being wrapped" or "a note already exists" notice appears, the run does not stop, every PDF ends with exactly one note, and the final notice counts only the PDFs "Wrap all" wrapped.
- [ ] A PDF with an unmarked note of the same name beside it (create `X.md` without the marker, then add `X.pdf`) is not listed as "Not wrapped", is not wrapped automatically, and does not make "Wrap all" stop.
- [ ] Click "Wrap PDF" on a PDF just as automatic wrapping wraps it (or the reverse): one note results, and automatic wrapping shows no failure notice for it (the click may say "<name> is already being wrapped.").
- [ ] Make automatic wrapping stop on an unexpected error (hard to force; skip if you cannot): the notice ends "PDFs that are not wrapped are listed under documents needing attention."
- [ ] Toggle off: no "Not wrapped" entries are listed, and the list refreshes straight away when the switch is flipped.
- [ ] The toggle state differs per device: turn it on here, check another device still has it off.

## Duplicate

"Duplicate wrapped document" (file menu on a note, and the command palette).

- [ ] Duplicate a wrapped document `S`: `S 1.md` and `S 1.pdf` appear beside it and `S 1.md` opens. The copy's marker and embed point at `S 1.pdf`, the original note and PDF are unchanged, nothing lands in Needs attention, and with automatic wrapping on the copied PDF is not wrapped a second time.
- [ ] Duplicate `S` again: `S 2.md` and `S 2.pdf` appear (the first copy is `S 1`).
- [ ] With `S 1.md` present but no `S 1.pdf`, duplicate `S`: both copies are named `S 2`.
- [ ] The menu item and command are absent for a note without the marker, with a missing PDF, or with a PDF elsewhere or under another name (the command is not listed in the palette; the file menu has no item).
- [ ] Trigger the command twice quickly: only one copy pair is made.

## File explorer

Wrapped documents show as one row: the PDF row of every healthy pair is hidden and the note's row gets a "PDF"
marker, using generated styling rules only. Setting: "Hide paired PDF files in the file explorer" (on by default).
The mechanism was verified by the owner (300 and 3,000 rows, desktop, Obsidian 1.15.1); the styling in this build
has not been run in Obsidian yet.

- [ ] Wrapped documents show one row (the note) with the "PDF" marker after its name; the PDF row is hidden.
- [ ] PDFs without a note still show, and notes without the marker property show no "PDF" marker.
- [ ] Toggling "Hide paired PDF files in the file explorer" off and on shows and hides the PDF rows at once (the marker stays either way).
- [ ] Rename, move, delete and duplicate a wrapped document: the right rows stay hidden, and no stray PDF row appears or stays hidden.
- [ ] Break a pair (for example delete the note outside Obsidian or point the marker at a missing PDF): the PDF becomes visible after the next check.
- [ ] Wrap 20 PDFs in a row (or drop 20 with automatic wrapping on): every PDF row ends hidden without toggling anything.
- [ ] Restart Obsidian: rows are hidden once the first scan has finished (a second or two after the layout appears).
- [ ] Disable the plugin: every row reappears at once. Enable it again: rows are hidden again.
- [ ] Same checks on a phone.

## Sync and several devices

Run with the plugin enabled on two devices (including a phone) sharing the vault, once with iCloud and once with
Obsidian Sync, both "follow" settings on.

- [ ] Rename a wrapped note on device A. Device B receives the renamed note and PDF through sync and does not rename, move or delete anything itself: after sync settles there is exactly one note and one PDF, no duplicate or conflicting files, and the pair is healthy on both devices (or, if it arrives piecemeal, briefly listed and then clear after the check). Repeat renaming the PDF on A, and moving the note to another folder.
- [ ] Delete a wrapped note on device A: the PDF is gone on both devices once, and device B does not report an error or trash anything it did not need to. Device B never deletes a PDF because of a note that arrived or vanished by sync.
- [ ] Obsidian Sync and iCloud apply remote renames and deletes without going through `Vault.rename`, `Vault.trash` or `Vault.delete` (otherwise a receiving device would act on them; the two follow settings are the remedy). Record, per sync service, whether device B ever acted on a remote change.
- [ ] With two devices both on, add a PDF on one: exactly one note results, on both devices. Record how long the second device waited before it wrapped. Expected: 15 to 30 seconds. A wait of about 2 seconds means sync delivered the PDF through a path the plugin reads as in-app, so the cross-device margin is gone: report it. Also note whether it ever wrapped the PDF itself. Repeat with the PDF saved into iCloud from a third app so both see it from outside at the same moment; repeat 5 times and count duplicate notes.
- [ ] Two devices on and a PDF arriving on both: the later device does not show a failure notice for the note that already exists (it silently skips).
- [ ] On device A, unwrap a document by deleting its `wrapped-pdf` property in the properties panel; on device B, once sync has delivered the note, the PDF row reappears within a couple of seconds without a restart. Repeat with "Remove the claim" and with "Choose a PDF" run from the list on A.
- [ ] A PDF that iCloud has not downloaded yet is listed as missing with "It may not have downloaded yet.", nothing is deleted, and the entry clears once it downloads.

## After an Obsidian update

The three checks most likely to regress. Run them after every Obsidian update.

- [ ] Rows hidden: wrapped documents show one row and the PDF rows are hidden (File explorer, first check).
- [ ] In-app rename followed: rename a wrapped note and the PDF follows, with marker and embed intact (Following in-app changes, first check).
- [ ] In-app delete followed: delete a wrapped note and its PDF goes the same way (Following in-app changes, delete check).
