import { App, normalizePath, Notice, TFile, TFolder, type TAbstractFile } from "obsidian";
import { isLinkSafeName } from "./core/claims.ts";
import { dirname, findPathIgnoringCase, isNote, isPdf, joinPath } from "./core/paths.ts";
import type { PdfWrapperSettings } from "./core/settings-data.ts";
import { isPlausibleTemplaterNote, pathList, templaterOutcome } from "./core/templater-outcome.ts";
import {
	defaultTemplate,
	defaultTemplatePath,
	ensureTemplateComponents,
	templatePathWithExtension,
} from "./core/template.ts";
import { EmbedUpdateError, writeClaim } from "./obsidian/snapshot.ts";

/** A wrap outcome whose message is complete and is shown as it is, without a "Failed to wrap" prefix. */
export class WrapMessage extends Error {
	constructor(message: string) {
		super(message);
		this.name = "WrapMessage";
	}
}

/** A wrap that was refused before a note was created. (The template may have been created or repaired.) */
export class WrapRefusal extends WrapMessage {
	/**
	 * `note-exists`: a note already sits beside the PDF. `in-flight`: the same note is being created by another wrap right
	 * now. `template-failed`: Templater ran but left no note (its template failed or its prompt was cancelled).
	 */
	constructor(message: string, readonly reason: "note-exists" | "in-flight" | "template-failed" | "other" = "other") {
		super(message);
		this.name = "WrapRefusal";
	}
}

/** The note was created and carries the claim, so the PDF is wrapped, but a later step failed. */
export class WrapIncomplete extends WrapMessage {
	constructor(message: string, readonly note: TFile) {
		super(message);
		this.name = "WrapIncomplete";
	}
}

/**
 * Templater returned no note (or threw), none is at the expected path, and the new notes in the vault do not show
 * which one it created, if any: the template may have renamed or moved its own note. Shown as it is (after "Failed to
 * wrap"), not as "Could not create". It only names the new notes; it never suggests deleting one.
 */
class TemplaterNoteElsewhere extends Error {
	constructor(pdfName: string, markerProperty: string, newNotes: string[]) {
		super(
			`Templater created the note somewhere else and it could not be found. Look for a new note (${pathList(newNotes)}), ` +
			`move it beside ${pdfName}, and add the "${markerProperty}" property — or change the template so it does not ` +
			`rename or move its note.`,
		);
		this.name = "TemplaterNoteElsewhere";
	}
}

/**
 * The lower-cased note paths of the wraps running right now, so a second wrap that would create the same note is
 * refused. Keyed by the note, not the PDF: `S.pdf` and `s.PDF` in one folder would race for one note path on a
 * case-insensitive file system.
 */
const inFlight = new Set<string>();

/**
 * How many wraps have started since the plugin loaded. With `inFlight`, tells whether another wrap ran during a
 * Templater call, in which case a new note in the vault may be that wrap's and not this one's.
 */
let wrapsStarted = 0;

const wrapSucceededListeners = new Set<() => void>();

/**
 * Calls `listener` after every wrap that created and marked a note (including one whose later step failed). Returns
 * the function that removes it.
 */
export function onWrapSucceeded(listener: () => void): () => void {
	wrapSucceededListeners.add(listener);
	return () => wrapSucceededListeners.delete(listener);
}

function notifyWrapSucceeded(): void {
	for (const listener of [...wrapSucceededListeners]) {
		try {
			listener();
		} catch (e) {
			console.error("PDF Wrapper: wrap listener failed", e);
		}
	}
}

/** Where the note wrapping `pdf` lives: beside it, with the same base name. */
export function siblingNotePath(pdf: TFile): string {
	return joinPath(dirname(pdf.path), `${pdf.basename}.md`);
}

/**
 * The path of whatever already occupies the PDF's note path, ignoring letter case (as a case-insensitive
 * file system would), or null when it is free.
 */
export function existingSiblingNote(app: App, pdf: TFile): string | null {
	const notePath = siblingNotePath(pdf);
	if (app.vault.getAbstractFileByPath(notePath)) return notePath;
	const siblings = pdf.parent?.children.map((child) => child.path) ?? [];
	return findPathIgnoringCase(siblings, notePath);
}

/**
 * Creates `<name>.md` beside the PDF from the template and marks it with the claim.
 * The PDF is not moved. Throws a WrapRefusal when it refuses before creating a note, a WrapIncomplete
 * when the PDF is wrapped but a later step failed, and an Error describing what was left behind otherwise.
 */
