import { AbstractInputSuggest, App, PluginSettingTab, Setting, TFile } from "obsidian";
import { DEFAULT_SETTINGS } from "./core/settings-data.ts";
import type PdfWrapperPlugin from "./main.ts";
import { isAutoWrapOn, setAutoWrap } from "./obsidian/auto-wrap.ts";

export type { PdfWrapperSettings } from "./core/settings-data.ts";

/** What the rest of the plugin must do when a setting changes. */
export interface SettingCallbacks {
	/** Unwrapped entries appear or disappear with the automatic-wrapping switch. */
	onAutoWrapChanged: () => void;
	onHideChanged: () => void;
	/** A committed change of the marker property: pairs must be read again under the new name. */
	onMarkerChanged: () => void;
}

export class PdfWrapperSettingTab extends PluginSettingTab {
	plugin: PdfWrapperPlugin;
	/** Saves what is typed in the marker field; set while the tab is shown. */
	private commitMarker: (() => Promise<void>) | null = null;

	constructor(app: App, plugin: PdfWrapperPlugin, private readonly callbacks: SettingCallbacks) {
		super(app, plugin);
		this.plugin = plugin;
	}

	hide(): void {
		// Closing the settings while the marker field has focus may not blur it first.
		this.commitMarker?.().catch((error: unknown) => console.error("PDF Wrapper: could not save the marker property", error));
		this.commitMarker = null;
		super.hide();
	}

	display(): void {
		const { containerEl } = this;
		containerEl.empty();

		new Setting(containerEl)
			.setName('PDF template')
			.setDesc('Path to the template file used when wrapping a PDF')
			.addSearch(search => {
				new MarkdownFileSuggest(this.app, search.inputEl);
				search
					.setPlaceholder('Search for a template file')
					.setValue(this.plugin.settings.templatePath)
					.onChange(async (value) => {
						this.plugin.settings.templatePath = value;
						await this.plugin.saveSettings();
					});
			});

		new Setting(containerEl)
			.setName('Marker property')
			.setDesc('Frontmatter property that marks a note as wrapping a PDF. Changing this does not rename the property in existing notes, so they stop being recognised until you update them.')
			.addText(text => {
				text.setPlaceholder(DEFAULT_SETTINGS.markerProperty).setValue(this.plugin.settings.markerProperty);
				// Committed when the field loses focus, not per keystroke: a wrap that ran while "pdf-doc" was being typed
				// would otherwise add a "pd:" line to the template and mark the note "pd".
				const commit = async () => {
					const value = text.getValue().trim() || DEFAULT_SETTINGS.markerProperty;
					// An emptied field falls back to the default; show it.
					if (text.getValue() !== value) text.setValue(value);
					if (value === this.plugin.settings.markerProperty) return;
					this.plugin.settings.markerProperty = value;
					await this.plugin.saveSettings();
					this.callbacks.onMarkerChanged();
				};
				this.commitMarker = commit;
				text.inputEl.addEventListener("blur", () => {
					commit().catch((error: unknown) => console.error("PDF Wrapper: could not save the marker property", error));
				});
			});

		new Setting(containerEl)
			// eslint-disable-next-line obsidianmd/ui/sentence-case -- "PDFs" is an acronym plural; the text is the spec's wording.
			.setName('Wrap new PDFs automatically')
			// eslint-disable-next-line obsidianmd/ui/sentence-case -- as above.
			.setDesc('Applies to this device only. A PDF added inside Obsidian is wrapped after a couple of seconds; one that arrives from outside, such as from sync or another app, waits up to half a minute so that two devices do not both wrap it. PDFs that arrive while Obsidian is closed are listed for you to wrap.')
			.addToggle(toggle => toggle
				.setValue(isAutoWrapOn(this.app))
				.onChange((value) => {
					setAutoWrap(this.app, value);
					this.callbacks.onAutoWrapChanged();
				}));

		new Setting(containerEl)
			.setName('Hide paired PDF files in the file explorer')
			.addToggle(toggle => toggle
				.setValue(this.plugin.settings.hidePairedPdfs)
				.onChange(async (value) => {
					this.plugin.settings.hidePairedPdfs = value;
					this.callbacks.onHideChanged();
					await this.plugin.saveSettings();
				}));

		new Setting(containerEl)
			.setName('Delete the PDF when its note is deleted in Obsidian')
			// eslint-disable-next-line obsidianmd/ui/sentence-case -- "Finder" is the macOS app's name; the text is the spec's wording.
			.setDesc('When on, deleting a wrapped note inside Obsidian on this device also deletes its PDF, the same way the note was deleted. This relies on the plugin telling your own deletions apart from ones made in Finder or delivered by sync. If a PDF is ever deleted when it should not be, turn this off: the PDF is then always kept and listed for you to decide.')
			.addToggle(toggle => toggle
				.setValue(this.plugin.settings.followDeletes)
				.onChange(async (value) => {
					this.plugin.settings.followDeletes = value;
					await this.plugin.saveSettings();
				}));

		new Setting(containerEl)
			.setName('Rename and move the PDF with its note')
			.setDesc('When on, renaming or moving a wrapped note or its PDF inside Obsidian on this device does the same to its partner. This relies on the same detection. If you see duplicated or conflicting files after renames, turn this off: the pair is then listed for you to fix with one click.')
			.addToggle(toggle => toggle
				.setValue(this.plugin.settings.followRenames)
				.onChange(async (value) => {
					this.plugin.settings.followRenames = value;
					await this.plugin.saveSettings();
				}));
	}
}

class MarkdownFileSuggest extends AbstractInputSuggest<TFile> {
	private inputEl: HTMLInputElement;

	constructor(app: App, inputEl: HTMLInputElement) {
		super(app, inputEl);
		this.inputEl = inputEl;
	}

	getSuggestions(query: string): TFile[] {
		const lower = query.toLowerCase();
		return this.app.vault.getMarkdownFiles()
			.filter(f => f.path.toLowerCase().includes(lower)
				|| f.basename.toLowerCase().includes(lower))
			.sort((a, b) => a.path.localeCompare(b.path))
			.slice(0, 20);
	}

	renderSuggestion(file: TFile, el: HTMLElement): void {
		el.setText(file.path.replace(/\.md$/i, ""));
	}

	selectSuggestion(file: TFile): void {
		const value = file.path.replace(/\.md$/i, "");
		this.setValue(value);
		this.inputEl.trigger("input");
		this.close();
	}
}
