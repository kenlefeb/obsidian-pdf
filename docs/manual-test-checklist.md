# Manual test checklist

Run in a real Obsidian vault with the built `main.js`, `manifest.json` and `styles.css` copied into
`<Vault>/.obsidian/plugins/pdf-wrapper/`. Nothing below can be checked by the automated tests.

**This checklist must be run in an iCloud vault and in an Obsidian Sync vault, on desktop and on a phone, before
release.** Use a test vault (or a copy), never the real one. Put the same build on every device first. Open the
developer console on desktop to see any "PDF Wrapper:" messages.

Status: nothing below has been run in Obsidian with this build. On an earlier build the owner ran the
explorer-hiding mechanism (300 and 3,000 rows, desktop, Obsidian 1.15.1; not after a restart, not on a phone), and
found that renaming a wrapped document on one device left two copies of the note on the other. This build changes
what a wrapped note looks like to stop that. The first three checks decide whether it worked.

What a wrapped note looks like now (the default template makes exactly this):

````markdown
---
wrapped-pdf: true
---

```wrapped-pdf
```
````

Nothing in the note names the PDF. The pair is the note and the PDF with the same name in the same folder.

## Start here: the three checks that decide whether this change worked

Do these before anything else. If check 1 or check 2 fails, stop and report; the rest does not matter until they
pass.

### 1. Rename a pair on one device; the other device ends with exactly one note and one PDF

This is the fault the change exists to cure. Run it in the iCloud vault first (where it was found), then in the
Obsidian Sync vault.

Setup:

1. Two devices on the same vault, both with this build enabled and both with Obsidian open. Call the one you rename
   on "A" (use the phone, as when the fault was found) and the other "B" (the Mac).
2. On both, leave "Rename and move the PDF with its note" on. Turn "Wrap new PDFs automatically" off on both for
   this check.
3. On A, put a PDF in the vault and wrap it ("Wrap PDF" in its file menu). Call it `Rename test.pdf`.
4. Wait until B shows `Rename test.md` (one row with a "PDF" marker). On B, open the note in source mode and confirm
   it reads `wrapped-pdf: true` and has the `wrapped-pdf` block, with no `[[Rename test.pdf]]` anywhere.

Steps:

- [ ] On A, rename the note in Obsidian's file explorer to `Renamed on A`. On A, the PDF becomes `Renamed on A.pdf`
      at once.
- [ ] Wait for sync to finish on B (give iCloud a few minutes). Then on B, look in the file explorer **and** in
      Finder at the folder.

Expect on B:

- [ ] Exactly one note, `Renamed on A.md`, and exactly one PDF, `Renamed on A.pdf`.
- [ ] No `Rename test.md`, no `Rename test.pdf`, no file with "conflict" or a number added to its name.
- [ ] The note's text is the same as before the rename (still `wrapped-pdf: true` and the block).
- [ ] The note opens and shows the PDF.
- [ ] "Check wrapped documents" on B says "Everything is in order." (While the two files were arriving, the note may
      have been listed as "PDF not found" for a moment; that is fine as long as it clears by itself.)

Failure looks like: two notes on B (one under each name), or a note left under the old name. Record exactly which
files exist and what each note contains.

Repeat:

- [ ] Three more renames in a row on A, waiting for B each time.
- [ ] Rename on B, check on A.
- [ ] Move the note to another folder on A (drag it), check on B: one note and one PDF, both in the new folder.
- [ ] Rename the **PDF** on A (turn "Hide paired PDF files in the file explorer" off to see its row), check on B.
- [ ] With the plugin **disabled on B** (the fault originally showed this way too): rename the note on A, wait, and
      check B in Finder. Expect one note and one PDF there as well.
- [ ] All of the above in the Obsidian Sync vault.

### 2. The block shows the PDF, in reading view and live preview, on desktop and on a phone

Setup: a wrapped document made by this build (the one from check 1 will do), holding a PDF of several pages.

On desktop:

- [ ] Open the note in **reading view**. Where the block is, the PDF is shown, in Obsidian's usual PDF viewer. You
      can scroll through its pages.
- [ ] Switch to **live preview** (editing view, not source mode). The PDF is shown in place of the block. Clicking
      into the block shows its two lines of code; clicking out shows the PDF again.