export async function wrapPdf(
	app: App,
	settings: PdfWrapperSettings,
	saveSettings: () => Promise<void>,
	pdfFile: TFile,
	options: { open: boolean },
): Promise<TFile> {
	const key = siblingNotePath(pdfFile).toLowerCase();
	if (inFlight.has(key)) {
		throw new WrapRefusal(`${pdfFile.name} is already being wrapped.`, "in-flight");
	}
	inFlight.add(key);
	wrapsStarted++;
	try {
		const note = await wrapOnce(app, settings, saveSettings, pdfFile, options);
		notifyWrapSucceeded();
		return note;
	} catch (e) {
		if (e instanceof WrapIncomplete) notifyWrapSucceeded();
		throw e;
	} finally {
		inFlight.delete(key);
	}
}

async function wrapOnce(
	app: App,
	settings: PdfWrapperSettings,
	saveSettings: () => Promise<void>,
	pdfFile: TFile,
	options: { open: boolean },
): Promise<TFile> {
	if (!isLinkSafeName(pdfFile.path)) {
		throw new WrapRefusal(`Cannot wrap ${pdfFile.name}: file names containing [ ] | # ^ cannot be linked. Rename the PDF first.`);
	}

	const folder = pdfFile.parent;
	if (!folder) throw new Error(`Cannot determine the folder of ${pdfFile.path}.`);

	const notePath = siblingNotePath(pdfFile);
	const occupied = existingSiblingNote(app, pdfFile);
	if (occupied) {
		throw new WrapRefusal(`Cannot wrap ${pdfFile.name}: a note already exists at ${occupied}.`, "note-exists");
	}

	const templateFile = await prepareTemplate(app, settings, saveSettings);
	if (templateFile.path.toLowerCase() === notePath.toLowerCase()) {
		throw new WrapRefusal(`Cannot wrap ${pdfFile.name}: its note would be the template file ${templateFile.path}.`);
	}

	let created: CreatedNote;
	try {
		created = await createNoteFromTemplate(app, templateFile, folder, pdfFile, settings.markerProperty);
	} catch (e) {
		// Messages about what Templater did, shown as they are; nothing was left at the note path by this wrap.
		if (e instanceof TemplaterNoteElsewhere || e instanceof WrapRefusal) throw e;
		// Templater may have created the file before failing.
		const left = app.vault.getAbstractFileByPath(notePath);
		if (left instanceof TFile) throw notMarked(left.path, pdfFile, settings.markerProperty, e);
		throw new Error(`Could not create ${notePath}: ${reason(e)}.`);
	}

	const note = created.file;
	const recoveredFrom = created.recoveredFrom;
	if (recoveredFrom !== null) {
		// A note Templater made elsewhere and did not return, recognised as its own: move it back beside the PDF.
		try {
			await app.fileManager.renameFile(note, notePath);
		} catch (e) {
			if (note.path === recoveredFrom) {
				throw new Error(
					`Templater created a note at ${recoveredFrom}, but it could not be moved beside ${pdfFile.name}: ${reason(e)}. ` +
					`The note is still at ${recoveredFrom} and was not changed.`,
				);
			}
			throw notMarkedRecovered(recoveredFrom, note.path, pdfFile, settings.markerProperty, e);
		}
		new Notice(`Moved ${recoveredFrom} beside ${pdfFile.name}.`);
	}

	try {
		if (recoveredFrom === null && note.path !== notePath) {
			// A template that renames or moves the note it creates: put it back beside the PDF.
			await app.fileManager.renameFile(note, notePath);
		}
		await writeClaim(app, note, settings.markerProperty, pdfFile.path, [pdfFile.name, pdfFile.basename]);
	} catch (e) {
		if (e instanceof EmbedUpdateError) {
			throw new WrapIncomplete(`Created and marked ${note.path}, but could not update its PDF embed: ${reason(e)}.`, note);
		}
		if (recoveredFrom !== null) throw notMarkedRecovered(recoveredFrom, note.path, pdfFile, settings.markerProperty, e);
		throw notMarked(note.path, pdfFile, settings.markerProperty, e);
	}

	if (options.open) {
		try {
			await app.workspace.getLeaf().openFile(note);
		} catch (e) {
			throw new WrapIncomplete(`Wrapped ${pdfFile.name} as ${note.path}, but could not open the note: ${reason(e)}.`, note);
		}
	}
	return note;
}

