# PDF Wrapper

An [Obsidian](https://obsidian.md) plugin that keeps a markdown note and its PDF together as one document.

A **wrapped document** is a note and a PDF that sit side by side in the same folder with the same name (`Statement.md` and `Statement.pdf`). The PDF is the content and is embedded in the note. The note carries frontmatter, so the document can be found with search, the properties panel, Bases or Dataview. Everything stays plain files, and your vault works without the plugin.

The plugin's job is to make the pair hold together: rename, move, delete and duplicate inside Obsidian apply to both files, and it is designed to list changes made outside Obsidian with one-click fixes rather than act on them (see [Changes made outside Obsidian](#changes-made-outside-obsidian)).

## Status

Please read this before letting the plugin rename or delete your files.

- **Not tested in Obsidian.** There is no Obsidian instance in the development environment. The decision logic has automated tests, but the parts that talk to Obsidian have not been exercised.
- **Checked by the owner:** hiding paired PDFs in the file explorer works at 300 and at 3,000 rows, on a Mac with Obsidian 1.15.1. It has not been checked after a restart or on a phone.
- **Not yet run by anyone in Obsidian:** real wrapping, following renames, moves and deletes, the Needs attention list, automatic wrapping, and duplicate.
- **Not verified on any sync setup:** iCloud and Obsidian Sync (see [Sync](#sync)).

`docs/manual-test-checklist.md` lists what still has to be run, in an iCloud vault and an Obsidian Sync vault, on desktop and phone.

Back up your vault before trying it. Consider turning off the two "follow" settings (see [Following changes made in Obsidian](#following-changes-made-in-obsidian)) until you have seen the plugin behave in a test vault.

## Wrapping a PDF

Right-click a PDF in the file explorer and choose **Wrap PDF**, or open the PDF and run **Wrap active PDF** from the command palette. The plugin creates `<name>.md` next to the PDF from your template and opens it. **The PDF does not move.**

Wrapping needs no setup. If you have not chosen a template, the plugin creates one for you the first time (see [Templates](#templates)).

The note always gets the marker property (default `wrapped-pdf`) set to a link to the PDF, for example `[[Statements/Statement.pdf|Statement.pdf]]`. A note is a wrapped document only if it has this property, so notes the plugin did not wrap are never touched.

Wrapping is refused, with a notice saying why, when a note of that name already exists, when the PDF's name contains characters that cannot be linked (`[ ] | # ^`), or when the PDF is already being wrapped.

### Automatic wrapping

**Wrap new PDFs automatically** wraps every PDF that is added to the vault while Obsidian is running. It is off by default, and the switch applies to this device only (it is not synced with your other settings).

- A PDF added inside Obsidian is wrapped after about 2 seconds.
- A PDF that arrives from outside (Finder, another app, sync) waits 15 to 30 seconds, with a random element, so that two devices rarely wrap the same PDF. If a note for the PDF turns up in that time, nothing is wrapped.
- PDFs that land in a specifically named attachment folder (Settings, Files and links, Default location for new attachments) are skipped. Those are files pasted into other notes, not documents.
- The new note is not opened. A notice says what was wrapped; when more than three PDFs are wrapped in one pass the notices are summarised into one.
- PDFs that arrived while Obsidian was closed are not wrapped on their own. They appear in the Needs attention list as "Not wrapped", with **Wrap all**. **Wrap all** can run while automatic wrapping is working through the same PDFs; a PDF the other got to first is skipped quietly.

It can still happen that two devices both see a new PDF at the same moment (a scanner saving into iCloud, for example) and both wrap it, leaving conflicting notes. The remedy is to turn the switch off on all but one device.

## Following changes made in Obsidian

When you do these inside Obsidian on this device, both files follow (as far as the plugin can tell that the change was made here; see [What following relies on, and how it could go wrong](#what-following-relies-on-and-how-it-could-go-wrong)):

| You do | The plugin does |
|---|---|
| Rename or move a wrapped note | Renames or moves its PDF to match, and updates the marker property and the embed. |
| Rename or move the PDF | Renames or moves the note to match. |
| Rename or move a folder holding wrapped documents | Both files of each pair move together. |
| Delete a wrapped note (or a folder holding wrapped documents) | Deletes its PDF too, in the same way (see below). The PDF is kept if another note still claims it. It is also kept, with a notice, if another note links to or embeds it, as far as the plugin can tell at that moment (for example after merging the note into another one with Note composer); it is then listed with "Its note was deleted; the PDF was kept". The plugin asks Obsidian's link index and, because that index can lag a link added moments earlier, also reads the notes changed in the last 10 seconds. |
| Duplicate a wrapped document (file menu on the note, or the command **Duplicate wrapped document**) | Copies both files, named the way Obsidian names copies (`Statement 1.md` and `Statement 1.pdf`), and points the copy at its own PDF. |
| Copy a wrapped note with Obsidian's own copy action ("Make a copy", or "Duplicate" in some versions), or any other in-app copy | Does the same as **Duplicate wrapped document**: copies the PDF under the copy's name, beside the copy, and points the copy's marker property and embed at it. If a file with the PDF's new name already exists, nothing is overwritten: a notice says so and the copy is listed as pointing at another document's PDF. The original is unaffected. |

Other cases:

- Deleting only the PDF leaves the note. It is then listed as missing its PDF.
- Deleting a note whose pair is already broken does nothing to any PDF.
- If the partner cannot follow (for example the new name is already taken), your action stands, a notice says so, and the pair is listed.
- Copying a note outside Obsidian (for example in Finder, or a copy that arrives through sync) is meant not to be acted on: it makes a second note pointing at the first note's PDF, which is listed with a fix that copies the PDF for it.

**Deleting follows your Obsidian setting.** The PDF is deleted the same way the note was: system trash, vault `.trash` folder, or permanent deletion, according to Settings, Files and links, Deleted files. If that is set to permanent deletion, the PDF is permanently deleted.

## Changes made outside Obsidian

The design intent is that the plugin renames, moves and deletes a partner file only for changes it identifies as made inside Obsidian on this device. A change made in Finder or by another app, delivered by sync, or made while Obsidian was closed is meant to be protected and listed, so that you decide. A PDF whose note disappears from outside Obsidian is meant to be kept and listed.

**That identification has not been verified on any sync setup.** If it is wrong, the plugin could act on a change it should have left alone. See [What following relies on, and how it could go wrong](#what-following-relies-on-and-how-it-could-go-wrong) for the symptoms and the two settings that turn following off.

There are two deliberate exceptions:

- Automatic wrapping creates a note for a PDF that arrives from outside (after 15 to 30 seconds). It runs your template, including any Templater code, without you present, and a template that prompts will hold up the queue until it is answered.
- Fixes you click in the Needs attention list change files. **Fix all** renames and moves files in bulk without asking for each one.

A scan never changes files. It runs a couple of seconds after startup and when you run **Check wrapped documents**.

## Needs attention

Run **Show documents needing attention** to open the list (**Check wrapped documents** checks first, then opens it). At startup a notice appears when the list is not empty. Each entry shows the file, its state, and the fixes available. The list is built to be usable on a phone.

| State shown | Meaning | Fixes |
|---|---|---|
| PDF not found. It may not have downloaded yet. | The PDF the note points at does not exist. | Choose a PDF (candidates are listed); Remove the claim |
| PDF has a different name | The PDF is beside the note under another name. | Rename PDF to match; Rename note to match |
| PDF is in another folder | The PDF exists elsewhere. | Move PDF beside note |
| Points at another document's PDF | The note is typically a copy. | Copy the PDF; Remove the claim |
| Shares a PDF with 1 other note (or "N other notes") | Several notes claim one PDF and none of them matches it. | Per note: move or rename the PDF to this note; Copy the PDF; Remove the claim |
| Its note was deleted; the PDF was kept | The note is gone and the PDF is left over: its note was removed outside Obsidian, deleted in Obsidian with "Delete the PDF when its note is deleted in Obsidian" off, or deleted in Obsidian while other notes still link to or embed the PDF. | Delete the PDF (asks first, then deletes the way Obsidian deletes files, following your "Deleted files" setting, which may be permanent); Wrap; Keep as a plain PDF |
| Not wrapped | Shown only when automatic wrapping is on for this device. PDFs in a named attachment folder, and PDFs with a note of the same name beside them (which cannot be wrapped), are left out. | Wrap |

**Fix all** covers misnamed and displaced entries that have one claimant and a free destination; **Wrap all** covers the "Not wrapped" entries, except PDFs whose names cannot be linked (their own **Wrap** button says why). Each appears only when the list, as last checked, has entries it covers. **Wrap all** skips, without a notice, a PDF that another wrap got to first (automatic wrapping may be running at the same time), whose note has just appeared, or that cannot be wrapped, and goes on with the rest; it stops on any other failure, including a Templater template that created no note. Nothing destructive is ever the default.

The "Its note was deleted; the PDF was kept" entries are kept in the plugin's data so that they survive a restart. They are only a reminder; losing them loses nothing else.

## One row in the file explorer

With **Hide paired PDF files in the file explorer** on (the default), the PDF row of every healthy pair is hidden in the core file explorer, and the note's row shows a small "PDF" marker. This is done with generated styling rules that rely on how the explorer's rows are marked up in Obsidian's HTML. The plugin does not patch or call into the explorer's code. If an Obsidian update changes that markup, the hiding stops and the PDF rows reappear; pairing is unaffected.

Limits:

- It applies to the **core file explorer only**. The PDF still appears in the quick switcher, search, the graph and third-party explorers.
- Popout windows are not styled.
- Not yet checked after a restart or on a phone (see [Status](#status)).

## Settings

| Setting | Default | What it does |
|---|---|---|
| **PDF template** | empty | Template file used when wrapping. May be empty; a default is created on first wrap. |
| **Marker property** | `wrapped-pdf` | Frontmatter property that marks a note as wrapping a PDF. A change is saved when you leave the field; an empty field goes back to `wrapped-pdf`. Changing it does not rename the property in existing notes, so they stop being recognised until you update them. |
| **Wrap new PDFs automatically** | off | See [Automatic wrapping](#automatic-wrapping). This device only. |
| **Hide paired PDF files in the file explorer** | on | See above. |
| **Delete the PDF when its note is deleted in Obsidian** | on | Turn off to never have a PDF deleted automatically; it is kept and listed instead. The "Delete the PDF" fix in the list still deletes, after you confirm. |
| **Rename and move the PDF with its note** | on | Turn off to stop renames, moves and in-app copies of a wrapped note from following; the pair (or the copy) is listed instead. |

## Templates

You do not have to set anything up.

- **No template configured:** the plugin creates `Templates/Wrapped PDF.md` and saves its path in the **PDF template** setting. If you have set a Templater template folder, or failing that a core Templates folder, it is created there instead. The default contains the marker property in frontmatter and one line embedding the PDF (`![[{{title}}.pdf]]`). It needs neither Templater nor the core Templates plugin.
- **Template path set but the file is missing:** the default is created at that path.
- **Template missing the marker property or a PDF embed:** each time you wrap, the template is checked and whatever is missing is added by inserting text (one line in the frontmatter, or a frontmatter block if there is none; an embed line at the end). You are told what was added. The frontmatter is never parsed and rewritten, because that can break Templater expressions, so the rest of the template stays exactly as it was. An embed of any `.pdf`, or of a target containing a placeholder (`{{...}}` or `<% ... %>`), counts as present.
- If any of this cannot be done, the wrap stops and a notice names the file and the reason.

Placeholders are resolved by Templater when it is installed. Otherwise the core Templates placeholders `{{title}}`, `{{date}}` and `{{time}}` are used.

With Templater, if Templater finishes without leaving a new note (expected when the template's code fails or you cancel one of its prompts; Templater shows its own message), the plugin says "Templater did not create a note for <PDF name>. Check its own message, fix the template or answer its prompt, then wrap again." Nothing is created and the PDF stays unwrapped. If the template renames or moves its own note, the plugin moves the note back beside the PDF and marks it; when it cannot tell which new note is the one Templater made (for example because another wrap ran at the same time), it names the new notes so you can move the right one by hand.

The plugin no longer reads or writes the `attachment` / `attachments` properties. If you like to keep an `attachments` list, put it in your template; Obsidian's link updating can keep it current on rename, but that relies on its "Automatically update internal links" setting and has not been checked for links inside properties.

## Sync

- **Automatic wrapping is per device**, so you can run it on every device and fall back to a single one if conflicting notes appear.
- The plugin is designed not to follow changes delivered by sync, so that two devices do not both rename the same PDF. Whether sync-delivered changes are always recognised as such has not been verified. If a pair looks broken after a sync it is re-checked after a short wait, and it drops off the list if sync has since completed it. A sync that changes only a note's marker property also leads to a re-check.
- A sync plugin that writes incoming files through Obsidian's own file methods (for example a community sync plugin or a Git plugin) may make synced PDFs look as if they were added inside Obsidian. Automatic wrapping then waits only about 2 seconds for them instead of 15 to 30, and the margin that keeps two devices from wrapping the same PDF is gone.
- If automatic wrapping is on and new attachments are stored in the same folder as the note (or in a subfolder relative to it), every PDF pasted into a note is treated as a document and wrapped. Only a specifically named attachment folder is skipped.
- A PDF the sync service has not downloaded yet (iCloud can leave files in the cloud) looks like a missing PDF. The entry says so, and nothing destructive is the default.
- Deletes made inside Obsidian follow your Obsidian "Deleted files" setting, which may be permanent deletion.
- If two devices both find no template before settings have synced, each creates the default one. The contents are identical; the worst case is a duplicate file.
- Make sure the marker property name is the same on every device. A device with a different name does not recognise the pairs and leaves them alone.

### What following relies on, and how it could go wrong

Following renames, moves, copies and deletes relies on the plugin telling a change you made inside Obsidian on this device apart from one made in Finder or delivered by sync. It does this by noting the changes that go through Obsidian's own file methods.

**This has not been verified on any sync setup**, including iCloud and Obsidian Sync. If it misfires, you could see:

- a duplicated or conflicting file after a rename,
- an unexpected copy of a PDF, or a sync conflict copy, after a note was copied on another device, or
- a PDF moved to the trash (or deleted) when its note was not deleted by you.

If you see either, turn off:

- **Delete the PDF when its note is deleted in Obsidian**, and
- **Rename and move the PDF with its note** (it also covers copying a wrapped note).

With both off, the plugin is designed to rename, move, copy or delete files only when you click a fix or run a command. Broken pairs are listed with one-click fixes instead.

## Known limits

- Hiding applies to the core file explorer only; the PDF still appears in the quick switcher, search, graph and third-party explorers. Popout windows are not styled.
- One PDF per document. Other file types are not supported.
- Existing hand-wrapped notes are not adopted. A note is recognised only if it has the marker property and its PDF sits beside it with the same name. Notes that keep the PDF in an attachment folder under `attachments` are ignored until you move each PDF beside its note and add the marker property.
- By design, a PDF copied or renamed outside Obsidian is listed, not followed.
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
