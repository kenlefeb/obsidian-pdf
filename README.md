# Wrap PDF

An [Obsidian](https://obsidian.md) plugin that wraps PDF files in markdown notes using a configurable template.

## What it does

Right-click any PDF in the file explorer and select **Wrap PDF**. The plugin will:

1. Move the PDF to your vault's configured attachment folder (Settings > Files and links > Default location for new attachments)
2. Create a markdown note with the same name in the PDF's original location, using your chosen template
3. Resolve template placeholders via [Templater](https://github.com/SilentVoid13/Templater) (if installed) or the core Templates plugin
4. Set any `attachment` or `attachments` frontmatter property to a wikilink pointing to the moved PDF
5. Update embed links (`![[file.pdf]]`) in the note to point to the PDF's new location

## Setup

1. Install and enable the plugin
2. Go to **Settings > Wrap PDF** and select a template file
3. Make sure your "Default location for new attachments" is configured in **Settings > Files and links**

## Template tips

Your template can use any Templater or core Templates placeholders. If you want the note to track the PDF attachment, include a frontmatter property:

```yaml
---
attachment:
---
```

Or as an array (useful if the note may have multiple attachments):

```yaml
---
attachments: []
---
```

To embed the PDF in the note body, include:

```markdown
![[{{title}}.pdf]]
```

The plugin will automatically update this to point to the moved PDF's location.

## Installation

### From Community Plugins

1. Open **Settings > Community plugins**
2. Select **Browse** and search for "Wrap PDF"
3. Select **Install**, then **Enable**

### Manual

1. Download `main.js`, `manifest.json` from the [latest release](https://github.com/kenlefeb/obsidian-pdf/releases/latest)
2. Create a folder `<vault>/.obsidian/plugins/wrap-pdf/`
3. Copy the downloaded files into that folder
4. Reload Obsidian and enable the plugin in **Settings > Community plugins**

## License

[0-BSD](LICENSE)