/**
 * A note recovered from elsewhere was moved but could not be marked. The message does not suggest deleting it: it
 * was recognised as Templater's only from its text.
 */
function notMarkedRecovered(from: string, notePath: string, pdfFile: TFile, markerProperty: string, e: unknown): Error {
	return new Error(
		`Moved ${from} beside ${pdfFile.name} as ${notePath}, but could not mark it as wrapping ${pdfFile.name}: ${reason(e)}. ` +
		`Add the "${markerProperty}" property to it by hand.`,
	);
}

/** The note exists but carries no claim. It is not deleted: the message tells the user what to do. */
function notMarked(notePath: string, pdfFile: TFile, markerProperty: string, e: unknown): Error {
	return new Error(
		`Created ${notePath} but could not mark it as wrapping ${pdfFile.name}: ${reason(e)}. ` +
		`Delete the note and wrap again, or add the "${markerProperty}" property to it by hand.`,
	);
}

/**
 * Returns the template file, creating the default when none is configured or the configured file is
 * missing, and adding the marker property or PDF embed when the template lacks them.
 * Throws an Error whose message names the path and the reason.
 */
export async function prepareTemplate(
	app: App,
	settings: PdfWrapperSettings,
	saveSettings: () => Promise<void>,
): Promise<TFile> {
	let path: string;
	let file: TFile;

	if (settings.templatePath.trim() === "") {
		path = normalizePath(defaultTemplatePath({
			templater: getTemplaterFolder(app),
			coreTemplates: getCoreTemplatesFolder(app),
		}));
		const existing = app.vault.getAbstractFileByPath(path);
		file = existing
			? asTemplateFile(existing, path)
			: await createDefaultTemplate(app, path, settings.markerProperty);
		// The settings tab stores the path without ".md".
		const previous = settings.templatePath;
		settings.templatePath = path.replace(/\.md$/i, "");
		try {
			await saveSettings();
		} catch (e) {
			settings.templatePath = previous;
			throw new Error(existing
				? `Found a template at ${path}, but could not save it as the template setting: ${reason(e)}.`
				: `Created a default template at ${path}, but could not save it as the template setting: ${reason(e)}.`);
		}
		if (!existing) new Notice(`Created a default template at ${path}.`);
	} else {
		path = normalizePath(templatePathWithExtension(settings.templatePath));
		const existing = app.vault.getAbstractFileByPath(path);
		if (existing) {
			file = asTemplateFile(existing, path);
		} else {
			file = await createDefaultTemplate(app, path, settings.markerProperty);
			new Notice(`The template ${path} was missing, so a default was created there.`);
		}
	}

	let added: ("marker" | "embed")[] = [];
	try {
		// Read first so an intact template is not rewritten; the change itself is computed inside process.
		if (ensureTemplateComponents(await app.vault.read(file), settings.markerProperty).added.length > 0) {
			await app.vault.process(file, (text) => {
				const check = ensureTemplateComponents(text, settings.markerProperty);
				added = check.added;
				return check.text;
			});
		}
	} catch (e) {
		throw new Error(`Could not update the template ${path}: ${reason(e)}.`);
	}
	if (added.length > 0) {
		const parts = added.map((part) =>
			part === "marker" ? `the marker property "${settings.markerProperty}"` : "a PDF embed");
		new Notice(`Updated the template ${path}: added ${parts.join(" and ")}.`);
	}

	return file;
}

function asTemplateFile(file: TAbstractFile, path: string): TFile {
	if (file instanceof TFolder) throw new Error(`${path} is a folder, not a template file.`);
	if (!(file instanceof TFile) || !isNote(file.path)) throw new Error(`${path} is not a markdown file.`);
	return file;
}

async function createDefaultTemplate(app: App, path: string, markerProperty: string): Promise<TFile> {
	try {
		await ensureParentFolders(app, path);
		return await app.vault.create(path, defaultTemplate(markerProperty));
	} catch (e) {
		throw new Error(`Could not create the default template at ${path}: ${reason(e)}.`);
	}
}

async function ensureParentFolders(app: App, path: string): Promise<void> {
	let folder = "";
	for (const part of dirname(path).split("/").filter((p) => p !== "")) {
		folder = joinPath(folder, part);
		const existing = app.vault.getAbstractFileByPath(folder);
		if (existing instanceof TFolder) continue;
		if (existing) throw new Error(`${folder} is a file, not a folder`);
		await app.vault.createFolder(folder);
	}
}

