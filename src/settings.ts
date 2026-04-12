import { AbstractInputSuggest, App, PluginSettingTab, Setting, TFile } from "obsidian";
import type WrapPdfPlugin from "./main";

export interface WrapPdfSettings {
	templatePath: string;
}

export const DEFAULT_SETTINGS: WrapPdfSettings = {
	templatePath: '',
};

export class WrapPdfSettingTab extends PluginSettingTab {
	plugin: WrapPdfPlugin;

	constructor(app: App, plugin: WrapPdfPlugin) {
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
