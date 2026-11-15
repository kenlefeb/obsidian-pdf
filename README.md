# PDF Wrapper

An [Obsidian](https://obsidian.md) plugin that keeps a markdown note and its PDF together as one document.

A **wrapped document** is a note and a PDF that sit side by side in the same folder with the same name (`Statement.md` and `Statement.pdf`). The PDF is the content and is embedded in the note. The note carries frontmatter, so the document can be found with search, the properties panel, Bases or Dataview. Everything stays plain files, and your vault works without the plugin.

The plugin's job is to make the pair hold together: rename, move, delete and duplicate inside Obsidian apply to both files, and changes made outside Obsidian are listed with one-click fixes instead of being acted on.

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
- PDFs that arrived while Obsidian was closed are not wrapped on their own. They appear in the Needs attention list as "Not wrapped", with **Wrap all**.

It can still happen that two devices both see a new PDF at the same moment (a scanner saving into iCloud, for example) and both wrap it, leaving conflicting notes. The remedy is to turn the switch off on all but one device.

## Following changes made in Obsidian

When you do these inside Obsidian on this device, both files follow:

| You do | The plugin does |
|---|---|
| Rename or move a wrapped note | Renames or moves its PDF to match, and updates the marker property and the embed. |
| Rename or move the PDF | Renames or moves the note to match. |
| Rename or move a folder holding wrapped documents | Both files of each pair move together. |
| Delete a wrapped note | Deletes its PDF too, in the same way (see below). The PDF is kept if another note still claims it. |
| Duplicate a wrapped document (file menu on the note, or the command **Duplicate wrapped document**) | Copies both files, named the way Obsidian names copies (`Statement 1.md` and `Statement 1.pdf`), and points the copy at its own PDF. |

Other cases:

- Deleting only the PDF leaves the note. It is then listed as missing its PDF.
- Deleting a note whose pair is already broken does nothing to any PDF.
- If the partner cannot follow (for example the new name is already taken), your action stands, a notice says so, and the pair is listed.
- Copying a note by other means (for example in Finder) makes a second note pointing at the first note's PDF. It is listed with a fix that copies the PDF for it.

**Deleting follows your Obsidian setting.** The PDF is deleted the same way the note was: system trash, vault `.trash` folder, or permanent deletion, according to Settings, Files and links, Deleted files. If that is set to permanent deletion, the PDF is permanently deleted.

## Changes made outside Obsidian

The plugin acts on its own only for something you did inside Obsidian on this device. Anything else (a change made in Finder or by another app, delivered by sync, or made while Obsidian was closed) is never acted on. It is protected and listed, and you decide.

In particular the plugin never deletes a file because of a scan or because of something that arrived from outside. A PDF whose note disappears from outside Obsidian is kept and listed.

A scan never changes files. It runs a couple of seconds after startup and when you run **Check wrapped documents**.

## Needs attention

Run **Show documents needing attention** to open the list (**Check wrapped documents** checks first, then opens it). At startup a notice appears when the list is not empty. Each entry shows the file, its state, and the fixes available. The list is built to be usable on a phone.

| State shown | Meaning | Fixes |
|---|---|---|
| PDF not found. It may not have downloaded yet. | The PDF the note points at does not exist. | Choose a PDF (candidates are listed); Remove the claim |
| PDF has a different name | The PDF is beside the note under another name. | Rename PDF to match; Rename note to match |
| PDF is in another folder | The PDF exists elsewhere. | Move PDF beside note |
| Points at another document's PDF | The note is typically a copy. | Copy the PDF; Remove the claim |
| Shares a PDF with other notes | Several notes claim one PDF and none of them matches it. | Per note: move or rename the PDF to this note; Copy the PDF; Remove the claim |
| Its note was removed outside Obsidian | The PDF is left over. | Delete the PDF (asks first); Wrap; Keep as a plain PDF |
| Not wrapped | Shown only when automatic wrapping is on for this device. | Wrap |

**Fix all** covers misnamed and displaced entries that have one claimant and a free destination; **Wrap all** covers unwrapped PDFs. Neither appears when it would do nothing. Nothing destructive is ever the default.

The list of "note removed" entries is kept in the plugin's data so that it survives a restart. It is only a reminder; losing it loses nothing else.

## One row in the file explorer

With **Hide paired PDF files in the file explorer** on (the default), the PDF row of every healthy pair is hidden in the core file explorer, and the note's row shows a small "PDF" marker. This is done with generated styling rules only; the plugin does not touch the explorer's internals. If an Obsidian update defeats the hiding, you simply see two rows; pairing is unaffected.

Limits:

- It applies to the **core file explorer only**. The PDF still appears in the quick switcher, search, the graph and third-party explorers.
- Popout windows are not styled.
- Not yet checked after a restart or on a phone (see [Status](#status)).

## Settings

| Setting | Default | What it does |
|---|---|---|
| **PDF template** | empty | Template file used when wrapping. May be empty; a default is created on first wrap. |
| **Marker property** | `wrapped-pdf` | Frontmatter property that marks a note as wrapping a PDF. Changing it does not rename the property in existing notes, so they stop being recognised until you update them. |
| **Wrap new PDFs automatically** | off | See [Automatic wrapping](#automatic-wrapping). This device only. |
| **Hide paired PDF files in the file explorer** | on | See above. |
| **Delete the PDF when its note is deleted in Obsidian** | on | Turn off to never have a PDF deleted by the plugin; it is kept and listed instead. |
| **Rename and move the PDF with its note** | on | Turn off to stop renames and moves from following; the pair is listed instead. |

## Templates

You do not have to set anything up.

- **No template configured:** the plugin creates `Templates/Wrapped PDF.md` and saves its path in the **PDF template** setting. If you have set a Templater template folder, or failing that a core Templates folder, it is created there instead. The default contains the marker property in frontmatter and one line embedding the PDF (`![[{{title}}.pdf]]`). It needs neither Templater nor the core Templates plugin.
- **Template path set but the file is missing:** the default is created at that path.
- **Template missing the marker property or a PDF embed:** each time you wrap, the template is checked and whatever is missing is added by inserting text (one line in the frontmatter, or a frontmatter block if there is none; an embed line at the end). You are told what was added. The frontmatter is never parsed and rewritten, because that can break Templater expressions, so the rest of the template stays exactly as it was. An embed of any `.pdf`, or of a target containing a placeholder (`{{...}}` or `<% ... %>`), counts as present.
- If any of this cannot be done, the wrap stops and a notice names the file and the reason.

Placeholders are resolved by Templater when it is installed. Otherwise the core Templates placeholders `{{title}}`, `{{date}}` and `{{time}}` are used.

The plugin no longer reads or writes the `attachment` / `attachments` properties. If you like to keep an `attachments` list, put it in your template; Obsidian's own link updating keeps it current on rename.

## Sync

- **Automatic wrapping is per device**, so you can run it on every device and fall back to a single one if conflicting notes appear.
- Changes that arrive by sync are never followed. A device that only receives a rename does not repeat it, so two devices cannot both rename the same PDF. If a pair looks broken after a sync it is re-checked after a short wait, and it drops off the list if sync has since completed it.
- A PDF the sync service has not downloaded yet (iCloud can leave files in the cloud) looks like a missing PDF. The entry says so, and nothing destructive is the default.
- Deletes made inside Obsidian follow your Obsidian "Deleted files" setting, which may be permanent deletion.
- If two devices both find no template before settings have synced, each creates the default one. The contents are identical; the worst case is a duplicate file.
- Make sure the marker property name is the same on every device. A device with a different name does not recognise the pairs and leaves them alone.

### What following relies on, and how it could go wrong

Following renames, moves and deletes relies on the plugin telling a change you made inside Obsidian on this device apart from one made in Finder or delivered by sync. It does this by noting the changes that go through Obsidian's own file methods.

**This has not been verified on any sync setup**, including iCloud and Obsidian Sync. If it misfires, you could see:

- a duplicated or conflicting file after a rename, or
- a PDF moved to the trash (or deleted) when its note was not deleted by you.

If you see either, turn off:

- **Delete the PDF when its note is deleted in Obsidian**, and
- **Rename and move the PDF with its note**.

With both off the plugin never renames, moves or deletes your files on its own. Broken pairs are listed with one-click fixes instead.

## Known limits

- Hiding applies to the core file explorer only; the PDF still appears in the quick switcher, search, graph and third-party explorers. Popout windows are not styled.
- One PDF per document. Other file types are not supported.
- Existing hand-wrapped notes are not adopted. A note is recognised only if it has the marker property and its PDF sits beside it with the same name. Notes that keep the PDF in an attachment folder under `attachments` are ignored until you move each PDF beside its note and add the marker property.
- A PDF copied or renamed outside Obsidian is listed, not followed.
- Filling the note's properties from the PDF's contents is not part of this plugin.

## Installation

The plugin is not in the community plugin directory. Install it manually:

1. Build `main.js` (see below) and take it with `manifest.json` and `styles.css` from the repository root. Version 2.0.0 has not been released yet, so the [releases page](https://github.com/kenlefeb/obsidian-pdf/releases) only has the old 1.0.0 behaviour.
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