function reason(e: unknown): string {
	return (e instanceof Error ? e.message : String(e)).replace(/\.\s*$/, "");
}

/** Templater's template folder setting, or null when Templater is absent or the value is unusable. */
function getTemplaterFolder(app: App): string | null {
	try {
		const plugins = (app as unknown as { plugins?: { plugins?: Record<string, unknown> } }).plugins?.plugins;
		const plugin = plugins?.["templater-obsidian"] as { settings?: { templates_folder?: unknown } } | undefined;
		if (!plugin) return null;
		const folder = plugin.settings?.templates_folder;
		if (typeof folder === "string") return folder;
		if (folder !== undefined) console.warn("PDF Wrapper: unexpected Templater templates_folder setting", folder);
	} catch (e) {
		console.warn("PDF Wrapper: failed to read Templater's template folder", e);
	}
	return null;
}

/** The core Templates plugin's folder setting, or null when it is absent or the value is unusable. */
function getCoreTemplatesFolder(app: App): string | null {
	try {
		const folder = getCoreTemplatesPlugin(app)?.instance?.options?.folder;
		if (typeof folder === "string") return folder;
		if (folder !== undefined) console.warn("PDF Wrapper: unexpected core Templates folder setting", folder);
	} catch (e) {
		console.warn("PDF Wrapper: failed to read the core Templates folder", e);
	}
	return null;
}

interface TemplaterPlugin {
	templater: {
		create_new_note_from_template: (
			template: TFile,
			folder: TFolder,
			filename: string,
			openNewNote: boolean,
		) => Promise<TFile | undefined>;
	};
}

function getTemplaterPlugin(app: App): TemplaterPlugin | null {
	try {
		const plugins = (app as unknown as { plugins?: { plugins?: Record<string, unknown> } }).plugins?.plugins;
		const plugin = plugins?.["templater-obsidian"];
		if (
			plugin &&
			typeof plugin === "object" &&
			"templater" in plugin &&
			(plugin as Record<string, unknown>).templater &&
			typeof (plugin as TemplaterPlugin).templater.create_new_note_from_template === "function"
		) {
			return plugin as TemplaterPlugin;
		}
	} catch (e) {
		console.warn("PDF Wrapper: failed to access Templater plugin", e);
	}
	return null;
}

/** The note a wrap created, and the path it was found at when it was recovered from elsewhere (else null). */
interface CreatedNote {
	file: TFile;
	recoveredFrom: string | null;
}

async function createNoteFromTemplate(
	app: App,
	templateFile: TFile,
	folder: TFolder,
	pdfFile: TFile,
	markerProperty: string,
): Promise<CreatedNote> {
	const filename = pdfFile.basename;
	const notePath = normalizePath(folder.isRoot() ? `${filename}.md` : `${folder.path}/${filename}.md`);
	const plain = (file: TFile): CreatedNote => ({ file, recoveredFrom: null });

	// Try Templater plugin first — it handles its own placeholder resolution
	const templater = getTemplaterPlugin(app);
	if (templater) {
		let created: TFile | undefined;
		let ran = false;
		// What exists before the call, so that afterwards a note Templater created elsewhere can be told apart from none.
		const call: TemplaterCall = {
			before: app.vault.getMarkdownFiles(),
			startedAt: Date.now(),
			startedBefore: wrapsStarted,
			aloneAtStart: inFlight.size <= 1,
		};
		try {
			created = await templater.templater.create_new_note_from_template(templateFile, folder, filename, false);
			ran = true;
		} catch (e) {
			// Templater may have written the note before failing; use it rather than fail on "already exists".
			const left = app.vault.getAbstractFileByPath(notePath);
			if (left instanceof TFile) {
				console.warn("PDF Wrapper: Templater failed after creating the note; using the note it created", e);
				return plain(left);
			}
			console.warn("PDF Wrapper: Templater failed", e);
			// It may have moved its note away before failing: recover that note rather than create a second one.
			// Throws when there are new notes but none is recognisably Templater's.
			const elsewhere = await findTemplaterNote(app, call, templateFile, pdfFile, markerProperty);
			if (elsewhere !== null) {
				console.warn("PDF Wrapper: Templater failed after creating the note elsewhere; using that note", elsewhere.path);
				return { file: elsewhere, recoveredFrom: elsewhere.path };
			}
			console.warn("PDF Wrapper: falling back to manual creation");
		}
		if (ran) {
			if (created instanceof TFile) return plain(created);
			// Templater may not return the file; look it up
			const found = app.vault.getAbstractFileByPath(notePath);
			if (found instanceof TFile) return plain(found);
			const elsewhere = await findTemplaterNote(app, call, templateFile, pdfFile, markerProperty);
			if (elsewhere !== null) return { file: elsewhere, recoveredFrom: elsewhere.path };
			// Templater made no note, or removed the one it made (its template failed or a prompt was cancelled).
			throw new WrapRefusal(
				`Templater did not create a note for ${pdfFile.name}. Check its own message, fix the template or answer ` +
				`its prompt, then wrap again.`,
				"template-failed",
			);
		}
	}

	// Fallback (Templater not installed, or it threw before creating anything): create the file manually and
	// resolve core Templates placeholders
	const raw = await app.vault.read(templateFile);
	const content = resolveCoreTemplatePlaceholders(app, raw, filename);
	return plain(await app.vault.create(notePath, content));
}

