import { Notice, Plugin, TFile } from 'obsidian';
import { mergeSettings, type PdfWrapperSettings } from "./core/settings-data.ts";
import { PdfWrapperSettingTab } from "./settings.ts";
import { existingSiblingNote, wrapPdf, WrapMessage } from "./pdf-wrapper.ts";
import { isNote, isPdf } from "./core/paths.ts";
import { LocalIntent } from "./obsidian/local-intent.ts";
import { OwnChanges } from "./core/marks.ts";
import { Executor } from "./obsidian/execute.ts";
import { Watcher } from "./obsidian/watcher.ts";
import { AttentionStore, attachmentFolder, scanAtStartup } from "./obsidian/attention-store.ts";
import { AutoWrapper, isAutoWrapOn } from "./obsidian/auto-wrap.ts";
import { AttentionModal } from "./ui/attention-modal.ts";
import { attentionNotice } from "./core/attention.ts";
import { duplicateWrapped, healthyPdf } from "./obsidian/duplicate.ts";
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
		const store = new AttentionStore(this, executor, () => isAutoWrapOn(this.app));
		const autoWrapper = new AutoWrapper(
			this.app,
			executor,
			() => this.settings,
			() => attachmentFolder(this.app),
			() => void store.refresh(),
		);
		this.register(() => autoWrapper.unload());
		const watcher = new Watcher(this, {
			localIntent,
			own,
			executor,
			getSettings: () => this.settings,
			onRecheck: (paths) => void store.refresh(paths),
			onPdfCreated: (path) => {
				if (isAutoWrapOn(this.app)) autoWrapper.onPdfCreated(path);
			},
		});
		watcher.start();

		const showAttention = () => new AttentionModal(this.app, store).open();
		this.addCommand({
			id: 'show-needs-attention',
			name: 'Show documents needing attention',
			callback: showAttention,
		});
		this.addCommand({
			id: 'scan-pairs',
			name: 'Check wrapped documents',
			callback: () => {
				void store.refresh().then(showAttention);
			},
		});
		this.app.workspace.onLayoutReady(() => {
			scanAtStartup(this, store, (count) => {
				const notice = new Notice(attentionNotice(count));
				notice.messageEl.addEventListener('click', () => {
					notice.hide();
					showAttention();
				});
			});
		});

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

		this.addCommand({
			id: 'duplicate-wrapped-document',
			name: 'Duplicate wrapped document',
			checkCallback: (checking) => {
				const file = this.app.workspace.getActiveFile();
				if (!file || !isNote(file.path) || !healthyPdf(this.app, this.settings, file)) return false;
				if (!checking) void duplicateWrapped(this.app, executor, this.settings, file, () => void store.refresh());
				return true;
			},
		});

		this.registerEvent(
			this.app.workspace.on('file-menu', (menu, file) => {
				if (file instanceof TFile && isNote(file.path) && healthyPdf(this.app, this.settings, file)) {
					menu.addItem((item) => {
						item.setTitle('Duplicate wrapped document')
							.setIcon('copy')
							.onClick(() => void duplicateWrapped(this.app, executor, this.settings, file, () => void store.refresh()));
					});
				}
				if (file instanceof TFile && isPdf(file.path)) {
					menu.addItem((item) => {
						item.setTitle('Wrap PDF')
							.setIcon('file-text')
							.onClick(() => this.handleWrapPdf(file));
					});
				}
			})
		);

		this.addSettingTab(new PdfWrapperSettingTab(this.app, this, () => void store.refresh()));
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
