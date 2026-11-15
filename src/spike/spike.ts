// Throwaway spike code (plan task 5). Remove once the spike results are recorded.
import { Modal, Notice, Platform, Setting, TFile, type App, type Plugin, type TAbstractFile } from "obsidian";
import { buildExplorerCss } from "../core/explorer-css.ts";
import type { LocalIntent } from "../obsidian/local-intent.ts";

const LOG_PREFIX = "pdf-wrapper-spike-log-";
const DUMMY_FOLDER = "_pdf-wrapper-spike";
const DEVICE_ID_KEY = "pdf-wrapper-spike-device-id";
const LOG_ON_KEY = "pdf-wrapper-spike-log-on";
const HIDING_ON_KEY = "pdf-wrapper-spike-hiding-on";
/** Events inside the dummy folder are ignored this long after a dummy-pair command finishes. */
const DUMMY_GRACE_MS = 3000;
/** A `delete` and a `deleted` for the same path within this time share one local value. */
const DELETE_PAIR_MS = 5000;
const FLUSH_DELAY_MS = 1000;

const LOG_HEADER = [
	"# PDF Wrapper spike log. One event per line. Fields are separated by a tab, in this order:",
	"# time\tdevice\tdeviceId\tevent\tpath\toldPath\tlocal\tnewPathLocal\tpdfSize",
	"# time: ISO 8601, UTC. device: desktop or mobile. deviceId: random id of this device.",
	"# event: create, rename, delete (vault events), deleted (metadata cache), log-start (logging switched on or Obsidian started with logging on).",
	"# oldPath: rename only. local: LocalIntent.consume(path); for rename, consume(oldPath).",
	"# A delete and a deleted for the same path within 5 s share one local value, because the first call uses up the mark.",
	"# newPathLocal: rename only, LocalIntent.consume(new path). pdfSize: stat.size in bytes of a PDF file (0 = empty file).",
	"# '-' means not applicable.",
	"",
].join("\n");

export function registerSpike(plugin: Plugin, localIntent: LocalIntent): void {
	const spike = new Spike(plugin, localIntent);
	plugin.addCommand({ id: "spike-toggle-event-log", name: "Spike: toggle event log", callback: () => spike.toggleLog() });
	plugin.addCommand({ id: "spike-create-dummy-pairs", name: "Spike: create dummy pairs", callback: () => spike.promptDummyPairs() });
	plugin.addCommand({ id: "spike-toggle-dummy-hiding", name: "Spike: toggle hiding of dummy PDF files", callback: () => spike.toggleHiding() });
	plugin.addCommand({ id: "spike-remove-dummy-pairs", name: "Spike: remove dummy pairs", callback: () => void spike.removeDummyPairs() });
	plugin.app.workspace.onLayoutReady(() => spike.start());
	plugin.register(() => spike.stop());
}

class Spike {
	private readonly app: App;
	private readonly device = Platform.isMobile ? "mobile" : "desktop";
	private readonly deviceId: string;
	private readonly logPath: string;
	private logOn: boolean;
	private buffer: string[] = [];
	private flushTimer: number | null = null;
	private writing: Promise<void> = Promise.resolve();
	private recentDeletes = new Map<string, { event: string; local: boolean; at: number }>();
	private dummyBusy = false;
	private dummyGraceUntil = 0;
	private sheet: CSSStyleSheet | null = null;

	constructor(private readonly plugin: Plugin, private readonly localIntent: LocalIntent) {
		this.app = plugin.app;
		let id: unknown = this.app.loadLocalStorage(DEVICE_ID_KEY);
		if (typeof id !== "string" || id === "") {
			id = Math.random().toString(36).slice(2, 8);
			this.app.saveLocalStorage(DEVICE_ID_KEY, id);
		}
		this.deviceId = id as string;
		this.logPath = `${LOG_PREFIX}${this.device}-${this.deviceId}.md`;
		this.logOn = this.app.loadLocalStorage(LOG_ON_KEY) === true;
	}

