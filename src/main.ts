import { Notice, Plugin, TFile } from 'obsidian';
import { mergeSettings, type PdfWrapperSettings } from "./core/settings-data.ts";
import { PdfWrapperSettingTab } from "./settings.ts";
import { existingSiblingNote, wrapPdf, WrapMessage } from "./pdf-wrapper.ts";
import { isPdf } from "./core/paths.ts";
import { LocalIntent } from "./obsidian/local-intent.ts";
import { Executor, OwnChanges } from "./obsidian/execute.ts";
import { Watcher } from "./obsidian/watcher.ts";
import { registerSpike } from "./spike/spike.ts";

export default class PdfWrapperPlugin extends Plugin {
	settings!: PdfWrapperSettings;

	async onload() {
		await this.loadSettings();

		const localIntent = new LocalIntent(this.app);
		this.register(localIntent.install());
		const own = new OwnChanges();
		registerSpike(this, localIntent, own);

		const executor = new Executor(this.app, () => this.settings, () => this.saveSettings(), own);
		const watcher = new Watcher(this, {
			localIntent,
			own,
			executor,
			getSettings: () => this.settings,
			onRecheck: () => {}, // A later task supplies the scan.
		});
		watcher.start();

		this.addCommand({
			id: 'wrap-active-pdf',
			name: 'Wrap active PDF',
			checkCallback: (checking) => {
				const file = this.app.workspace.getActiveFile();
				if (!file || !isPdf(file.path)) return false;
				if (existingSiblingNote(this.app, file)) return false;
				if (!checking) void this.handleWrapPdf(file);
				return true;
			},
		});

		this.registerEvent(
			this.app.workspace.on('file-menu', (menu, file) => {
				if (file instanceof TFile && isPdf(file.path)) {
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
		try {
			await wrapPdf(this.app, this.settings, () => this.saveSettings(), pdfFile, { open: true });
			new Notice(`Wrapped ${pdfFile.basename}`);
		} catch (e) {
			if (e instanceof WrapMessage) {
				new Notice(e.message);
				return;
			}
			new Notice(`Failed to wrap ${pdfFile.name}: ${e instanceof Error ? e.message : String(e)}`);
			console.error('PDF Wrapper: failed to wrap', pdfFile.path, e);
		}
	}

	async loadSettings() {
		this.settings = mergeSettings(await this.loadData());
	}

	async saveSettings() {
		await this.saveData(this.settings);
	}
}
