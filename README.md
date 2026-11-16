# PDF Wrapper

An [Obsidian](https://obsidian.md) plugin that keeps a markdown note and its PDF together as one document.

A **wrapped document** is a note and a PDF that sit side by side in the same folder with the same name (`Statement.md` and `Statement.pdf`). The PDF is the content and is shown in the note. The note carries frontmatter, so the document can be found with search, the properties panel, Bases or Dataview. Everything stays plain files.

The plugin's job is to make the pair hold together: rename, move, delete and duplicate inside Obsidian apply to both files, and it is designed to list changes made outside Obsidian with one-click fixes rather than act on them (see [Changes made outside Obsidian](#changes-made-outside-obsidian)).

## Status

Please read this before letting the plugin rename or delete your files.

- **Not tested in Obsidian.** There is no Obsidian instance in the development environment. The decision logic has automated tests, but the parts that talk to Obsidian have not been exercised.
- **Checked by the owner, on an earlier build:** hiding paired PDFs in the file explorer works at 300 and at 3,000 rows, on a Mac with Obsidian 1.15.1. It has not been checked after a restart or on a phone.
- **Found by the owner, on an earlier build:** in an iCloud vault, renaming a wrapped document on one device left two copies of the note on the other. The cause was that the note named its PDF, so every rename also edited the note. That is why a wrapped note no longer names its PDF (see [What a wrapped note looks like](#what-a-wrapped-note-looks-like)). **Whether the new form cures it has not been run yet**; it is the first check in the checklist.
- **Not yet run by anyone in Obsidian, in this form:** the block that shows the PDF, wrapping, following renames, moves, deletes and copies, Convert, the Needs attention list, automatic wrapping, and duplicate.
- **Not verified on any sync setup:** iCloud and Obsidian Sync (see [Sync](#sync)).

`docs/manual-test-checklist.md` lists what still has to be run, in an iCloud vault and an Obsidian Sync vault, on desktop and phone. It starts with the three checks that decide whether this form works.

Back up your vault before trying it. Consider turning off the two "follow" settings (see [Following changes made in Obsidian](#following-changes-made-in-obsidian)) until you have seen the plugin behave in a test vault.

## What to know before relying on it

- **Without the plugin, a wrapped note does not show its PDF.** It shows an empty code block. The PDF is still beside the note under the same name.
- **The PDF is not an outgoing link of its note.** Obsidian's graph, backlinks and "unused attachment" clean-up tools do not see the two as connected. Do not let such a tool delete the PDF.
- **Merging a wrapped note into another note with Note composer deletes its PDF too.** The merge deletes the wrapped note inside Obsidian, and nothing else links to the PDF to keep it. The PDF goes wherever your "Deleted files" setting sends deleted files, which may be permanent. Unverified in Obsidian.
- **Automatic wrapping can hold back silently, for a whole folder.** While any marked note in a folder has no PDF, no PDF that arrives in that folder from outside is wrapped automatically. No notice is shown; the PDFs stay listed as "Not wrapped" (see [Automatic wrapping](#automatic-wrapping)).
- **Convert does not add the block.** It turns existing embeds of the PDF into the block. A note that had no embed shows no PDF afterwards until you add the block by hand (see [Convert](#convert)).
- **Telling your own changes from synced ones is unverified.** Following renames, moves, copies and deletes depends on it. The two settings "Delete the PDF when its note is deleted in Obsidian" and "Rename and move the PDF with its note" turn following off if it misbehaves (see [What following relies on, and how it could go wrong](#what-following-relies-on-and-how-it-could-go-wrong)).

## What a wrapped note looks like

A note made by the default template is this and nothing more:

````markdown
---
wrapped-pdf: true
---

```wrapped-pdf
```
````

- **`wrapped-pdf: true`** is the marker property. It says "this note wraps the PDF beside it". The name of the property is a setting.
- **The `wrapped-pdf` block** is where the plugin shows the PDF. It is a code block with nothing in it. In reading view and in live preview the plugin draws, in its place, the PDF that has the note's name and sits in the note's folder.

**Nothing in the note names the PDF.** The pair is found by name and folder alone: `Statement.md` wraps `Statement.pdf` in the same folder. So renaming, moving or copying a wrapped document changes file names only. The wrapped note itself is not edited, on this device or any other, so sync has nothing to merge in it. Other notes are a different matter: if some other note links to the PDF, Obsidian updates that link when the PDF is renamed, as it does for any file (or asks first, if "Automatically update internal links" is off).

Details:

- A note counts as marked when it has the property with any value other than `false`, the text `false`, empty or nothing. The plugin writes `true`.
- The names must match exactly, including capital letters. The extension may be in any case: `Statement.md` pairs with `Statement.PDF`.
- The block works in any note. If no PDF with the note's name is beside it, it shows "No PDF named Statement.pdf beside this note." It redraws when the note or the PDF is renamed, moved, created or deleted. It never changes a file.
- The block's content is ignored and reserved for later. There is no way to choose a page or a size.
- Outside a note (for example in a canvas card) the block shows nothing.
- The block uses Obsidian's own PDF viewer. If that viewer cannot be loaded, the block asks Obsidian to draw an ordinary embed of the PDF and puts a link to the PDF under it; if that fails too, or if the PDF's path contains one of `# | [ ] ^` (which an embed cannot name), it shows the link alone.
- Notes in your template folders (the configured template, the Templater template folder, the core Templates folder) are never treated as documents.

All of this is unverified in Obsidian.

### Making a pair by hand

Put the PDF beside the note under the same name and add `wrapped-pdf: true` to the note's properties. That is all. Add the block wherever you want the PDF to show:

````markdown
```wrapped-pdf
```
````

Do not link to or embed the PDF from its own note (see below).

To unwrap a document, delete the `wrapped-pdf` property from the note (or use **Remove the marker** in the list when it is offered). The note and the PDF become two ordinary files; neither is deleted.

### A wrapped note must not link to its own PDF

A link or embed of the PDF in its own note (`![[Statement.pdf]]`, `[[Statement.pdf]]`, or the PDF listed under a property such as `attachments`) brings the old problem back: Obsidian rewrites that link on every device when the PDF is renamed, at the same moment the note is being renamed.

- The plugin never writes such a link.
- Wrapping takes out any such link the template put into the new note, and tells you.
- A marked note that has one is listed under [Needs attention](#needs-attention) as "Links to its own PDF", with **Convert**.

Other notes may link to the PDF freely.

### What you give up

This form was chosen to stop notes being duplicated by sync. It costs four things:

- **Without the plugin, the note does not show the PDF.** It shows an empty code block. The PDF is still beside the note under the same name.
- **Obsidian sees no link from the note to its PDF.** The PDF is not among the note's outgoing links and is not connected to it in the graph. Tools that clean up "unused attachments" may flag it as unused. Do not let such a tool delete it.
- **A property query cannot follow the marker to the PDF**, because the marker is `true`, not a link. A formula built from the note's own name (`<name>.pdf` in the same folder) does the same job.
- **After a change made outside Obsidian, the plugin can only say "this note's PDF is not beside it"** and offer candidates. It can no longer tell where the PDF went.

## Wrapping a PDF

Right-click a PDF in the file explorer and choose **Wrap PDF**, or open the PDF and run **Wrap active PDF** from the command palette. The plugin creates `<name>.md` next to the PDF from your template and opens it. **The PDF does not move.**

Wrapping needs no setup. If you have not chosen a template, the plugin creates one for you the first time (see [Templates](#templates)).

The note always ends with the marker property set to `true`, whatever the template says. If the template put a link to the PDF into the note, wrapping takes it out, exactly as **Convert** would, and a notice says what was removed so that you can fix the template. When several PDFs are wrapped in one go, the notice appears once.

A note is a wrapped document only if it has the marker property, so notes the plugin did not wrap are never touched.

**Wrap PDF** and **Wrap active PDF** are not offered for a PDF that already has a note of the same name beside it, wrapped or not. (If a note appears at the last moment, or you use a **Wrap** button in the list after one has appeared, the wrap is refused with a notice naming the note.) A second wrap of a PDF that is already being wrapped is refused with a notice.

### Automatic wrapping

**Wrap new PDFs automatically** wraps every PDF that is added to the vault while Obsidian is running. It is off by default, and the switch applies to this device only (it is not synced with your other settings).

- A PDF added inside Obsidian is wrapped after about 2 seconds.
- A PDF that arrives from outside (Finder, another app, sync) waits 15 to 30 seconds, with a random element, so that two devices rarely wrap the same PDF. If a note for the PDF turns up in that time, nothing is wrapped.
- **A PDF from outside is not wrapped while a marked note without its PDF is waiting for one.** When its wait is over, the plugin looks for a marked note that has no PDF and is either in the same folder as the new PDF or has the same name anywhere in the vault. If there is one, the PDF is left alone. This is what a renamed or moved document looks like on a second device while sync is still delivering it, PDF first and note later; wrapping the PDF then would make a second note. The PDF is not tried again. It stays listed as "Not wrapped": if its note arrives, the pair is simply whole; if it was a false alarm, wrap it from the list.
- **This hold is silent and covers the whole folder.** No notice is shown (one line goes to the developer console). One "PDF not found" note in a folder, including a not yet converted note whose PDF is somewhere else, stops automatic wrapping of *every* PDF that arrives in that folder from outside, until you resolve that note. If new PDFs in a folder are not being wrapped, open the list and look for a "PDF not found" entry in that folder.
- **Turning the switch on lists what is already there.** Every PDF in the vault that has no note beside it (outside a named attachment folder) then appears as "Not wrapped", and they are counted in the startup notice. They are not wrapped on their own; use **Wrap all** or leave them.
- PDFs that land in a specifically named attachment folder (Settings, Files and links, Default location for new attachments) are skipped. Those are files pasted into other notes, not documents.
- The new note is not opened. A notice says what was wrapped; when more than three PDFs are wrapped in one pass the notices are summarised into one.
- PDFs that arrived while Obsidian was closed are not wrapped on their own. They appear in the Needs attention list as "Not wrapped", with **Wrap all**. **Wrap all** can run while automatic wrapping is working through the same PDFs; a PDF the other got to first is skipped quietly.

It can still happen that two devices both see a new PDF at the same moment (a scanner saving into iCloud, for example) and both wrap it, leaving conflicting notes. The remedy is to turn the switch off on all but one device.

## Following changes made in Obsidian

When you do these inside Obsidian on this device, both files follow (as far as the plugin can tell that the change was made here; see [What following relies on, and how it could go wrong](#what-following-relies-on-and-how-it-could-go-wrong)). Following only renames, moves, copies or deletes the other file. It never edits the wrapped note. Because the other file is renamed the way Obsidian renames files, Obsidian updates the links that *other* notes hold to it; with "Automatically update internal links" off, Obsidian may show its "Update links?" prompt for the file that follows.

| You do | The plugin does |
|---|---|
| Rename or move a wrapped note | Renames or moves its PDF to match. |
| Rename or move the PDF | Renames or moves the note to match. |
| Rename or move a folder holding wrapped documents | Nothing is needed: both files of each pair move together. |
| Delete a wrapped note (or a folder holding wrapped documents) | Deletes its PDF too, in the same way (see below). The PDF is kept, with a notice, if another note links to or embeds it, as far as the plugin can tell at that moment; it is then listed with "Its note was deleted; the PDF was kept". The plugin asks Obsidian's link index and, because that index can lag a link added moments earlier, also reads the notes changed in the last 10 seconds (the 20 most recently changed at most). |
| Duplicate a wrapped document (file menu on the note, or the command **Duplicate wrapped document**) | Copies both files, named the way Obsidian names copies (`Statement 1.md` and `Statement 1.pdf`). Nothing else: the copies pair by name. |
| Copy a wrapped note with Obsidian's own copy action ("Make a copy", or "Duplicate" in some versions), or any other in-app copy | Copies the PDF under the copy's name, beside the copy, when it can tell which document was copied (see below). Nothing is ever overwritten. The original is unaffected. |

**How a copy is recognised.** A copied note has the marker but no PDF. The plugin copies the PDF for it in two cases:

- Obsidian made the copy through its file-copy method, which the plugin watches, so the plugin knows which note was copied; or
- the new note was created inside Obsidian some other way, **and** exactly one wrapped note in the same folder has exactly the same text, **and** the new note's name looks like a copy of that note's name (`Statement 1`, `Statement copy`, `Statement (1)`).

Otherwise the copy is listed as "PDF not found", and **Copy another document's PDF** gives it one. Which way Obsidian's copy action goes is unverified.

Other cases:

- Deleting only the PDF leaves the note. It is then listed as "PDF not found".
- Deleting a marked note that has no PDF beside it does nothing to any PDF.
- If the partner cannot follow because the new name is already taken, your action stands, nothing is overwritten, and a notice says so. A note left without a PDF is listed as "PDF not found".
- **Pairs go by name, so a name that is already there counts.** If you rename or copy a wrapped note to a name for which a PDF already sits in that folder, the note now wraps *that* PDF. Its own PDF keeps its old name (after a rename) or is not copied (after a copy). Rename the note back to undo it.
- **Merging a wrapped note into another note deletes the wrapped note, and its PDF goes with it.** The core Note composer's merge deletes the merged note inside Obsidian, and since nothing links to the PDF any more, nothing keeps it. Turn "Delete the PDF when its note is deleted in Obsidian" off before merging if you want to keep the PDF. Unverified in Obsidian.
- Copying a note outside Obsidian (for example in Finder, or a copy that arrives through sync) is meant not to be acted on. The copy is listed as "PDF not found".

**Deleting follows your Obsidian setting.** The PDF is deleted the same way the note was: system trash, vault `.trash` folder, or permanent deletion, according to Settings, Files and links, Deleted files. If that is set to permanent deletion, the PDF is permanently deleted.

## Changes made outside Obsidian

The design intent is that the plugin renames, moves and deletes a partner file only for changes it identifies as made inside Obsidian on this device. A change made in Finder or by another app, delivered by sync, or made while Obsidian was closed is meant to be protected and listed, so that you decide. A PDF whose note disappears from outside Obsidian is meant to be kept and listed.

**That identification has not been verified on any sync setup.** If it is wrong, the plugin could act on a change it should have left alone. See [What following relies on, and how it could go wrong](#what-following-relies-on-and-how-it-could-go-wrong) for the symptoms and the two settings that turn following off.

There are two deliberate exceptions:

- Automatic wrapping creates a note for a PDF that arrives from outside (after 15 to 30 seconds). It runs your template, including any Templater code, without you present, and a template that prompts will hold up the queue until it is answered. If Templater hands back no note (the template fails, you cancel its prompt, or notes appear elsewhere that the plugin only names), automatic wrapping pauses with one notice: the PDFs waiting then stay listed as "Not wrapped" and are tried again only after a later wrap succeeds (one you start, or an automatic one for a PDF that arrives afterwards).
- Fixes you click in the Needs attention list change files. **Convert all** edits notes in bulk after asking once; it never moves or renames a file.

A scan never changes files, and neither does drawing the block. A scan runs a couple of seconds after startup and when you run **Check wrapped documents**.

## Needs attention

Run **Show documents needing attention** to open the list (**Check wrapped documents** checks first, then opens it). At startup a notice appears when the list is not empty. Each entry shows the file, what is wrong, and the fixes available. The list is built to be usable on a phone.

| Entry | Meaning | Fixes |
|---|---|---|
| PDF not found | A marked note has no PDF with its name beside it. The PDF may not have downloaded yet. | **Use a PDF**: choose from the unwrapped PDFs in the note's folder, then those with the note's name elsewhere; the one you choose is moved beside the note and renamed to the note's name. **Rename note to match**: choose an unwrapped PDF in the note's folder; the note takes its name. **Copy another document's PDF**: choose from the PDFs of your wrapped documents (the chooser lists the PDFs' paths); the one you choose is copied under this note's name. **Remove the marker**: the note becomes an ordinary note. A fix that needs a choice is offered only when there is something to choose. |
| Links to its own PDF | A marked note still links to or embeds its PDF. It works as a pair but can be duplicated by sync when renamed. | **Convert** (see below). |
| Its note was deleted; the PDF was kept | The note is gone and the PDF is left over: its note was removed outside Obsidian, deleted in Obsidian with "Delete the PDF when its note is deleted in Obsidian" off, or deleted in Obsidian while other notes still link to or embed the PDF. | **Keep as a plain PDF**; **Wrap**; **Delete the PDF** (asks first, then deletes the way Obsidian deletes files, following your "Deleted files" setting, which may be permanent). |
| Not wrapped | A PDF with no marked note beside it. Shown only when automatic wrapping is on for this device. PDFs in a named attachment folder, PDFs with a note of the same name beside them (which cannot be wrapped), and a PDF that a not yet converted note's marker still points to, are left out. | **Wrap** |

No fix ever overwrites a file. If the name it needs is taken, it is refused with a notice. If an entry has changed since it was listed, nothing is done, a notice says so, and the list is read again.

### Convert

**Convert** brings one note to the current form. It first says what it will do and asks. Then:

1. The marker property is set to `true`.
2. The PDF is taken out of every other property. In a list (such as `attachments`) only that entry is removed; a property holding only that link is left empty.
3. In the text, each embed of the PDF becomes the `wrapped-pdf` block, and each plain link to it becomes plain text (its display text, or the PDF's file name).

Whether a file is moved:

- **If a PDF with the note's name is already beside the note, Convert never moves a file.** If the old marker pointed at a different PDF, that PDF stays where it is. It is then an ordinary unwrapped PDF and shows as "Not wrapped" (when automatic wrapping is on). Links and embeds of that other PDF in the note's text are kept as they are: it is another file.
- If no PDF is beside the note and the old marker links to a PDF somewhere else, that PDF is first moved beside the note and renamed to the note's name. This is refused, with a notice, if that name is taken or if another note's marker points at the same PDF. Moving the PDF makes Obsidian rewrite the note's links to it, so after the move the plugin waits for Obsidian to finish (ten seconds at most) and reads the note's links to the PDF again from its text, and then converts those. One Convert is meant to do the whole job: PDF beside the note, marker `true`, links gone. Unverified in Obsidian.
- If the marker's PDF belongs to another wrapped document (it sits beside that document's note under its name), Convert does not move it. The note is converted and then shows as "PDF not found".
- If the marker's PDF does not exist, the note is converted and then shows as "PDF not found".

**Convert all** converts every "Links to its own PDF" entry whose PDF is already beside its note, after asking once. It never moves or renames a file. Entries that would need a move are left for you to convert one at a time. There is no bulk fix for "PDF not found": each needs a choice.

Limits of Convert:

- **Convert adds no block.** Only an existing embed of the PDF becomes the block. A note that had a link in its marker but no embed in its text shows no PDF after Convert. Add the block yourself, by typing these lines (three backticks and `wrapped-pdf`, then three backticks) where the PDF should show:

  ````markdown
  ```wrapped-pdf
  ```
  ````

- Fenced code blocks (three backticks or tildes) and inline code are left alone. That is all it recognises: a link to the PDF inside a comment (`%% … %%`), a math block or an indented code block is **not** guaranteed to be left alone and may be changed too.
- An embed inside a list item, a quote or a table cell is replaced by a block on its own lines, which breaks that list, quote or table. Check such notes afterwards.
- A page or size on an embed (`![[Statement.pdf#page=3]]`) is lost.

Notes wrapped by earlier test builds have a link in the marker and an embed in the text. They keep working as pairs and are listed with **Convert** and **Convert all**.

**Wrap all** covers the "Not wrapped" entries. **Convert all** and **Wrap all** each appear only when the list, as last checked, has entries they cover. **Wrap all** skips, without a notice, a PDF that another wrap got to first (automatic wrapping may be running at the same time), whose note has just appeared, or that cannot be wrapped, and goes on with the rest; it stops on any other failure, including a Templater template that created no note. Nothing destructive is ever the default.

The "Its note was deleted; the PDF was kept" entries are kept in the plugin's data so that they survive a restart. They are only a reminder; losing them loses nothing else.

## One row in the file explorer

With **Hide paired PDF files in the file explorer** on (the default), the PDF row of every wrapped document is hidden in the core file explorer. The note's row of every wrapped document shows a small "PDF" marker, whether this setting is on or off. Both are done with generated styling rules that rely on how the explorer's rows are marked up in Obsidian's HTML. The plugin does not patch or call into the explorer's code. If an Obsidian update changes that markup, the hiding stops and the PDF rows reappear; pairing is unaffected.

Limits:

- It applies to the **core file explorer only**. The PDF still appears in the quick switcher, search, the graph and third-party explorers.
- Popout windows are not styled.
- Not yet checked after a restart or on a phone (see [Status](#status)).

## Settings

| Setting | Default | What it does |
|---|---|---|
| **PDF template** | empty | Template file used when wrapping. May be empty; a default is created on first wrap. |
| **Marker property** | `wrapped-pdf` | Frontmatter property that marks a note as wrapping a PDF. A change is saved when you leave the field; an empty field goes back to `wrapped-pdf`. Changing it does not rename the property in existing notes, so they stop being recognised until you update them. The block is always written `wrapped-pdf`, whatever this is set to. |
| **Wrap new PDFs automatically** | off | See [Automatic wrapping](#automatic-wrapping). This device only. |
| **Hide paired PDF files in the file explorer** | on | See above. |
| **Delete the PDF when its note is deleted in Obsidian** | on | Turn off to never have a PDF deleted automatically; it is kept and listed instead. The "Delete the PDF" fix in the list still deletes, after you confirm. |
| **Rename and move the PDF with its note** | on | Turn off to stop renames, moves and in-app copies of a wrapped note from following; the note (or the copy) is listed as "PDF not found" instead. |

## Templates

You do not have to set anything up.

- **No template configured:** the plugin creates `Templates/Wrapped PDF.md` and saves its path in the **PDF template** setting. If you have set a Templater template folder, or failing that a core Templates folder, it is created there instead. The default contains the marker property set to `true` and the `wrapped-pdf` block (see [What a wrapped note looks like](#what-a-wrapped-note-looks-like)). It needs neither Templater nor the core Templates plugin.
- **Template path set but the file is missing:** the default is created at that path.
- **Template not in the current form:** each time you wrap, the template is checked and brought up to date, and a notice says what was changed:
  - no marker property: a line `wrapped-pdf: true` is inserted in the frontmatter (or a frontmatter block is added if there is none);
  - a marker line that is empty, or that holds the old placeholder link (`[[{{title}}.pdf]]`): it is set to `true`;
  - the old placeholder embed, that is an embed whose file name is just the note's title (`![[{{title}}.pdf]]`, `{{file}}`, or Templater's `<% tp.file.title %>`, with or without `.pdf`): it is replaced by the block;
  - no block: one is added at the end.
- **Only that placeholder embed is replaced.** Any other link or embed in your template is left in the template. If it turns out to point at the new note's own PDF, wrapping takes it out of the note (not the template) and tells you, each time, until you change the template.
- The template is changed by inserting or replacing those lines only. The frontmatter is never parsed and rewritten, because that can break Templater expressions, so the rest of the template stays exactly as it was.
- If any of this cannot be done, the wrap stops and a notice names the file and the reason.

Placeholders are resolved by Templater when it is installed. Otherwise the core Templates placeholders `{{title}}`, `{{date}}` and `{{time}}` are used.

With Templater, the plugin uses only the note Templater hands back, or a note at the expected place beside the PDF. If Templater hands back no note and there is none beside the PDF, the plugin does not look for it or move anything:

- If no new note appeared while Templater ran (expected when the template's code fails or you cancel one of its prompts; Templater shows its own message), it says "Templater did not create a note for <PDF name>. Check its own message, fix the template or answer its prompt, then wrap again." The PDF stays unwrapped.
- If notes appeared while Templater ran (the template may have renamed or moved its note, or something else created notes meanwhile, such as sync), it names up to three of them and leaves them to you: "Templater did not return a note for <PDF name>. Notes created while it ran: <paths>. If one of them is its note, move it beside <PDF name> and add the "<marker>" property; otherwise wrap again." If Templater failed with an error, the message starts "Templater failed: <reason>." and says nothing was created beside the PDF.
- If Templater failed with an error and no note appeared, the plugin creates the note without Templater, using the core Templates placeholders.
- If a note turns up beside the PDF that was already there before Templater ran (for example delivered by sync while the wrap was starting), the plugin does not use it: the wrap is refused as for any existing note.

A template that renames or moves its note and hands it back to the plugin is fine: the plugin moves that note back beside the PDF.

The plugin does not read or write the `attachment` / `attachments` properties by name. Do not list the PDF under `attachments` in your template: that is a link from the note to its own PDF, so wrapping takes it out again. The marker property already says that the note has a PDF.

## Sync

- **Renaming, moving or copying a wrapped document changes file names only.** The wrapped note is not edited by the plugin, and Obsidian's own link updating has nothing to rewrite in it, because the note holds no link to its PDF. This is the point of the current form. It has not been run on iCloud or Obsidian Sync yet.
- Other notes that link to the PDF are still rewritten by Obsidian, on every device, when the PDF is renamed. That is ordinary Obsidian behaviour and is not expected to duplicate anything; unverified.
- **Automatic wrapping is per device**, so you can run it on every device and fall back to a single one if conflicting notes appear.
- The plugin is designed not to follow changes delivered by sync, so that two devices do not both rename the same PDF. Whether sync-delivered changes are always recognised as such has not been verified. While a rename is arriving piece by piece, the note may be listed as "PDF not found" for a moment; it is re-checked after a short wait and drops off the list once sync has delivered the other file. A sync that only adds or removes a note's marker property also leads to a re-check.
- A sync plugin that writes incoming files through Obsidian's own file methods (for example a community sync plugin or a Git plugin) may make synced PDFs look as if they were added inside Obsidian. Automatic wrapping then waits only about 2 seconds for them instead of 15 to 30, the margin that keeps two devices from wrapping the same PDF is gone, and the guard for a document still arriving does not apply.
- If automatic wrapping is on and new attachments are stored in the same folder as the note (or in a subfolder relative to it), every PDF pasted into a note is treated as a document and wrapped. Only a specifically named attachment folder is skipped.
- A PDF the sync service has not downloaded yet (iCloud can leave files in the cloud) looks like a PDF that is not there: its note is listed as "PDF not found". When there is no PDF to offer for it, the entry says it may not have downloaded yet. Nothing destructive is the default.
- Deletes made inside Obsidian follow your Obsidian "Deleted files" setting, which may be permanent deletion.
- If two devices both find no template before settings have synced, each creates the default one. The contents are identical; the worst case is a duplicate file.
- Make sure the marker property name is the same on every device. A device with a different name does not recognise the pairs and leaves them alone.

### What following relies on, and how it could go wrong

Following renames, moves, copies and deletes relies on the plugin telling a change you made inside Obsidian on this device apart from one made in Finder or delivered by sync. It does this by noting the changes that go through Obsidian's own file methods.

**This has not been verified on any sync setup**, including iCloud and Obsidian Sync. If it misfires, you could see:

- a duplicated or conflicting file after a rename,
- an unexpected copy of a PDF, or a sync conflict copy, after a note was copied on another device, or
- a PDF moved to the trash (or deleted) when its note was not deleted by you.

If you see any of these, turn off:

- **Delete the PDF when its note is deleted in Obsidian**, and
- **Rename and move the PDF with its note** (it also covers copying a wrapped note).

With both off, the plugin is designed to rename, move, copy or delete files only when you click a fix or run a command. Notes without their PDF are listed with one-click fixes instead.

## Known limits

- Without the plugin a wrapped note shows an empty code block, not the PDF. The PDF is not an outgoing link of its note, is not connected to it in the graph, and may be flagged by "unused attachment" tools (see [What you give up](#what-you-give-up)).
- The block has no options: no page, no size. Outside a note (a canvas card) it shows nothing.
- Convert recognises fenced code blocks and inline code only; a link to the PDF in a comment, math or indented code may be changed. An embed inside a list item, quote or table cell is replaced by a block on its own lines. A page or size on an embed is lost (see [Convert](#convert)).
- A PDF whose name contains one of `[ ] | # ^` can be wrapped. Whether Obsidian or Templater accept creating a note with such a name is unverified; if they do not, the wrap fails with a notice. With `# | [ ] ^` in the path the block may show only a link to the PDF.
- Convert adds no block to a note that had no embed of its PDF; add it by hand.
- Merging a wrapped note into another note (Note composer) deletes its PDF with it, and renaming or copying a wrapped note onto the name of an existing PDF makes it wrap that PDF (see [Following changes made in Obsidian](#following-changes-made-in-obsidian)).
- Hiding applies to the core file explorer only; the PDF still appears in the quick switcher, search, graph and third-party explorers. Popout windows are not styled.
- One PDF per document. Other file types are not supported.
- Existing hand-wrapped notes are not adopted. A note is recognised only if it has the marker property, and it is a wrapped document only when its PDF sits beside it with the same name. Notes that keep the PDF in an attachment folder under `attachments` are ignored until you move each PDF beside its note, add the marker property, and take the link and the embed out (or add the marker and let **Convert all** do that last part).
- By design, a PDF or note copied or renamed outside Obsidian is listed, not followed.
- Filling the note's properties from the PDF's contents is not part of this plugin.

## Installation

The plugin is not in the community plugin directory. Install it manually:

1. Build `main.js` (see below) and take it with `manifest.json` and `styles.css` from the repository root. Version 2.0.0 has not been released yet. At the time of writing the [releases page](https://github.com/kenlefeb/obsidian-pdf/releases) only has the old 1.0.0 behaviour.
2. Create a folder `<vault>/.obsidian/plugins/pdf-wrapper/`.
3. Copy the three files into that folder.
4. Reload Obsidian and enable **PDF Wrapper** in Settings, Community plugins.

It works on desktop and mobile (`isDesktopOnly` is false). It needs Obsidian 1.8.7 or later.

### Building

```bash
npm install
npm run build   # type-check, then a production bundle
npm run lint
npm test
```

## License

[0-BSD](LICENSE)