- [ ] In **source mode** the block is plain text (` ```wrapped-pdf `). That is expected.
- [ ] The viewer is tall enough to read a page. Record what it looks like (height, toolbar), and whether it differs
      from an ordinary `![[file.pdf]]` embed in another note.
- [ ] No "PDF Wrapper:" warning in the console. (A warning that "Obsidian's PDF embed is not available" or "failed"
      means the block fell back to its second way of drawing; report it, and whether the PDF still showed.)

On the phone:

- [ ] The same note in reading view shows the PDF.
- [ ] The same note in live preview shows the PDF.

The block keeps up with the files (desktop is enough, phone if you have time):

- [ ] With the note open, rename the note in Obsidian. The PDF follows, and the block still shows it.
- [ ] With the note open, rename the PDF in Finder to something else. Within a moment the block reads
      `No PDF named <note name>.pdf beside this note.` Rename it back in Finder: the PDF shows again.
- [ ] Type the block into a note that has no PDF beside it: it reads `No PDF named <that note's name>.pdf beside
      this note.`
- [ ] Typing in the note's text does not make the PDF flicker or reload.
- [ ] Disable the plugin: the note shows an empty code block instead of the PDF. Enable it again: the PDF is back
      (reopen the note if needed).

### 3. Convert a test-build note that links to its PDF

Notes wrapped by the earlier test builds look like this, and are what Convert is for:

```markdown
---
wrapped-pdf: "[[Folder/Old style.pdf|Old style.pdf]]"
---

![[Folder/Old style.pdf]]
```

Setup: use a note the test build wrapped, with its PDF beside it under the same name. If you have none left, make
one by hand: put `Old style.pdf` in a folder, create `Old style.md` beside it, and paste the text above (with your
folder's name) in source mode. Add a line of your own text under the embed, and a second property (for example
`tags: [test]`), so you can see they survive.

Steps and what to expect:

- [ ] Run "Check wrapped documents". The note is listed with "Links to its own PDF" and one button, **Convert**.
      "Convert all" is shown at the top.
- [ ] The document still behaves as a pair meanwhile: one row in the file explorer, with the "PDF" marker.
- [ ] Click **Convert**. A box titled "Convert this note?" says: `Convert Old style.md: the marker property is set
      to true, links to the PDF are removed from its other properties, each embed of the PDF in the text becomes the
      wrapped-pdf block (a page or size set on the embed is lost), and each link to it becomes plain text.` It does
      **not** say that any file is moved. Click Cancel: nothing changes.
- [ ] Click **Convert** again and confirm. The entry disappears from the list.
- [ ] Open the note in source mode. It now reads:

      ````markdown
      ---
      wrapped-pdf: true
      tags:
        - test
      ---

      ```wrapped-pdf
      ```

      your own line of text
      ````

      (Obsidian may lay out the properties slightly differently; blank lines stay as you had them.) There is no
      `[[` link to the PDF anywhere.
- [ ] The PDF has not moved and has not been renamed.
- [ ] The note shows the PDF in reading view and live preview.
- [ ] Rename the converted note in Obsidian: the PDF follows, and the note's text does not change.

Then the variations:

- [ ] **Convert all.** Make three more old-style notes with their PDFs beside them. "Convert all" asks once, in a box
      titled "Convert all?": `Convert 3 documents whose PDF is already beside its note. No file is moved or renamed.
      In each note: …`. Confirm: a notice says "Converted 3 documents.", all three entries are gone, no file moved.
- [ ] **The PDF listed under another property.** An old-style note that also has
      `attachments: ["[[Old style.pdf]]", "[[Something else.png]]"]`: after Convert, `attachments` holds only
      `[[Something else.png]]`. With the PDF as the only entry, the list is left empty. A property holding just the
      link (`source: "[[Old style.pdf]]"`) is left empty.
- [ ] **A plain link in the text.** A line `See [[Old style.pdf|the scan]] for details.` becomes
      `See the scan for details.` A link without display text becomes the PDF's file name.
- [ ] **A link inside code is left alone.** Put `![[Old style.pdf]]` inside a fenced code block (three backticks)
      and inside inline code (single backticks): both are unchanged after Convert. Note: such a note may be listed
      again, or not at all, depending on whether Obsidian counts a link in code as a link; record what happens.
- [ ] **Known limit, record what you see:** an embed inside a list item (`- ![[Old style.pdf]]`), a quote or a table
      cell is replaced by a block on its own lines, which breaks the list, quote or table. A link inside a comment
      (`%% [[Old style.pdf]] %%`) or a math block may be changed. An embed with a page (`![[Old style.pdf#page=3]]`)
      becomes the plain block and the page is lost.
- [ ] **PDF beside the note, marker pointing at a different PDF.** `N.md` with `N.pdf` beside it, but
      `wrapped-pdf: "[[Other.pdf]]"` where `Other.pdf` exists elsewhere. The box says `N.pdf beside the note is its
      PDF; <path of Other.pdf>, which the marker points to, stays where it is and is not wrapped.` After Convert:
      `N.pdf` is the note's PDF, `Other.pdf` has not moved, and with automatic wrapping on `Other.pdf` is listed as
      "Not wrapped".
- [ ] **No PDF beside the note, marker pointing at a PDF elsewhere.** `M.md` alone in folder `X`, with
      `wrapped-pdf: "[[Y/Scan.pdf]]"`. It is listed as "Links to its own PDF, which is at Y/Scan.pdf", and "Convert
      all" does not count it. The box starts `Y/Scan.pdf is moved to X/M.pdf.` After Convert: `X/M.pdf` exists,
      `Y/Scan.pdf` is gone, the note is whole.
- [ ] **The same, but the name is taken** by a file that differs only in letter case (`X/m.pdf`, on macOS or
      Windows): Convert is refused
      with `Could not convert M.md: its marker points to Y/Scan.pdf, but a file named M.pdf already exists beside
      the note.` Nothing changes.
- [ ] **Two notes whose markers point at the same PDF**, neither with a PDF beside it: Convert on one is refused
      with `Could not convert <note>: the marker of <other note> points to <pdf> too.` Nothing changes.
- [ ] **Marker pointing at another wrapped document's PDF.** `Copy.md` with `wrapped-pdf: "[[Original.pdf]]"`,
      where `Original.md` and `Original.pdf` are a healthy pair. The box says `<Original.pdf>, which the marker
      points to, is the PDF of <Original.md> and stays where it is.` and that the note will then be listed as PDF
      not found. After Convert: `Original.pdf` has not moved, `Copy.md` reads `wrapped-pdf: true` and is listed as
      "PDF not found".
- [ ] **Marker pointing at a PDF that does not exist.** Listed as "Links to its own PDF, which was not found".
      After Convert the note reads `wrapped-pdf: true` and is listed as "PDF not found".
- [ ] **Stale entry.** Leave the list open, edit the old-style note by hand so its marker reads `true`, then click
      its Convert within a second or two: a notice says "This entry has changed since it was listed. The list has
      been refreshed." and nothing else changes. (The list also refreshes by itself about two seconds after the
      edit; if it got there first, the entry has simply been updated, which is also correct.)

## Next most important

After the three above, in this order. Each is ticked in its own section below.

1. Wrap a PDF (Wrap, first check).
2. Copy and duplicate a wrapped document (Copy and duplicate).
3. The automatic-wrapping guard: a PDF that arrives ahead of its note is not wrapped (Automatic wrapping).
4. Template repair: an old template is brought up to date (Templates).
5. Following a delete: delete a wrapped note, the PDF goes the same way (Following in-app changes).
6. An outside delete protects the PDF (Outside changes and Needs attention).
7. Explorer hiding, and disabling the plugin restores the rows (File explorer).
8. Three small ones under "Small checks worth doing early": the fallback link opens once, an uppercase `.PDF`,
   and a pair made by hand.

## Small checks worth doing early

- [ ] **An uppercase `.PDF`.** In Finder, put `Scan.PDF` (capital extension) in the vault. Wrap it: `Scan.md` appears
      beside it, the note shows the PDF, and the file explorer shows one row. Rename the note in Obsidian to `Scan
      two`: the PDF becomes `Scan two.PDF` (its extension keeps its capitals). "Duplicate wrapped document" gives
      `Scan two 1.md` and `Scan two 1.PDF`. Delete the note in Obsidian: the PDF goes too.
- [ ] **A pair made by hand.** Create a plain note `Hand.md`. In Finder, put `Hand.pdf` beside it. In Obsidian's
      properties panel, add the property `wrapped-pdf` and set it to true (a checkbox; the text `true` also counts).
      Within a couple of seconds the PDF's row is hidden and the note's row gets the "PDF" marker. Type the block
      into the note (three backticks, `wrapped-pdf`, new line, three backticks): the PDF shows. Rename the note in
      Obsidian: the PDF follows. Nothing is listed under Needs attention.
- [ ] **Values that do not mark a note.** Set `wrapped-pdf` to false (untick the checkbox), or leave it empty: within
      a couple of seconds the PDF's row reappears and the "PDF" marker goes. Tick it again: hidden again.
- [ ] **The link in the fallback opens once.** This forces the block's second way of drawing; desktop only, and it
      relies on an Obsidian internal, so skip it if the first line does nothing. In the developer console run
      `window.savedPdfEmbed = app.embedRegistry.embedByExtension.pdf; app.embedRegistry.embedByExtension.pdf = undefined;`
      then close and reopen a wrapped note. Expect: the PDF is still shown (drawn as an ordinary embed) with a link
      named after the PDF under it, and the console says once "PDF Wrapper: Obsidian's PDF embed is not available;
      showing the PDF as a rendered embed link instead." Click the link: the PDF opens **once** (one tab, not two).
      Ctrl/Cmd-click opens it once in a new tab. Afterwards run
      `app.embedRegistry.embedByExtension.pdf = window.savedPdfEmbed;` and reopen the note.
- [ ] **The block outside a note.** Add a card to a canvas and type the block into it: it shows nothing (no PDF, no
      message, no error in the console). Record what the card looks like.
- [ ] **The template is not a document.** With the default template in place (`Templates/Wrapped PDF.md`, which
      carries `wrapped-pdf: true`), "Check wrapped documents" does not list it as "PDF not found". The same for any
      note in your Templater or core Templates folder.

## Wrap

Run each item twice: once with Templater enabled, once with Templater disabled (core Templates only).

- [ ] Wrap a PDF from its file-explorer menu ("Wrap PDF"). The note opens and shows the PDF.
- [ ] Open a PDF, then run "Wrap active PDF" from the command palette. The note opens.
- [ ] "Wrap active PDF" is not offered when the active file is not a PDF, or when the PDF already has a note beside it.
- [ ] The file-explorer menu of a PDF that already has a note beside it (a wrapped PDF, or one with an unmarked note of the same name) has no "Wrap PDF" item; a PDF without a note has it.
- [ ] The note `<name>.md` appears in the same folder as the PDF.
- [ ] The PDF did not move.
- [ ] The note's frontmatter has the marker property (default `wrapped-pdf`) set to `true`, also when the template has no frontmatter or sets the property to something else.
- [ ] The note contains the `wrapped-pdf` block and no link or embed naming the PDF.
- [ ] With a template that lists the PDF under a property (add `attachments: ["[[{{title}}.pdf]]"]` to the template's frontmatter; with Templater use `[[<% tp.file.title %>.pdf]]`): the new note's `attachments` does not hold the PDF, and a notice that stays about 15 seconds reads `"<note name>": the template linked the note to its PDF, which a wrapped note must not do. In the note, the PDF was taken out of the property attachments. Change the template so that it no longer links to the PDF.` The template file itself is not changed for this. Other entries of `attachments` are kept.
- [ ] With a template whose body has a plain link `[[{{title}}.pdf]]`: in the new note it has become plain text (the PDF's file name), and the notice says `1 link to the PDF became plain text`.
- [ ] The plugin did not add `attachment` / `attachments` to a note whose template has none.
- [ ] Wrapping a PDF from the file menu renames, moves and deletes nothing else, shows no extra notice, and the new note is not reacted to a second time: it is not renamed or moved, and it is not listed as needing attention. (Assumes `vault.create` fires its `create` event before its promise resolves.)
- [ ] Wrapping `a|b.pdf` (or any name containing `[ ] | # ^`) is refused with a notice saying why.
- [ ] Wrapping a PDF whose note already exists is refused with a notice naming the note.
- [ ] Wrapping a PDF whose note exists under a different letter case (for example `s.md` beside `S.pdf`, on macOS or Windows) is refused with a notice naming `s.md`.
- [ ] Refusal notices read as one sentence (no "Failed to wrap X: Cannot wrap X").
- [ ] Start a wrap from the file menu and immediately run "Wrap active PDF" on the same PDF: the second is refused with "<name> is already being wrapped." and only one note is created.
- [ ] Wrap `Templates/Wrapped PDF.pdf` with no template set: the default template `Templates/Wrapped PDF.md` is created, then the wrap is refused with "Cannot wrap Wrapped PDF.pdf: its note would be the template file Templates/Wrapped PDF.md."
- [ ] With Templater, a template that renames its own note (`tp.file.rename`) or moves it (`tp.file.move`): the note ends beside the PDF and is marked `true`, and nothing is renamed a second time. If the rename back fails (for example, the moved note's original path was taken meanwhile), the notice starts "Failed to wrap <pdf name>: Created <where the note is> but could not mark it". Confirms that `fileManager.renameFile` onto an existing path throws rather than overwrites.
- [ ] With Templater, a template whose code throws (for example `<% tp.user.missing() %>`): Templater is expected to show its own error (for example "Template parsing error, aborting.") and leave no note. The plugin's notice then reads `Templater did not create a note for <pdf name>. Check its own message, fix the template or answer its prompt, then wrap again.` (no "Failed to wrap" prefix), no note is left beside the PDF or anywhere else, the PDF stays unwrapped (listed as "Not wrapped" when automatic wrapping is on), and wrapping again after fixing the template works. Record exactly what Templater itself shows. If instead Templater left the note beside the PDF, the plugin uses that note and marks it (if Templater threw, the console shows "PDF Wrapper: Templater failed after creating the note"). If Templater threw and left no note anywhere, the plugin creates the note without Templater (the console shows "PDF Wrapper: Templater failed" and then "creating the note without it") and the PDF is wrapped. Record which happened.
- [ ] With Templater, a template with a prompt: cancel the prompt (Escape). Use `<% tp.system.prompt("Title", "", true) %>` as the prompt: Templater's `tp.system.prompt` is believed (from reading its source; unverified) to return null on cancel and let the template finish unless its third argument is true, in which case cancelling aborts the template. If the wrap succeeds anyway after you cancel, record that as the outcome. Expected: the same notice as for a template whose code throws, no note left anywhere, and wrapping again and answering the prompt works. Record what Templater itself shows on cancel, and whether it left a note (if it did, the plugin marks that note instead).
- [ ] The same failing template with automatic wrapping on: drop three PDFs in from Finder at once. Templater's own error appears once (for the first PDF), and one notice reads `Automatic wrapping paused: Templater did not create a note for <pdf name>. Check its own message, fix the template or answer its prompt, then wrap again. PDFs that are not wrapped are listed under documents needing attention.` The other two are not tried (no further Templater errors) and all three are listed as "Not wrapped". Fix the template and wrap one of them by hand: the other two are then wrapped automatically within a few seconds. Repeat, but instead of a manual wrap drop a fourth PDF in after fixing the template: when it is wrapped, the held ones follow.
- [ ] With several "Not wrapped" entries and the failing template, "Wrap all" stops at the first one with the "Templater did not create a note…" notice and says "Stopped after wrapping 0 PDFs."
- [ ] Failure after the note exists: with Templater, use a template whose frontmatter has `title: <% tp.file.title %>` (unquoted), and wrap a PDF named `@Report 2024.pdf`. The note's frontmatter becomes `title: @Report 2024`, which is not valid YAML (`@` may not start an unquoted value), so setting the marker fails. The notice starts `Failed to wrap @Report 2024.pdf: Created @Report 2024.md but could not mark it as wrapping @Report 2024.pdf: <reason>.` and ends by telling you to delete the note and wrap again, or to set the "wrapped-pdf" property to true by hand. The note is still there without the marker, and after deleting it a second wrap (with a fixed template, for example `title: "<% tp.file.title %>"`) works. If the marker is set anyway, Obsidian's frontmatter parser accepted the value: record that and the name used.
- [ ] With Templater, a template that moves its own note elsewhere without Templater returning it (may not be reproducible, skip if you cannot): the notice reads `Templater did not return a note for <pdf name>. Notes created while it ran: <path of the moved note>. If one of them is its note, move it beside <pdf name> and add the "wrapped-pdf" property; otherwise wrap again.` (no "Failed to wrap" prefix). Nothing is created beside the PDF, and the named note is not moved, renamed or changed. A template that renames its note and Templater returns it is covered by the `tp.file.rename` step above. If Templater threw instead, the notice starts `Templater failed: <reason>. Notes created while it ran: …` and says nothing was created beside the PDF.
- [ ] Two wraps running Templater at the same time (needs a slow Templater call: use a template that prompts, turn automatic wrapping on, start "Wrap PDF" on one PDF and, while its prompt is open, drop a second PDF in from Finder and wait the 15 to 30 s until its automatic wrap starts): answer both prompts. Both PDFs end up wrapped, each with its own note, and neither wrap touches the other's note. If you cancel one prompt, its notice either says "Templater did not create a note…" or names the other wrap's note under "Notes created while it ran", and that note is unchanged.
- [ ] A long Templater call must not take someone else's note. The prompt is a modal and clicking elsewhere in Obsidian cancels it, so make the changes outside Obsidian. With a template that prompts (use `<% tp.system.prompt("Title", "", true) %>`, as above), start "Wrap PDF" on a PDF and, while the prompt is open, create a note with some text in the vault folder from Finder (or a terminal). Cancel the prompt. Expected: the notice is `Templater did not return a note for <pdf name>. Notes created while it ran: <that note's path>. …`, and that note is not moved, renamed or changed (same name, same place, same text, no marker property). Repeat, copying in from Finder a marked note of a different PDF without its PDF: same notice naming it, and the note is not moved, renamed or edited. Record what you saw.
- [ ] If opening the new note fails (hard to force; skip if you cannot), the notice reads "Wrapped <pdf> as <note>, but could not open the note: …" with no "Failed to wrap" prefix, and the PDF counts as wrapped.
- [ ] If taking the template's links out of the new note's text fails after the marker is written (hard to force; skip if you cannot), the notice reads "Created and marked <note>, but could not replace the links to <pdf> in its text: …" with no "Failed to wrap" prefix, and the note carries the marker.

## Templates

No prerequisites:

- [ ] Fresh install, no template set, no Templater or core Templates folder: wrapping creates `Templates/Wrapped PDF.md`, a notice names it, the template setting shows `Templates/Wrapped PDF`, and the new note shows the PDF. The template holds `wrapped-pdf: true` in its frontmatter and the `wrapped-pdf` block, nothing else.
- [ ] Same, with a Templater template folder set: the default appears in that folder.
- [ ] Same, with no Templater folder but a core Templates folder set: the default appears in that folder.
- [ ] No template set, but a file already exists at the default path: it is used, not overwritten, and the setting is filled.
- [ ] Template setting pointing at a deleted file: a default appears at that path, a notice says so, and the setting is unchanged.
- [ ] A folder named like the template path (for example a folder `Templates/Wrapped PDF.md`) makes the wrap fail with a notice naming that path.
- [ ] If saving settings fails after the default is created (hard to force; skip if you cannot), the notice says "Created a default template at <path>, but could not save it as the template setting: …".

Template repair (each time you wrap, the template is brought to the current form; do each on a copy of the template):

- [ ] **The test build's default template.** Use the template the earlier test build created (frontmatter with an empty `wrapped-pdf:` line, and the line `![[{{title}}.pdf]]`). Wrap a PDF. A notice reads `Updated the template <path>: set the marker property "wrapped-pdf" to true; replaced the PDF embed with the wrapped-pdf block, which shows the PDF beside the note.` (A marker line holding `[[{{title}}.pdf]]` is set to `true` the same way.) Open the template in source mode: the embed line is now the block, the marker line reads `wrapped-pdf: true`, and every other character is as it was. The new note shows the PDF and holds no link to it.
- [ ] A template with no frontmatter and no block gains both: `Updated the template <path>: added the marker property "wrapped-pdf"; added the wrapped-pdf block, which shows the PDF beside the note.`
- [ ] A Templater template with `<% %>` expressions in its frontmatter but no marker gains only the marker line (and the block at the end if it had none); everything else in the file is unchanged byte for byte.
- [ ] A template whose marker line holds a Templater expression or any other value of your own is left as it is (the new note is still marked `true`).
- [ ] The placeholder embed in its other spellings is replaced too: `![[{{title}}]]`, `![[{{file}}.pdf]]`, `![[<% tp.file.title %>.pdf]]`, and with a folder in front (`![[Scans/{{title}}.pdf]]`).
- [ ] **Only that embed is replaced.** A template that also embeds a fixed file (`![[Letterhead.pdf]]`) or a name built from something else (`![[{{date}}.pdf]]`) keeps those lines, in the template and in the new note.
- [ ] A placeholder embed inside a fenced code block in the template is left alone.
- [ ] Wrapping again with the repaired template changes nothing, shows no "Updated the template" notice, and does not change the template's modified time.
- [ ] Marker property setting: with automatic wrapping on, type a new name slowly (for example `pdf-doc`) and drop a PDF in while typing. Nothing is saved until you leave the field (click elsewhere, or close the settings): the template gains no partial name such as `pd:`, and the new note is marked with the old name. After you leave the field, the list refreshes at once (notes with the old name are no longer recognised). Empty the field and leave it: it shows `wrapped-pdf` again and that name is used. The block is still written `wrapped-pdf` whatever the property is called.

## Following in-app changes

Do these with both "Delete the PDF when its note is deleted in Obsidian" and "Rename and move the PDF with its
note" on (the defaults), on desktop and on a phone. Use notes in the current form (`wrapped-pdf: true` and the
block). **In every rename, move and copy check, also confirm that the note's text did not change** (same text in
source mode; in Finder its "modified" time is the time it was last edited by you, not the time of the rename).

- [ ] Rename a wrapped note in the file explorer: the PDF is renamed to match and the note still shows the PDF.
- [ ] Move a wrapped note to another folder (drag in the explorer, and with "Move file to…"): the PDF moves beside it.
- [ ] Rename a PDF from its tab (the title in the view header), and (separately) from the explorer, where other notes link to that PDF: the wrapped note follows and its text is untouched; the other notes now link to the new PDF name (that is Obsidian's own link updating).
- [ ] Move a PDF to another folder: the note follows.
- [ ] Rename a wrapped note, then rename it back by hand: the PDF follows both times.
- [ ] Rename a wrapped note twice in quick succession (rename, then immediately rename again): the pair ends up matched under the second name, no notice.
- [ ] Rename a note onto a name whose PDF already exists in that folder (for example rename `A.md` to `B.md` where `B.pdf` exists but `B.md` does not): a notice says `Could not rename <A.pdf> to match <B.md>: a file with that name already exists.`, `B.pdf` is unchanged and `A.pdf` is still there. Because pairs go by name, `B.md` now counts as wrapping `B.pdf`, and `A.pdf` is an ordinary PDF (listed as "Not wrapped" when automatic wrapping is on). Rename the note back to undo it.
- [ ] Rename the PDF of a pair onto a name whose note already exists (rename `A.pdf` to `C.pdf` where `C.md` exists): a notice says `Could not rename <A.md> to match <C.pdf>: a file with that name already exists.`, nothing is overwritten, and `A.md` is listed as "PDF not found".
- [ ] Case-only rename of a wrapped note (`report.md` to `Report.md`) on macOS or Windows: the PDF becomes `Report.pdf`, no notice, nothing lost.
- [ ] Move a folder holding several pairs (drag it into another folder), and rename a folder holding pairs: no error notice, both files of every pair end up together, every note still shows its PDF, no note's text changed, and nothing lands in the trash.
- [ ] Delete a wrapped note: the PDF is deleted the same way (check the system trash or the vault's `.trash` folder, per Settings → Files and links → Deleted files).
- [ ] **Merging deletes the PDF; know this before you rely on it.** Merge a wrapped note `A.md` into another note `B.md` with the core Note composer ("Merge entire file with…"). Run this with Settings → Files and links → Deleted files set to the system trash or the vault's `.trash` folder, so the PDF can be recovered. `A.md` is deleted by the merge. In the earlier form `B.md` then held an embed of `A.pdf`, which kept the PDF. Now nothing links to `A.pdf` (the block that moved into `B.md` looks for `B.pdf`), so expect `A.pdf` to be deleted along with its note. Record what happened, and what `B.md` shows where the block landed.
- [ ] A plain note that embeds `![[A.pdf]]` (or links `[[A.pdf]]`), then delete the wrapped note `A.md` from the explorer: `A.pdf` stays, a notice says "Kept A.pdf: other notes still link to it.", and `A.pdf` is listed with "Its note was deleted; the PDF was kept". Then repeat within a few seconds of adding the embed (type `![[A.pdf]]` into another note and delete `A.md` at once): the PDF is still kept, because the plugin also reads notes changed in the last 10 seconds.
- [ ] Delete a wrapped note whose PDF no other note links to: the PDF is deleted (the link check does not keep every PDF), also right after editing another note that does not link to it.
- [ ] Delete a folder holding several pairs: no "Could not delete" or other error notice, every pair is gone together, and nothing from it lands in the trash outside that folder (the trash holds the folder, not loose files).
- [ ] Delete only the PDF of a pair: the note stays, and is listed as "PDF not found".
- [ ] Delete a marked note that has no PDF beside it: no PDF anywhere is touched.
- [ ] Turn "Delete the PDF when its note is deleted in Obsidian" off, delete a wrapped note in Obsidian: the PDF stays and is listed with "Its note was deleted; the PDF was kept".
- [ ] Turn "Rename and move the PDF with its note" off, rename a wrapped note in Obsidian: the PDF is not renamed, and the note is listed as "PDF not found". "Use a PDF" and "Rename note to match" both offer the PDF, whether automatic wrapping is on or off.
- [ ] Unwrap a document by deleting its `wrapped-pdf` property in the properties panel (no rename, create or delete): within a couple of seconds the PDF's row reappears in the file explorer and the note loses its "PDF" marker. Add the property back (or undo): the row is hidden again within a couple of seconds. Typing in the body of a wrapped note causes no visible refresh or flicker.
- [ ] Type `[[<its own pdf>.pdf]]` into a wrapped note: within a couple of seconds it is listed as "Links to its own PDF". Delete the link again: the entry clears.

### Assumptions about Obsidian the code relies on (unverified; confirm each)

The plugin's event handling was built without a running Obsidian. Each line is a behaviour the code assumes;
report any that does not hold.

- [ ] The plugin's wrapper is in place: with the plugin enabled, paste `app.fileManager.renameFile.toString()` into the developer console. It should print monkey-around's short wrapper function, containing `current.apply(this, args)`, not Obsidian's own long implementation of the rename. Also `Object.prototype.hasOwnProperty.call(app.fileManager, "renameFile")` should print `true`. If either is not so, Obsidian's UI may not go through the wrapped method, and the plugin may react before Obsidian has finished updating links.
- [ ] Obsidian's own rename from the explorer and from a tab's title goes through `app.fileManager.renameFile` (the plugin waits for that call to finish before following).
- [ ] A rename or move in the explorer fires `vault` `rename` with the new file and the old path, and goes through `Vault.rename`, and a delete goes through `Vault.trash` or `Vault.delete`, so each is recognised as local: the in-app checks above follow, and the Finder checks below do not.
- [ ] When `vault` `rename` fires for a note, `metadataCache` already has that note's frontmatter under the new path (a followed rename works on the first try, not only after a recheck).
- [ ] Obsidian's link updater does not touch a wrapped note when its PDF is renamed, because the note holds no link to it. (This is the heart of check 1. If a wrapped note's text or modified time changes on a rename, report it.)
- [ ] `app.embedRegistry.embedByExtension.pdf` exists and is a function (paste `typeof app.embedRegistry.embedByExtension.pdf` into the console; expect `"function"`), on desktop and on the phone. It is what the block uses to show the PDF.
- [ ] A code block processor registered for `wrapped-pdf` runs in reading view and in live preview, and is given the path of the note the block is in.
- [ ] The metadata cache lists links held in a note's properties (so a PDF listed under `attachments` in its own note is found, and the note is listed as "Links to its own PDF"). Check with a marked note whose only link to its PDF is in a property.
- [ ] A folder rename or move fires one `rename` per file inside it, and by the time the plugin handles the first, Obsidian's file list already shows every file at its new path (otherwise the plugin may try to rename a partner that has already moved; it then stops quietly).
- [ ] `fileManager.renameFile` onto an existing path throws rather than overwrites (the plugin checks first, so this only matters if the check races).
- [ ] A case-only rename through `fileManager.renameFile` works on macOS and Windows, and `vault.getAbstractFileByPath` returns either nothing or the file itself for the new spelling.
- [ ] `fileManager.trashFile` fires `vault` `delete` for the PDF (synchronously or not); the plugin then ignores it as its own change.
- [ ] Obsidian's own copy action on a note ("Make a copy" / "Duplicate") goes through `Vault.copy` (the plugin then knows which note was copied) or through `Vault.create` (the plugin then looks for the one wrapped note in the folder with the same text and a matching name). Record which: if the copy's PDF appears at once it was `Vault.copy`; if it appears a moment later it was found by its text.
- [ ] `metadataCache` `changed` fires for a newly created note after it is created (the plugin looks at a note copied in Obsidian again then, because its marker is usually not indexed yet when the `create` event arrives).
- [ ] `metadataCache` `changed` fires after a property is deleted in the properties panel, and after sync delivers a modified note (the unwrap check above and its second-device version below depend on it).
- [ ] Note composer's merge deletes the merged note through `Vault.trash` or `Vault.delete` (so it reads as local). Run with "Deleted files" set to a trash.
- [ ] Whether `metadataCache.resolvedLinks` includes links held in another note's frontmatter properties (for example `attachments: "[[A.pdf]]"`), or only body links: delete a wrapped note whose PDF only another note's property links to, and record whether the PDF was kept.
- [ ] Deleting a note fires `metadataCache` `deleted` with the note's previous cache, including its frontmatter (that is how the plugin knows the deleted note was marked).
- [ ] `metadataCache` `deleted` fires for notes only (not for PDFs), so each deletion is handled once.
- [ ] Deleting a folder: by the time the plugin handles the note's deletion, the PDF is already gone from Obsidian's file list (no "Could not delete" notice).
- [ ] The plugin's own rename of a partner fires `vault` `rename` within 5 seconds, so it is recognised as the plugin's own and not followed back.
- [ ] With Settings → Files and links → "Automatically update internal links" off, rename a wrapped PDF in Obsidian where another note links to it: answer the "Update links?" dialog, then confirm the wrapped note follows and its content is intact. Repeat, leaving the dialog open for more than ten seconds before answering, and record what happens (the plugin stops waiting after ten seconds, logs a "PDF Wrapper:" warning in the console, and reacts anyway).

## Copy and duplicate

"Duplicate wrapped document" (file menu on a note, and the command palette), and Obsidian's own copy action.

- [ ] Duplicate a wrapped document `S`: `S 1.md` and `S 1.pdf` appear beside it and `S 1.md` opens and shows `S 1.pdf`. The copy's text is identical to the original's (nothing in it was edited), the original note and PDF are unchanged, nothing lands in Needs attention, and with automatic wrapping on the copied PDF is not wrapped a second time.
- [ ] Duplicate `S` again: `S 2.md` and `S 2.pdf` appear (the first copy is `S 1`).
- [ ] With `S 1.md` present but no `S 1.pdf`, duplicate `S`: both copies are named `S 2`.
- [ ] The menu item and command are absent for a note without the marker and for a marked note with no PDF of its name beside it (the command is not listed in the palette; the file menu has no item).
- [ ] Trigger the command twice quickly: only one copy pair is made.
- [ ] **Obsidian's own copy.** Right-click a wrapped note `S` and use Obsidian's own copy action ("Make a copy" or "Duplicate"): a PDF copy appears beside the note copy with the copy's name (for example `S 1.pdf`), the copy note's text is identical to the original's, nothing is listed in Needs attention, the original note and PDF are unchanged, and with automatic wrapping on the copied PDF is not wrapped again. Record the copy's name and how long the PDF took to appear.
- [ ] Do the same when `<copy name>.pdf` already exists (for example put a different PDF named `S 1.pdf` there first): nothing is copied and nothing is overwritten. Because pairs go by name, the copy `S 1.md` now counts as wrapping the `S 1.pdf` that was already there; no notice is shown. Confirm that is what you see, and that the existing `S 1.pdf` is untouched.
- [ ] The same where the name is taken only in a different letter case (`s 1.pdf` exists, on macOS or Windows): the notice "Copied S 1.md, but could not copy its PDF: a file named S 1.pdf already exists. The copy is listed under documents needing attention." appears once, and the copy is listed as "PDF not found".
- [ ] **Two documents from one template are not mixed up.** Wrap two PDFs, `A` and `B`, in one folder from the default template (their notes have identical text). Create a new note in that folder inside Obsidian named `Unrelated`, and paste the same text into it. No PDF is copied for it; it is listed as "PDF not found". (A copy is only recognised by its text when its name also looks like a copy: `A 1`, `A copy`.)
- [ ] With "Rename and move the PDF with its note" off, copy a wrapped note with Obsidian's own copy action: only the note is copied, no PDF appears, and the copy is listed as "PDF not found". Its "Copy another document's PDF" fix, choosing the original, gives it a PDF and the entry disappears.
- [ ] Copy a wrapped note in Finder: no PDF is copied and the copy is listed as "PDF not found".

## Outside changes and Needs attention

Changes made in Finder (or Explorer), by another app, or while Obsidian was closed are never acted on; they are
listed. The startup check runs about two seconds after the vault loads, and again two seconds later before its
notice appears. "Check wrapped documents" runs it on demand and opens the list; "Show documents needing
attention" opens the list as last checked.

- [ ] Delete a wrapped note in Finder (or Explorer) with Obsidian open: the PDF stays, and within a few seconds it is listed with "Its note was deleted; the PDF was kept". Restart Obsidian: the entry is still there. On three such entries, check each fix: "Keep as a plain PDF" removes the entry and changes no file; "Wrap" wraps it again; "Delete the PDF" first asks for confirmation naming the PDF, then deletes it as the "Deleted files" setting says.
- [ ] Delete a wrapped note in Finder, then delete its PDF in Finder too: the "Its note was deleted; the PDF was kept" entry disappears by itself (run "Check wrapped documents" if the list is not open).
- [ ] Delete a wrapped note in Finder with Obsidian open, wait for its "Its note was deleted; the PDF was kept" entry, then copy the note back in Finder: on the next check the entry clears. Clicking "Delete the PDF" (and confirming) before it clears is refused with "A note named <note> now exists beside this PDF. Check the list again." and the PDF stays.
- [ ] Rename a wrapped note in Finder with Obsidian open: the PDF is not renamed, and the note is listed as "PDF not found".
- [ ] With Obsidian closed, rename a wrapped note in Finder. On launch a notice "1 document needs attention" appears (2 with automatic wrapping on, because the PDF is then also listed as "Not wrapped"); clicking it opens the list, where the note is listed as "PDF not found". Nothing changed on disk before you click a fix. **Use a PDF** offers the old PDF (it is in the same folder); choosing it renames the PDF to the note's new name and the entry disappears.
- [ ] The same again, fixed the other way: **Rename note to match** offers the PDF; choosing it gives the note its old name back and the entry disappears.
- [ ] With Obsidian closed, move a wrapped note to another folder in Finder: listed as "PDF not found"; **Use a PDF** offers the PDF with the same name in the old folder; choosing it moves the PDF beside the note.
- [ ] "Make a copy" of a wrapped note in Finder: the copy is listed as "PDF not found", the original is not listed and is unchanged; **Copy another document's PDF**, choosing the original, gives the copy its own PDF and the entry disappears.
- [ ] A note whose PDF is gone (delete the PDF in Finder) and with no unwrapped PDF in its folder or under its name: listed as "PDF not found" with the extra line "No unwrapped PDF is in its folder or has its name. It may not have downloaded yet." "Use a PDF" and "Rename note to match" are not offered. **Remove the marker** is offered but is never the highlighted button; clicking it removes the `wrapped-pdf` property from the note and nothing else, and the entry disappears.
- [ ] "Use a PDF" where the name is already taken (hard to arrange; skip if you cannot): refused with "Could not move <pdf> to <destination>: a file with that name already exists."
- [ ] Leave the list open, change a listed document in Finder so its entry no longer applies (for example rename the note back), then click its fix within a second or two: a notice says "This entry has changed since it was listed. The list has been refreshed." Nothing else changes. (If the list refreshed by itself first, the entry is simply gone, which is also correct.)
- [ ] "Convert all" and "Wrap all" each appear only when the list has an entry they cover: "Convert all" for a "Links to its own PDF" entry whose PDF is beside its note, "Wrap all" for a "Not wrapped" entry. There is no bulk button for "PDF not found".
- [ ] With several convertible entries, one of which cannot be written (for example lock the note in another app on Windows, or make it read-only): "Convert all" converts the others up to that one, shows the failure notice, then "Stopped after converting <n> documents." and lists what is left.
- [ ] With nothing listed, the list says "Everything is in order." and no startup notice appears.
- [ ] Run "Show documents needing attention" straight after launch, before the startup check has run: the list says "Checking…" and then fills in.
- [ ] If that first check fails (hard to force; skip if you cannot), the list says "Could not check wrapped documents. Close this and try again." instead of staying on "Checking…".
- [ ] On a phone: the list opens from the command palette, long names wrap instead of overflowing, every button is easy to tap (at least 44px tall), the "Convert this note?" box is readable, and each fix works.
- [ ] Open the list, then disable PDF Wrapper in Settings → Community plugins: the list closes (and so does an open confirmation box or PDF chooser). Repeat, clicking a fix (or confirming one) just before disabling: no file changes after the plugin is disabled.

## Automatic wrapping

The switch is Settings → PDF Wrapper → "Wrap new PDFs automatically". It is stored on the device, not synced.

The guard for a document that is still arriving (new in this build). A PDF from outside is not wrapped while a
marked note without its PDF is in the same folder, or has the same name anywhere in the vault:

- [ ] **Rename arriving, PDF first.** Automatic wrapping on. Take a wrapped document `A.md` + `A.pdf`. With Obsidian open, rename `A.pdf` to `B.pdf` in Finder (this is what the first half of a synced rename looks like). Wait a full minute. Expect: **no `B.md` is created.** `A.md` is listed as "PDF not found" and `B.pdf` as "Not wrapped". Now rename `A.md` to `B.md` in Finder: within a few seconds both entries clear and `B` is one wrapped document.
- [ ] **Move arriving, PDF first.** Move `A.pdf` to another folder in Finder and wait a minute: no note is created for it there. Move `A.md` after it: the pair is whole.
- [ ] **Not tried again.** Repeat the first step, but leave `A.md` alone for five minutes: `B.pdf` is still not wrapped. Its own "Wrap" button in the list wraps it.
- [ ] **By design, it also holds an unrelated PDF.** While some marked note in a folder has no PDF, save a new, unrelated PDF into that same folder from Finder: after a minute it is not wrapped, and is listed as "Not wrapped". Save one into a different folder under a different name: that one is wrapped after 15 to 30 seconds as usual.
- [ ] **On two devices.** With automatic wrapping on on device B, rename a wrapped document on device A (check 1 again). B ends with one note and one PDF and creates no note of its own, however the two files arrive.
- [ ] A PDF dropped into Obsidian itself (not from Finder) into a folder holding a "PDF not found" note is still wrapped after about 2 seconds: the guard is only for PDFs from outside.

The rest:

- [ ] Toggle on; drop a PDF into the file explorer: it is wrapped in about 2 seconds, a notice "Wrapped <name>" appears and the new note is not opened. Time it. (Unverified: that Obsidian's own drag and drop goes through `Vault.create`, `createBinary` or `copy`, which is what makes it count as local. If it takes 15-30 s, it does not.)
- [ ] Save a PDF into the vault folder from Finder while Obsidian is running: it is wrapped in 15-30 seconds. Time it, three times; the delay varies.
- [ ] Download a PDF from a browser straight into the vault folder: it is wrapped once the download finishes and the file gets its final name (15-30 s later), not while it is still a temporary name.
- [ ] Paste a PDF into another note with a specific "Default location for new attachments" folder set: the PDF lands in that folder and is not wrapped.
- [ ] Drop 20 PDFs at once (a folder dragged in): each gets exactly one note, no PDF is skipped, and no note is created twice. Note how long the last one took. The notices are one "Wrapped 20 PDFs." at the end of the pass (not 20), and with 1 to 3 PDFs one "Wrapped <name>" each.
- [ ] The same 20 with a template that links to the PDF (for example `attachments: ["[[{{title}}.pdf]]"]`): the long notice about the template appears **once** for the pass, naming the first note and ending "The same was done in 19 other notes wrapped in this run."
- [ ] With the template path empty or pointing at a missing file, drop several PDFs: they are still wrapped (the template is created), with no failure notice.
- [ ] Make wrapping fail for every PDF (for example a read-only folder), then drop 5 PDFs: one notice "Could not wrap 5 PDFs. First problem: ... The rest are listed under documents needing attention."; with a single PDF, its own message once. The PDFs are listed as "Not wrapped".
- [ ] Toggle off during the settle period (within two seconds of dropping a PDF): the PDF is not wrapped.
- [ ] Disable the plugin within two seconds of dropping a PDF: nothing is wrapped afterwards.
- [ ] Enable the plugin and disable it again at once, before Obsidian's layout has finished loading (for example at startup; skip if you cannot time it): no "PDF Wrapper:" errors in the console, no startup notice, and no rows hidden.
- [ ] Leave a Templater prompt open during an automatic wrap: after 60 seconds the console shows a "PDF Wrapper:" warning; the wrap is not abandoned and later PDFs wait.
- [ ] A PDF added while Obsidian was closed appears as "Not wrapped" in the list with "Wrap all", and is not wrapped on its own at startup.
- [ ] Wrap all while automatic wrapping runs: copy 10 PDFs into the vault folder from Finder, open the list within a few seconds (they are listed as "Not wrapped"), and click "Wrap all" while the automatic wraps start (15 to 30 s after arrival). No "is already being wrapped" or "a note already exists" notice appears, the run does not stop, every PDF ends with exactly one note, and the final notice counts only the PDFs "Wrap all" wrapped.
- [ ] A PDF with an unmarked note of the same name beside it (create `X.md` without the marker, then add `X.pdf`) is not listed as "Not wrapped", is not wrapped automatically, and does not make "Wrap all" stop.
- [ ] A PDF that an old-style note's marker still links to (`wrapped-pdf: "[[Elsewhere/Scan.pdf]]"`) is not listed as "Not wrapped" and is not wrapped automatically, until that note is converted.
- [ ] A PDF whose name contains `[ ] | # ^` (for example `Report #2.pdf`), with automatic wrapping on: it is listed as "Not wrapped" (automatic wrapping, if it tries it, reports that it cannot be wrapped), but if it is the only such entry "Wrap all" does not appear; its own Wrap button shows "Cannot wrap Report #2.pdf: file names containing [ ] | # ^ cannot be linked. Rename the PDF first."
- [ ] Click "Wrap PDF" on a PDF just as automatic wrapping wraps it (or the reverse): one note results, and automatic wrapping shows no failure notice for it (the click may say "<name> is already being wrapped.").
- [ ] Make automatic wrapping stop on an unexpected error (hard to force; skip if you cannot): the notice ends "PDFs that are not wrapped are listed under documents needing attention."
- [ ] Toggle off: no "Not wrapped" entries are listed, and the list refreshes straight away when the switch is flipped.
- [ ] The toggle state differs per device: turn it on here, check another device still has it off.

## File explorer

Wrapped documents show as one row: the PDF row of every healthy pair is hidden and the note's row gets a "PDF"
marker, using generated styling rules only. Setting: "Hide paired PDF files in the file explorer" (on by default).
The mechanism was checked by the owner on an earlier build (300 and 3,000 rows, desktop, Obsidian 1.15.1); the
styling in this build has not been run in Obsidian yet.

- [ ] Wrapped documents show one row (the note) with the "PDF" marker after its name; the PDF row is hidden.
- [ ] PDFs without a note still show, and notes without the marker property show no "PDF" marker.
- [ ] An old-style note (marker is a link) with its PDF beside it also shows as one row.
- [ ] Toggling "Hide paired PDF files in the file explorer" off and on shows and hides the PDF rows at once (the marker stays either way).
- [ ] Rename, move, delete and duplicate a wrapped document: the right rows stay hidden, and no stray PDF row appears or stays hidden.
- [ ] Break a pair (for example delete the note outside Obsidian, or rename the PDF in Finder): the PDF becomes visible after the next check.
- [ ] Wrap 20 PDFs in a row (or drop 20 with automatic wrapping on): every PDF row ends hidden without toggling anything.
- [ ] Restart Obsidian: rows are hidden once the first scan has finished (a second or two after the layout appears).
- [ ] Disable the plugin: every row reappears at once. Enable it again: rows are hidden again.
- [ ] Same checks on a phone.

## Sync and several devices

Run with the plugin enabled on two devices (including a phone) sharing the vault, once with iCloud and once with
Obsidian Sync, both "follow" settings on. Check 1 at the top is the first of these; do it first.

- [ ] Copy a wrapped note with Obsidian's own copy action on device A (its PDF is copied there). On device B, once sync has delivered both copies, no extra PDF and no conflict file appear, and the copy is a wrapped document on both devices.
- [ ] Duplicate a wrapped document on device A: device B ends with exactly the two new files.
- [ ] Delete a wrapped note on device A: the PDF is gone on both devices once, and device B does not report an error or trash anything it did not need to. Device B never deletes a PDF because of a note that arrived or vanished by sync.
- [ ] Obsidian Sync and iCloud apply remote renames and deletes without going through `Vault.rename`, `Vault.trash` or `Vault.delete` (otherwise a receiving device would act on them; the two follow settings are the remedy). Record, per sync service, whether device B ever acted on a remote change.
- [ ] Rename, on device A, a PDF that another (ordinary) note links to. Obsidian rewrites that other note's link on A, and may do so on B as well. Record whether that other note ends up duplicated or conflicted on B. (It is not being renamed at the same moment, so it is not expected to.)
- [ ] Convert an old-style note on device A: on B, once sync has delivered the note, the entry clears and the note shows the PDF. Nothing is duplicated.
- [ ] With two devices both on, add a PDF on one: exactly one note results, on both devices. Record how long the second device waited before it wrapped. Expected: 15 to 30 seconds. A wait of about 2 seconds means sync delivered the PDF through a path the plugin reads as in-app, so the cross-device margin is gone: report it. Also note whether it ever wrapped the PDF itself. Repeat with the PDF saved into iCloud from a third app so both see it from outside at the same moment; repeat 5 times and count duplicate notes.
- [ ] Two devices on and a PDF arriving on both: the later device does not show a failure notice for the note that already exists (it silently skips).
- [ ] On device A, unwrap a document by deleting its `wrapped-pdf` property in the properties panel; on device B, once sync has delivered the note, the PDF row reappears within a couple of seconds without a restart. Repeat with "Remove the marker" and with "Use a PDF" run from the list on A.
- [ ] A PDF that iCloud has not downloaded yet: its note is listed as "PDF not found" (with "It may not have downloaded yet." when there is no PDF to offer), nothing is deleted, and the entry clears once it downloads. Record what the block shows meanwhile.

## After an Obsidian update

The four checks most likely to regress. Run them after every Obsidian update.

- [ ] The block shows the PDF, in reading view and live preview (check 2 at the top). It leans on an Obsidian internal.
- [ ] Rows hidden: wrapped documents show one row and the PDF rows are hidden (File explorer, first check).
- [ ] In-app rename followed: rename a wrapped note and the PDF follows, and the note's text is unchanged (Following in-app changes, first check).
- [ ] In-app delete followed: delete a wrapped note and its PDF goes the same way (Following in-app changes, delete check).