	/** Runs once the layout is ready, so the `create` events fired for every file on load are not logged. */
	start(): void {
		const { vault, metadataCache } = this.app;
		this.plugin.registerEvent(vault.on("create", (file) => this.onEvent("create", file, "-")));
		this.plugin.registerEvent(vault.on("rename", (file, oldPath) => this.onEvent("rename", file, oldPath)));
		this.plugin.registerEvent(vault.on("delete", (file) => this.onEvent("delete", file, "-")));
		this.plugin.registerEvent(metadataCache.on("deleted", (file) => this.onEvent("deleted", file, "-")));
		if (this.logOn) this.writeLine("log-start", "-", "-", "-", "-", "-");
		if (this.app.loadLocalStorage(HIDING_ON_KEY) === true) this.applyHiding();
	}

	stop(): void {
		this.removeHiding();
		void this.flush();
	}

	toggleLog(): void {
		this.logOn = !this.logOn;
		this.app.saveLocalStorage(LOG_ON_KEY, this.logOn);
		if (this.logOn) {
			this.writeLine("log-start", "-", "-", "-", "-", "-");
			new Notice(`Spike event log is on. Writing to ${this.logPath}`);
		} else {
			void this.flush();
			new Notice("Spike event log is off.");
		}
	}

	private onEvent(event: string, file: TAbstractFile, oldPath: string): void {
		if (!this.logOn || this.isIgnored(file.path) || this.isIgnored(oldPath)) return;

		let local: boolean;
		let newPathLocal = "-";
		if (event === "rename") {
			local = this.localIntent.consume(oldPath);
			newPathLocal = String(this.localIntent.consume(file.path));
		} else if (event === "delete" || event === "deleted") {
			local = this.deleteLocal(event, file.path);
		} else {
			local = this.localIntent.consume(file.path);
		}
		const pdfSize = file instanceof TFile && file.extension.toLowerCase() === "pdf" ? String(file.stat.size) : "-";
		this.writeLine(event, file.path, oldPath, String(local), newPathLocal, pdfSize);
	}

	/** The vault `delete` and the metadata cache `deleted` for one note share a single consume. */
	private deleteLocal(event: string, path: string): boolean {
		const now = Date.now();
		const earlier = this.recentDeletes.get(path);
		if (earlier && earlier.event !== event && now - earlier.at < DELETE_PAIR_MS) {
			this.recentDeletes.delete(path);
			return earlier.local;
		}
		const local = this.localIntent.consume(path);
		this.recentDeletes.set(path, { event, local, at: now });
		return local;
	}

	private isIgnored(path: string): boolean {
		if (path.startsWith(LOG_PREFIX)) return true;
		const inDummyFolder = path === DUMMY_FOLDER || path.startsWith(`${DUMMY_FOLDER}/`);
		return inDummyFolder && (this.dummyBusy || Date.now() < this.dummyGraceUntil);
	}

	private writeLine(event: string, path: string, oldPath: string, local: string, newPathLocal: string, pdfSize: string): void {
		const fields = [new Date().toISOString(), this.device, this.deviceId, event, path, oldPath, local, newPathLocal, pdfSize];
		this.buffer.push(fields.map((field) => field.replace(/[\t\r\n]/g, " ")).join("\t"));
		if (this.flushTimer === null) {
			this.flushTimer = window.setTimeout(() => void this.flush(), FLUSH_DELAY_MS);
		}
	}

	private flush(): Promise<void> {
		if (this.flushTimer !== null) {
			window.clearTimeout(this.flushTimer);
			this.flushTimer = null;
		}
		const lines = this.buffer.splice(0);
		if (lines.length === 0) return this.writing;
		const text = `${lines.join("\n")}\n`;
		this.writing = this.writing
			.then(async () => {
				const file = this.app.vault.getFileByPath(this.logPath);
				if (file) await this.app.vault.append(file, text);
				else await this.app.vault.create(this.logPath, LOG_HEADER + text);
			})
			.catch((error: unknown) => console.error("PDF Wrapper spike: could not write the log", error));
		return this.writing;
	}

	promptDummyPairs(): void {
		new CountModal(this.app, (count) => void this.createDummyPairs(count)).open();
	}