/** The state of the vault and of other wraps when a Templater call started. */
interface TemplaterCall {
	before: TFile[];
	startedAt: number;
	startedBefore: number;
	aloneAtStart: boolean;
}

/**
 * After a Templater call that left no note at the expected path: the note Templater created elsewhere, when it can be
 * told apart safely, or null when no new note exists. Decides from the files that exist now, not from an assumption
 * about what Templater does. A note is taken only when it is the one new file (by identity, so a renamed note does not
 * count), was created during the call, no other wrap ran meanwhile, and its text has the marker property without
 * naming another existing PDF. Otherwise, when new notes exist, throws a TemplaterNoteElsewhere naming them.
 */
async function findTemplaterNote(
	app: App,
	call: TemplaterCall,
	templateFile: TFile,
	pdfFile: TFile,
	markerProperty: string,
): Promise<TFile | null> {
	const after = app.vault.getMarkdownFiles();
	const safe = call.aloneAtStart && inFlight.size <= 1 && wrapsStarted === call.startedBefore;
	const outcome = templaterOutcome(call.before, after, call.startedAt, safe);
	if (outcome.kind === "none") return null;
	if (outcome.kind === "unclear") throw new TemplaterNoteElsewhere(pdfFile.name, markerProperty, outcome.paths);
	const candidate = app.vault.getFileByPath(outcome.path);
	if (candidate !== null && candidate.path !== templateFile.path) {
		try {
			const text = await app.vault.cachedRead(candidate);
			const pdfs = app.vault.getFiles().filter((file) => isPdf(file.path)).map((file) => file.path);
			if (isPlausibleTemplaterNote(text, markerProperty, pdfFile.path, pdfs)) return candidate;
		} catch (e) {
			console.warn("PDF Wrapper: could not read the note Templater may have created", outcome.path, e);
		}
	}
	throw new TemplaterNoteElsewhere(pdfFile.name, markerProperty, [outcome.path]);
}

type MomentFn = () => { format: (fmt: string) => string };

function getMoment(): MomentFn | null {
	try {
		const m = (window as unknown as { moment?: MomentFn }).moment;
		return typeof m === "function" ? m : null;
	} catch (e) {
		console.warn("PDF Wrapper: failed to access moment", e);
		return null;
	}
}

interface CoreTemplatesPlugin {
	instance?: {
		options?: {
			dateFormat?: string;
			timeFormat?: string;
			folder?: unknown;
		};
	};
}

function getCoreTemplatesPlugin(app: App): CoreTemplatesPlugin | null {
	try {
		const internalPlugins = (app as unknown as {
			internalPlugins?: { getPluginById?: (id: string) => CoreTemplatesPlugin | undefined };
		}).internalPlugins;
		return internalPlugins?.getPluginById?.("templates") ?? null;
	} catch (e) {
		console.warn("PDF Wrapper: failed to access core Templates plugin", e);
		return null;
	}
}

function resolveCoreTemplatePlaceholders(app: App, content: string, title: string): string {
	const m = getMoment();

	const opts = getCoreTemplatesPlugin(app)?.instance?.options;
	const dateFormat: string = opts?.dateFormat || "YYYY-MM-DD";
	const timeFormat: string = opts?.timeFormat || "HH:mm";

	const date: string = m ? m().format(dateFormat) : new Date().toISOString().slice(0, 10);
	const time: string = m ? m().format(timeFormat) : new Date().toTimeString().slice(0, 5);

	return content
		.replace(/\{\{title\}\}/g, title)
		.replace(/\{\{date\}\}/g, date)
		.replace(/\{\{time\}\}/g, time);
}
