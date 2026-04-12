import { Notice, Plugin, TFile } from 'obsidian';
import { PdfWrapperSettings, PdfWrapperSettingTab } from "./settings.ts";
import { wrapPdf } from "./pdf-wrapper.ts";

export default class PdfWrapperPlugin extends Plugin {
	settings!: PdfWrapperSettings;

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

		this.addSettingTab(new PdfWrapperSettingTab(this.app, this));
	}

	private async handleWrapPdf(pdfFile: TFile) {
		if (!this.settings.templatePath) {
			new Notice('No PDF template configured. Set one in PDF wrapper settings.');
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
		this.settings = new PdfWrapperSettings(this.app);
		Object.assign(this.settings, await this.loadData() as Partial<PdfWrapperSettings>);
	}

	async saveSettings() {
		await this.saveData(this.settings);
	}
}
