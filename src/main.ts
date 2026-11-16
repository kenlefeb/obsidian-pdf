import { Plugin } from 'obsidian';
import { mergeSettings, type PdfWrapperSettings } from "./core/settings-data.ts";
import { PdfWrapperSettingTab } from "./settings.ts";
import { LocalIntent } from "./obsidian/local-intent.ts";
import { OwnChanges } from "./core/marks.ts";
import { Executor } from "./obsidian/execute.ts";
import { SETTLE_MS, Watcher } from "./obsidian/watcher.ts";
import { createRefreshScheduler } from "./core/refresh-scheduler.ts";
import { installExplorerStyle } from "./obsidian/explorer-style.ts";
import { AttentionStore, attachmentFolder, scanAtStartup } from "./obsidian/attention-store.ts";
import { AutoWrapper, isAutoWrapOn } from "./obsidian/auto-wrap.ts";
import { registerCommands, showStartupNotice } from "./obsidian/commands.ts";
import { registerPdfBlock } from "./obsidian/pdf-block.ts";

export default class PdfWrapperPlugin extends Plugin {
	settings!: PdfWrapperSettings;

	async onload() {
		await this.loadSettings();
		let unloaded = false;
		this.register(() => {
			unloaded = true;
		});

		const localIntent = new LocalIntent(this.app);
		this.register(localIntent.install());
		const own = new OwnChanges();

		// Anything the plugin does that can change pairs ends in a refresh, so the explorer rules never go stale.
		// The metadata cache can lag a frontmatter write, so look once more after the settle period.
		let refreshSoon: () => void = () => undefined;
		const executor = new Executor(this.app, () => this.settings, () => this.saveSettings(), own, () => refreshSoon());
		const store = new AttentionStore(this, executor, () => isAutoWrapOn(this.app));
		const scheduler = createRefreshScheduler(() => store.refresh(), SETTLE_MS, {
			set: (fn, ms) => window.setTimeout(fn, ms),
			clear: (handle) => window.clearTimeout(handle as number),
		});
		refreshSoon = () => scheduler.request();
		this.register(() => scheduler.cancel());
		const explorerStyle = installExplorerStyle(this, store, () => this.settings.hidePairedPdfs);
		const autoWrapper = new AutoWrapper(
			this.app,
			executor,
			() => this.settings,
			() => attachmentFolder(this.app),
			() => refreshSoon(),
		);
		this.register(() => autoWrapper.unload());
		const watcher = new Watcher(this, {
			localIntent,
			own,
			executor,
			getSettings: () => this.settings,
			onRecheck: (paths) => void store.refresh(paths),
			onPdfCreated: (path, local) => {
				if (isAutoWrapOn(this.app)) autoWrapper.onPdfCreated(path, local);
			},
			isListReady: () => store.hasScanned(),
			listedClaim: (notePath) => store.listedClaim(notePath),
			refreshSoon: () => refreshSoon(),
		});
		watcher.start();

		registerPdfBlock(this);

		const commands = registerCommands(this, { executor, store, refreshSoon: () => refreshSoon() });
		this.app.workspace.onLayoutReady(() => {
			// Disabled before the layout was ready: start nothing.
			if (unloaded) return;
			scanAtStartup(this, store, (count) => showStartupNotice(count, commands.showAttention));
		});

		this.addSettingTab(new PdfWrapperSettingTab(this.app, this, {
			onAutoWrapChanged: () => void store.refresh(),
			onHideChanged: () => explorerStyle.rebuild(),
			onMarkerChanged: () => void store.refresh(),
		}));
	}

	async loadSettings() {
		this.settings = mergeSettings(await this.loadData());
	}

	async saveSettings() {
		await this.saveData(this.settings);
	}
}
