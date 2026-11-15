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
- [ ] Failure after the note exists: with Templater, use a template whose frontmatter has `title: <% tp.file.title %>` (unquoted), and wrap a PDF named `Report: 2024.pdf`. The notice says `Created Report: 2024.md but could not mark it as wrapping Report: 2024.pdf: <reason>. Fix or delete the note, then wrap again.`, the note is still there without the marker, and after deleting it a second wrap (with a fixed template) works.
- [ ] With Templater, a template that renames its own note (`tp.file.rename`) or moves it (`tp.file.move`): the note ends beside the PDF and is marked. If the rename back fails (for example, the moved note's original path was taken meanwhile), the notice starts "Created <where the note is> but could not mark it". Confirms that `fileManager.renameFile` onto an existing path throws rather than overwrites.
- [ ] With Templater, a template whose code throws (for example `<% tp.user.missing() %>`): note what happens. Templater may show its own error; the plugin then creates the note without Templater, or, if Templater left a file behind, says "Created <path> but could not mark it …". Record which.
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
