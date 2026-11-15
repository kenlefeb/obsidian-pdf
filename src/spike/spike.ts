// Throwaway spike code (plan task 5). Remove once the spike results are recorded.
import { FuzzySuggestModal, Modal, Notice, Platform, Setting, TFile, TFolder, type App, type Plugin, type TAbstractFile } from "obsidian";
import { buildExplorerCss } from "../core/explorer-css.ts";
import type { OwnChanges } from "../obsidian/execute.ts";
import type { LocalIntent } from "../obsidian/local-intent.ts";

const LOG_PREFIX = "pdf-wrapper-spike-log-";
const DUMMY_FOLDER = "_pdf-wrapper-spike";
/** The folder the owner creates for spike 2 (see the checklist). */
const TEST_FOLDER = "Spike test";
const DEVICE_ID_KEY = "pdf-wrapper-spike-device-id";
const LOG_ON_KEY = "pdf-wrapper-spike-log-on";
const HIDING_ON_KEY = "pdf-wrapper-spike-hiding-on";
/** Events inside the dummy folder are ignored this long after a dummy-pair command finishes. */
const DUMMY_GRACE_MS = 3000;
/** A `delete` and a `deleted` for the same path within this time share one local value. */
const DELETE_PAIR_MS = 5000;
const FLUSH_DELAY_MS = 1000;

const FIELDS = ["time", "device", "deviceId", "event", "path", "oldPath", "local", "newPathLocal", "size", "kind", "mtime"] as const;
type Field = (typeof FIELDS)[number];

const LOG_HEADER = [
	"# PDF Wrapper spike log. One event per line. Fields are separated by a tab, in this order:",
	`# ${FIELDS.join("\t")}`,
	"# time: ISO 8601, UTC. device: desktop or mobile. deviceId: random id of this device (per vault).",
	"# event: create, rename, delete, modify (vault events; modify is logged for PDF files only), deleted (metadata cache),",
	"#   log-start (logging switched on, or Obsidian started with logging on),",
	"#   pair-rename (written just before the 'rename a test pair' command renames a note and then its PDF; path = new note path, oldPath = old note path),",
	"#   snapshot-start / snapshot-vault / snapshot-adapter / snapshot-end (the 'snapshot test files' command; vault = what Obsidian's file list holds,",
	"#   adapter = what vault.adapter.list and adapter.stat report on disk, including hidden files if the adapter lists them).",
	"# oldPath: rename only. local: LocalIntent.peek(path); for rename, peek(oldPath). Not called for modify or snapshot lines.",
	"# peek answers like consume but leaves the mark for the plugin's own Watcher. Events the plugin itself causes are logged too.",
	"# A delete and a deleted for the same path within 5 s share one local value.",
	"# newPathLocal: rename only, LocalIntent.peek(new path).",
	"# size: stat.size in bytes (0 = empty file); for create/rename/delete/modify only for PDF files; for snapshot lines every file.",
	"# kind: file or folder (snapshot lines). mtime: modification time, ISO 8601 UTC (snapshot lines).",
	"# '-' means not applicable or unknown.",
	"",
].join("\n");

