import { AbstractInputSuggest, App, PluginSettingTab, Setting, TFile } from "obsidian";
import { DEFAULT_SETTINGS } from "./core/settings-data.ts";
import type PdfWrapperPlugin from "./main.ts";

export type { PdfWrapperSettings } from "./core/settings-data.ts";

export class PdfWrapperSettingTab extends PluginSettingTab {
	plugin: PdfWrapperPlugin;

	constructor(app: App, plugin: PdfWrapperPlugin) {
		super(app, plugin);
		this.plugin = plugin;
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
			.addText(text => text
				.setPlaceholder(DEFAULT_SETTINGS.markerProperty)
				.setValue(this.plugin.settings.markerProperty)
				.onChange(async (value) => {
					this.plugin.settings.markerProperty = value.trim() || DEFAULT_SETTINGS.markerProperty;
					await this.plugin.saveSettings();
				}));

		new Setting(containerEl)
			.setName('Hide paired PDF files in the file explorer')
			.addToggle(toggle => toggle
				.setValue(this.plugin.settings.hidePairedPdfs)
				.onChange(async (value) => {
					this.plugin.settings.hidePairedPdfs = value;
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
