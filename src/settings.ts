import { AbstractInputSuggest, App, PluginSettingTab, Setting, TFile } from "obsidian";
import type PdfWrapperPlugin from "./main.ts";

interface VaultWithConfig {
	getConfig(key: string): unknown;
}

export class PdfWrapperSettings {
	templatePath = "";
	private _attachmentsPath?: string;

	constructor(private app: App) {}

	get attachmentsPath(): string {
		if (this._attachmentsPath === undefined) {
			const raw = (this.app.vault as unknown as VaultWithConfig).getConfig("attachmentFolderPath");
			this._attachmentsPath = typeof raw === "string" ? raw : "";
		}
		return this._attachmentsPath;
	}

	set attachmentsPath(value: string) {
		this._attachmentsPath = value;
	}
}

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
