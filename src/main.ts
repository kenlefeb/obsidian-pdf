import { Notice, Plugin, TFile } from 'obsidian';
import { DEFAULT_SETTINGS, WrapPdfSettings, WrapPdfSettingTab } from "./settings";
import { wrapPdf } from "./wrap-pdf";

export default class WrapPdfPlugin extends Plugin {
	settings: WrapPdfSettings;

	async onload() {
		await this.loadSettings();

		this.registerEvent(
			this.app.workspace.on('file-menu', (menu, file) => {
				if (file instanceof TFile && file.extension === 'pdf') {
					menu.addItem((item) => {
						item.setTitle('Wrap PDF')
							.setIcon('file-text')
							.onClick(() => this.handleWrapPdf(file));
					});
				}
			})
		);

		this.addSettingTab(new WrapPdfSettingTab(this.app, this));
	}

	private async handleWrapPdf(pdfFile: TFile) {
		if (!this.settings.templatePath) {
			// eslint-disable-next-line obsidianmd/ui/sentence-case
			new Notice('No PDF template configured. Set one in Wrap PDF settings.');
			return;
		}

		try {
			await wrapPdf(this.app, this.settings, pdfFile);
			new Notice(`Wrapped ${pdfFile.basename}`);
		} catch (e) {
			new Notice(`Failed to wrap PDF: ${e instanceof Error ? e.message : String(e)}`);
			console.error('Wrap PDF error:', e);
		}
	}

	async loadSettings() {
		this.settings = Object.assign({}, DEFAULT_SETTINGS, await this.loadData() as Partial<WrapPdfSettings>);
	}

	async saveSettings() {
		await this.saveData(this.settings);
	}
}
