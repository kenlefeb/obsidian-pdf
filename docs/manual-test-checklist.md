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

## No prerequisites

- [ ] Fresh install, no template set, no Templater or core Templates folder: wrapping creates `Templates/Wrapped PDF.md`, a notice names it, the template setting shows `Templates/Wrapped PDF`, and the new note shows the PDF.
- [ ] Same, with a Templater template folder set: the default appears in that folder.
- [ ] Same, with no Templater folder but a core Templates folder set: the default appears in that folder.
- [ ] No template set, but a file already exists at the default path: it is used, not overwritten, and the setting is filled.
- [ ] Template setting pointing at a deleted file: a default appears at that path, a notice says so, and the setting is unchanged.
- [ ] A template with no frontmatter and no embed gains both, and a notice says what was added.
- [ ] A Templater template with `<% %>` expressions in its frontmatter but no marker gains only the marker line; everything else in the file is unchanged byte for byte.
- [ ] Wrapping again with the repaired template adds nothing and shows no "Updated the template" notice.
- [ ] A folder named like the template path (for example a folder `Templates/Wrapped PDF.md`) makes the wrap fail with a notice naming that path.