export function registerSpike(plugin: Plugin, localIntent: LocalIntent, own: OwnChanges): void {
	const spike = new Spike(plugin, localIntent, own);
	plugin.addCommand({ id: "spike-toggle-event-log", name: "Spike: toggle event log", callback: () => spike.toggleLog() });
	plugin.addCommand({ id: "spike-create-dummy-pairs", name: "Spike: create dummy pairs", callback: () => spike.promptDummyPairs() });
	plugin.addCommand({ id: "spike-toggle-dummy-hiding", name: "Spike: toggle hiding of dummy PDF files", callback: () => spike.toggleHiding() });
	plugin.addCommand({ id: "spike-remove-dummy-pairs", name: "Spike: remove dummy pairs", callback: () => void spike.removeDummyPairs() });
	plugin.addCommand({ id: "spike-rename-test-pair", name: "Spike: rename a test pair", callback: () => spike.promptRenamePair() });
	plugin.addCommand({ id: "spike-snapshot-test-files", name: "Spike: snapshot test files", callback: () => void spike.snapshot() });
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

	constructor(private readonly plugin: Plugin, private readonly localIntent: LocalIntent, private readonly own: OwnChanges) {
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
		this.plugin.registerEvent(vault.on("modify", (file) => {
			if (isPdf(file)) this.onEvent("modify", file, "-");
		}));
		this.plugin.registerEvent(metadataCache.on("deleted", (file) => this.onEvent("deleted", file, "-")));
		if (this.logOn) this.writeLine({ event: "log-start" });
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
			this.writeLine({ event: "log-start" });
			new Notice(`Spike event log is on. Writing to ${this.logPath}`);
		} else {
			void this.flush();
			new Notice("Spike event log is off.");
		}
	}

	private onEvent(event: string, file: TAbstractFile, oldPath: string): void {
		if (!this.logOn || this.isIgnored(file.path) || this.isIgnored(oldPath)) return;

		let local = "-";
		let newPathLocal = "-";
		if (event === "rename") {
			local = String(this.localIntent.peek(oldPath));
			newPathLocal = String(this.localIntent.peek(file.path));
		} else if (event === "delete" || event === "deleted") {
			local = String(this.deleteLocal(event, file.path));
		} else if (event === "create") {
			local = String(this.localIntent.peek(file.path));
		}
		const size = isPdf(file) ? String(file.stat.size) : "-";
		this.writeLine({ event, path: file.path, oldPath, local, newPathLocal, size });
	}

	/** The vault `delete` and the metadata cache `deleted` for one note share a single answer. */
	private deleteLocal(event: string, path: string): boolean {
		const now = Date.now();
		const earlier = this.recentDeletes.get(path);
		if (earlier && earlier.event !== event && now - earlier.at < DELETE_PAIR_MS) {
			this.recentDeletes.delete(path);
			return earlier.local;
		}
		const local = this.localIntent.peek(path);
		this.recentDeletes.set(path, { event, local, at: now });
		return local;
	}

	private isIgnored(path: string): boolean {
		if (path.startsWith(LOG_PREFIX)) return true;
		const inDummyFolder = path === DUMMY_FOLDER || path.startsWith(`${DUMMY_FOLDER}/`);
		return inDummyFolder && (this.dummyBusy || Date.now() < this.dummyGraceUntil);
	}

	private writeLine(values: Partial<Record<Field, string>>): void {
		const defaults: Partial<Record<Field, string>> = { time: new Date().toISOString(), device: this.device, deviceId: this.deviceId };
		const fields = FIELDS.map((field) => (values[field] ?? defaults[field] ?? "-").replace(/[\t\r\n]/g, " "));
		this.buffer.push(fields.join("\t"));
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

	promptRenamePair(): void {
		if (!this.logOn) {
			new Notice("The spike event log is off. Turn it on first.");
			return;
		}
		const pairs = this.testPairs();
		if (pairs.length === 0) {
			new Notice(`No note with a same-named PDF file in the ${TEST_FOLDER} folder.`);
			return;
		}
		new PairSuggestModal(this.app, pairs, (pair) => void this.renamePair(pair)).open();
	}

	/** Notes under the test folder that have a PDF file of the same name next to them. */
	private testPairs(): TestPair[] {
		const pairs: TestPair[] = [];
		for (const note of this.app.vault.getMarkdownFiles()) {
			if (!note.path.startsWith(`${TEST_FOLDER}/`)) continue;
			const pdf = this.app.vault.getFileByPath(`${parentPrefix(note)}${note.basename}.pdf`);
			if (pdf) pairs.push({ note, pdf });
		}
		return pairs.sort((a, b) => a.note.path.localeCompare(b.note.path));
	}

	/** Renames the note and then its PDF back to back, the way the plugin will. */
	private async renamePair({ note, pdf }: TestPair): Promise<void> {
		const prefix = parentPrefix(note);
		const oldBase = note.basename;
		let newBase = `${oldBase} renamed`;
		for (let n = 2; this.app.vault.getAbstractFileByPath(`${prefix}${newBase}.md`) || this.app.vault.getAbstractFileByPath(`${prefix}${newBase}.pdf`); n++) {
			newBase = `${oldBase} renamed ${n}`;
		}
		const newNotePath = `${prefix}${newBase}.md`;
		this.writeLine({ event: "pair-rename", path: newNotePath, oldPath: note.path });
		try {
			// Marked as the plugin's own changes so the Watcher does not follow them as well.
			await this.renameOwn(note, newNotePath);
			await this.renameOwn(pdf, `${prefix}${newBase}.pdf`);
			new Notice(`Renamed the pair ${oldBase} to ${newBase}.`);
		} catch (error) {
			console.error("PDF Wrapper spike: could not rename the pair", error);
			new Notice(`Could not rename the pair: ${error instanceof Error ? error.message : String(error)}`);
		}
	}

	private async renameOwn(file: TFile, newPath: string): Promise<void> {
		const release = this.own.mark(file.path);
		try {
			await this.app.fileManager.renameFile(file, newPath);
		} catch (error) {
			release();
			throw error;
		}
	}

	/**
	 * Writes to the log what Obsidian's file list holds under the test folder, then what
	 * the adapter lists on disk there. Runs whether or not the event log is on.
	 */
	async snapshot(): Promise<void> {
		const { vault } = this.app;
		this.writeLine({ event: "snapshot-start", path: TEST_FOLDER });
		let count = 0;
		for (const file of vault.getAllLoadedFiles()) {
			if (file.path !== TEST_FOLDER && !file.path.startsWith(`${TEST_FOLDER}/`)) continue;
			count++;
			if (file instanceof TFolder) {
				this.writeLine({ event: "snapshot-vault", path: file.path, kind: "folder" });
			} else if (file instanceof TFile) {
				this.writeLine({ event: "snapshot-vault", path: file.path, kind: "file", size: String(file.stat.size), mtime: isoTime(file.stat.mtime) });
			}
		}
		try {
			count += await this.snapshotAdapter(TEST_FOLDER);
		} catch (error) {
			this.writeLine({ event: "snapshot-adapter", path: TEST_FOLDER, kind: `error: ${error instanceof Error ? error.message : String(error)}` });
		}
		this.writeLine({ event: "snapshot-end", path: TEST_FOLDER });
		await this.flush();
		new Notice(`Snapshot written to ${this.logPath} (${count} lines).`);
	}

	private async snapshotAdapter(folder: string): Promise<number> {
		const { adapter } = this.app.vault;
		const listed = await adapter.list(folder);
		let count = 0;
		for (const path of listed.files) {
			const stat = await adapter.stat(path);
			this.writeLine({ event: "snapshot-adapter", path, kind: stat?.type ?? "file", size: stat ? String(stat.size) : "-", mtime: stat ? isoTime(stat.mtime) : "-" });
			count++;
		}
		for (const path of listed.folders) {
			this.writeLine({ event: "snapshot-adapter", path, kind: "folder" });
			count += 1 + (await this.snapshotAdapter(path));
		}
		return count;
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

interface TestPair {
	note: TFile;
	pdf: TFile;
}

function isPdf(file: TAbstractFile): file is TFile {
	return file instanceof TFile && file.extension.toLowerCase() === "pdf";
}

/** "folder/" for a file in a folder, "" for a file at the vault root. */
function parentPrefix(file: TFile): string {
	const parent = file.parent?.path ?? "/";
	return parent === "/" ? "" : `${parent}/`;
}

function isoTime(ms: number): string {
	return Number.isFinite(ms) ? new Date(ms).toISOString() : "-";
}

class PairSuggestModal extends FuzzySuggestModal<TestPair> {
	constructor(app: App, private readonly pairs: TestPair[], private readonly onChoose: (pair: TestPair) => void) {
		super(app);
		this.setPlaceholder("Choose the pair to rename");
	}

	getItems(): TestPair[] {
		return this.pairs;
	}

	getItemText(pair: TestPair): string {
		return pair.note.path;
	}

	onChooseItem(pair: TestPair): void {
		this.onChoose(pair);
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