	private async createDummyPairs(count: number): Promise<void> {
		const { vault } = this.app;
		this.dummyBusy = true;
		const progress = new Notice(`Creating ${count} dummy pairs…`, 0);
		try {
			if (!vault.getFolderByPath(DUMMY_FOLDER)) await vault.createFolder(DUMMY_FOLDER);
			for (let n = 1; n <= count; n++) {
				const base = `${DUMMY_FOLDER}/Doc ${n}`;
				if (!vault.getFileByPath(`${base}.md`)) await vault.create(`${base}.md`, "");
				if (!vault.getFileByPath(`${base}.pdf`)) await vault.createBinary(`${base}.pdf`, new ArrayBuffer(0));
				if (n % 100 === 0) progress.setMessage(`Created ${n} of ${count} dummy pairs…`);
			}
			new Notice(`Done. ${DUMMY_FOLDER} holds dummy pairs Doc 1 to Doc ${count}.`);
		} catch (error) {
			console.error("PDF Wrapper spike: could not create dummy pairs", error);
			new Notice(`Could not create dummy pairs: ${error instanceof Error ? error.message : String(error)}`);
		} finally {
			progress.hide();
			this.endDummyWork();
		}
	}

	async removeDummyPairs(): Promise<void> {
		const folder = this.app.vault.getFolderByPath(DUMMY_FOLDER);
		if (!folder) {
			new Notice(`There is no ${DUMMY_FOLDER} folder to remove.`);
			return;
		}
		this.dummyBusy = true;
		try {
			await this.app.fileManager.trashFile(folder);
			new Notice(`Removed the ${DUMMY_FOLDER} folder.`);
		} catch (error) {
			console.error("PDF Wrapper spike: could not remove dummy pairs", error);
			new Notice(`Could not remove dummy pairs: ${error instanceof Error ? error.message : String(error)}`);
		} finally {
			this.endDummyWork();
		}
	}

	private endDummyWork(): void {
		this.dummyBusy = false;
		this.dummyGraceUntil = Date.now() + DUMMY_GRACE_MS;
		if (this.sheet) this.applyHiding();
	}

	toggleHiding(): void {
		if (this.sheet) {
			this.removeHiding();
			this.app.saveLocalStorage(HIDING_ON_KEY, false);
			new Notice("Dummy PDF files are shown.");
		} else {
			const count = this.applyHiding();
			this.app.saveLocalStorage(HIDING_ON_KEY, true);
			new Notice(`Hiding ${count} dummy PDF files.`);
		}
	}

	/** Builds (or rebuilds) the stylesheet from the dummy pairs now in the vault. Returns the pair count. */
	private applyHiding(): number {
		const pairs: { notePath: string; pdfPath: string }[] = [];
		const folder = this.app.vault.getFolderByPath(DUMMY_FOLDER);
		for (const child of folder?.children ?? []) {
			if (!(child instanceof TFile) || child.extension !== "md") continue;
			const pdfPath = `${DUMMY_FOLDER}/${child.basename}.pdf`;
			if (this.app.vault.getFileByPath(pdfPath)) pairs.push({ notePath: child.path, pdfPath });
		}
		if (!this.sheet) {
			this.sheet = new CSSStyleSheet();
			document.adoptedStyleSheets = [...document.adoptedStyleSheets, this.sheet];
		}
		this.sheet.replaceSync(buildExplorerCss(pairs, { hide: true }));
		return pairs.length;
	}

	private removeHiding(): void {
		const sheet = this.sheet;
		if (!sheet) return;
		document.adoptedStyleSheets = document.adoptedStyleSheets.filter((s) => s !== sheet);
		this.sheet = null;
	}
}

class CountModal extends Modal {
	constructor(app: App, private readonly onSubmit: (count: number) => void) {
		super(app);
	}

	onOpen(): void {
		this.setTitle("Create dummy pairs");
		let value = "300";
		new Setting(this.contentEl)
			.setName("Number of pairs")
			.setDesc("Creates a note and an empty PDF file for each pair in the spike folder at the vault root. Pairs that already exist are kept.")
			.addText((text) => {
				text.inputEl.type = "number";
				text.setValue(value).onChange((v) => (value = v));
			});
		new Setting(this.contentEl).addButton((button) =>
			button
				.setButtonText("Create")
				.setCta()
				.onClick(() => {
					const count = Number.parseInt(value, 10);
					if (!Number.isInteger(count) || count < 1) {
						new Notice("Enter a whole number of 1 or more.");
						return;
					}
					this.close();
					this.onSubmit(count);
				}),
		);
	}

	onClose(): void {
		this.contentEl.empty();
	}
}
