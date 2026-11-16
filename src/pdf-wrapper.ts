import { App, normalizePath, Notice, TFile, TFolder, type TAbstractFile } from "obsidian";
import { BLOCK_LANGUAGE } from "./core/block.ts";
import { convertedMessage } from "./core/convert.ts";
import { dirname, findPathIgnoringCase, isLinkSafeName, isNote, joinPath } from "./core/paths.ts";
import type { PdfWrapperSettings } from "./core/settings-data.ts";
import { noteExistedMessage, notesAppearedMessage, templaterResult } from "./core/templater-outcome.ts";
import {
	defaultTemplate,
	defaultTemplatePath,
	ensureTemplateComponents,
	templatePathWithExtension,
	type TemplateCheck,
} from "./core/template.ts";
import { BodyConvertError, convertNote, convertNoteBody, ownTargetsFor } from "./obsidian/vault-snapshot.ts";

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
	 * `template-unclear`: Templater handed back no note, none is beside the PDF, but other notes appeared while it ran;
	 * they are named and left alone.
	 */
	constructor(
		message: string,
		readonly reason: "note-exists" | "in-flight" | "template-failed" | "template-unclear" | "other" = "other",
	) {
		super(message);
		this.name = "WrapRefusal";
	}
}

/**
 * True for a refusal that says Templater did not hand back a note. The template is likely to do the same for every PDF,
 * so a run over many PDFs stops (automatic wrapping pauses) rather than trying each.
 */
export function isTemplateProblem(error: unknown): error is WrapRefusal {
	return error instanceof WrapRefusal && (error.reason === "template-failed" || error.reason === "template-unclear");
}

/** The note was created and carries the marker, so the PDF is wrapped, but a later step failed. */
export class WrapIncomplete extends WrapMessage {
	constructor(message: string, readonly note: TFile) {
		super(message);
		this.name = "WrapIncomplete";
	}
}

/**
 * The lower-cased note paths of the wraps running right now, so a second wrap that would create the same note is
 * refused. Keyed by the note, not the PDF: `S.pdf` and `s.PDF` in one folder would race for one note path on a
 * case-insensitive file system.
 */
const inFlight = new Set<string>();

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

/**
 * Where the note wrapping `pdf` lives: beside it, with the same base name, normalised as Obsidian normalises the path
 * of a file it creates (`normalizePath` also turns non-breaking spaces into spaces and composes Unicode). Every step of
 * a wrap uses this one value, so the in-flight key, the existence checks, the creation and the rename-back agree.
 */
export function siblingNotePath(pdf: TFile): string {
	return normalizePath(joinPath(dirname(pdf.path), `${pdf.basename}.md`));
}

/**
 * The path of whatever already occupies the PDF's note path, ignoring letter case (as a case-insensitive
 * file system would), or null when it is free. `notePath` defaults to `siblingNotePath(pdf)`.
 */
export function existingSiblingNote(app: App, pdf: TFile, notePath: string = siblingNotePath(pdf)): string | null {
	if (app.vault.getAbstractFileByPath(notePath)) return notePath;
	const siblings = pdf.parent?.children.map((child) => child.path) ?? [];
	return findPathIgnoringCase(siblings, notePath);
}

export interface WrapOptions {
	/** Open the note afterwards. */
	open: boolean;
	/**
	 * Given the message that says what the template had put in the note and was taken out again (links to the PDF), in
	 * place of the notice a wrap otherwise shows for it. For a run over many PDFs, which shows it once.
	 */
	onConverted?: (message: string) => void;
}

/**
 * Creates `<name>.md` beside the PDF from the template, sets its marker to `true` and takes out of it any link to the
 * PDF that the template put there (the note must not name its PDF). The PDF is not moved. Throws a WrapRefusal when
 * it refuses before creating a note, a WrapIncomplete when the PDF is wrapped but a later step failed, and an Error
 * describing what was left behind otherwise.
 */
export async function wrapPdf(
	app: App,
	settings: PdfWrapperSettings,
	saveSettings: () => Promise<void>,
	pdfFile: TFile,
	options: WrapOptions,
): Promise<TFile> {
	const key = siblingNotePath(pdfFile).toLowerCase();
	if (inFlight.has(key)) {
		throw new WrapRefusal(`${pdfFile.name} is already being wrapped.`, "in-flight");
	}
	inFlight.add(key);
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
	options: WrapOptions,
): Promise<TFile> {
	if (!isLinkSafeName(pdfFile.path)) {
		throw new WrapRefusal(`Cannot wrap ${pdfFile.name}: file names containing [ ] | # ^ cannot be linked. Rename the PDF first.`);
	}

	const folder = pdfFile.parent;
	if (!folder) throw new Error(`Cannot determine the folder of ${pdfFile.path}.`);

	const notePath = siblingNotePath(pdfFile);
	refuseIfNoteExists(app, pdfFile, notePath);

	const templateFile = await prepareTemplate(app, settings, saveSettings);
	if (templateFile.path.toLowerCase() === notePath.toLowerCase()) {
		throw new WrapRefusal(`Cannot wrap ${pdfFile.name}: its note would be the template file ${templateFile.path}.`);
	}

	let created: CreatedNote;
	try {
		created = await createNoteFromTemplate(app, templateFile, folder, pdfFile, notePath, settings.markerProperty);
	} catch (e) {
		// Messages about what Templater did, shown as they are.
		if (e instanceof WrapRefusal) throw e;
		// Creating the note failed. Whatever is at its path now was not made by this wrap: leave it alone.
		const left = app.vault.getAbstractFileByPath(notePath);
		if (left instanceof TFile) {
			throw new Error(`Could not create ${notePath}: ${reason(e)}. A note is now at that path; it was left unchanged.`);
		}
		throw new Error(`Could not create ${notePath}: ${reason(e)}.`);
	}

	const note = created.file;
	let targets: string[] | null = null;
	let converted: Awaited<ReturnType<typeof convertNote>>;
	try {
		if (note.path !== notePath) {
			// Only for a note Templater returned (a found note is at `notePath`, and the plugin creates its own there):
			// the template renamed or moved it, so put it back beside the PDF.
			await app.fileManager.renameFile(note, notePath);
		}
		// As Convert would: whatever the template made of the note, it ends marked and without a link to its PDF.
		targets = await ownTargetsFor(app, note, pdfFile);
		converted = await convertNote(app, note, settings.markerProperty, targets);
	} catch (e) {
		if (e instanceof BodyConvertError) {
			const done = created.made ? "Created and marked" : "Marked";
			throw new WrapIncomplete(
				`${done} ${note.path}, but could not replace the links to ${pdfFile.name} in its text: ${reason(e)}.`,
				note,
			);
		}
		// The marker was not set. The links to the PDF are still taken out of the note's text when they can be, and the
		// message says which of the two is left to do.
		const textDone = await convertTextAnyway(app, note, targets);
		throw created.made
			? notMarked(note.path, pdfFile, settings.markerProperty, e, textDone)
			: notMarkedFound(note.path, pdfFile, settings.markerProperty, e, textDone);
	}
	const removed = convertedMessage(note.basename, converted.properties, converted.embeds, converted.links);
	if (removed !== null) {
		if (options.onConverted) options.onConverted(removed);
		else new Notice(removed, CONVERTED_NOTICE_MS);
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

/** Refuses the wrap, as a silent skip in bulk and automatic runs, when a note already occupies `notePath`. */
function refuseIfNoteExists(app: App, pdfFile: TFile, notePath: string): void {
	const occupied = existingSiblingNote(app, pdfFile, notePath);
	if (occupied) throw new WrapRefusal(noteExistedMessage(pdfFile.name, occupied, []), "note-exists");
}

/** How long the message about links the template put in stays up: it is long, and asks the user to change the template. */
export const CONVERTED_NOTICE_MS = 15000;

/**
 * After the properties of a new note could not be written: converts its text all the same. True when the text now has
 * no link to the PDF that `targets` covers; false when that failed too, or the targets were never worked out.
 */
async function convertTextAnyway(app: App, note: TFile, targets: string[] | null): Promise<boolean> {
	if (targets === null) return false;
	try {
		await convertNoteBody(app, note, targets);
		return true;
	} catch (e) {
		console.warn("PDF Wrapper: could not replace the links to the PDF in", note.path, e);
		return false;
	}
}

/** What is left to do by hand in a note whose marker could not be set, given whether its text was converted. */
function leftByHand(pdfFile: TFile, markerProperty: string, textDone: boolean): string {
	return `set the "${markerProperty}" property to true by hand and take any link to ${pdfFile.name} out of ` +
		`${textDone ? "its properties" : "the note"}`;
}

/** Said when the text of the note could not be converted either. */
function textNotDone(pdfFile: TFile, textDone: boolean): string {
	return textDone ? "" : ` The links to ${pdfFile.name} in its text were not replaced either.`;
}

/**
 * The note this wrap made (Templater handed it back, or the plugin created it) exists but carries no marker. It is not
 * deleted: the message tells the user what to do.
 */
function notMarked(notePath: string, pdfFile: TFile, markerProperty: string, e: unknown, textDone: boolean): Error {
	return new Error(
		`Created ${notePath} but could not mark it as wrapping ${pdfFile.name}: ${reason(e)}.${textNotDone(pdfFile, textDone)} ` +
		`Delete the note and wrap again, or ${leftByHand(pdfFile, markerProperty, textDone)}.`,
	);
}

/**
 * A note found at the note path after Templater ran, but not handed back by it, could not be marked. It is most likely
 * Templater's, but the plugin did not create it itself, so the message does not suggest deleting it.
 */
function notMarkedFound(notePath: string, pdfFile: TFile, markerProperty: string, e: unknown, textDone: boolean): Error {
	const left = leftByHand(pdfFile, markerProperty, textDone);
	return new Error(
		`Found ${notePath} after Templater ran, but could not mark it as wrapping ${pdfFile.name}: ${reason(e)}.` +
		`${textNotDone(pdfFile, textDone)} ${left.charAt(0).toUpperCase()}${left.slice(1)}.`,
	);
}

/**
 * Returns the template file, creating the default when none is configured or the configured file is
 * missing, and bringing the template to the current form when it lacks the marker property or the block, or still
 * has the placeholder link or embed of the earlier format (text-level edits only; see `ensureTemplateComponents`).
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

	let changes: string[] = [];
	try {
		// Read first so an intact template is not rewritten; the change itself is computed inside process.
		const current = await app.vault.read(file);
		if (ensureTemplateComponents(current, settings.markerProperty).text !== current) {
			await app.vault.process(file, (text) => {
				const check = ensureTemplateComponents(text, settings.markerProperty);
				changes = templateChanges(check, settings.markerProperty);
				return check.text;
			});
		}
	} catch (e) {
		throw new Error(`Could not update the template ${path}: ${reason(e)}.`);
	}
	if (changes.length > 0) new Notice(`Updated the template ${path}: ${changes.join("; ")}.`);

	return file;
}

/** What a template check changed, as phrases for the notice. */
function templateChanges(check: TemplateCheck, markerProperty: string): string[] {
	const changes: string[] = [];
	if (check.added.includes("marker")) changes.push(`added the marker property "${markerProperty}"`);
	if (check.markerSet) changes.push(`set the marker property "${markerProperty}" to true`);
	if (check.replacedEmbed) changes.push(`replaced the PDF embed with the ${BLOCK_LANGUAGE} block, which shows the PDF beside the note`);
	if (check.added.includes("block")) changes.push(`added the ${BLOCK_LANGUAGE} block, which shows the PDF beside the note`);
	return changes;
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
export function getTemplaterFolder(app: App): string | null {
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
export function getCoreTemplatesFolder(app: App): string | null {
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

/**
 * The note a wrap is to mark. `made`: this wrap made it (Templater handed it back, or the plugin created it itself);
 * false for a note found at the note path after Templater ran without handing one back.
 */
interface CreatedNote {
	file: TFile;
	made: boolean;
}

/**
 * Creates the note from the template, with Templater when it is installed. When Templater hands back no note, the
 * outcome is decided from the vault after the call (`templaterResult`); the plugin never takes, moves or edits a note
 * Templater did not hand back, other than one at the note path itself.
 */
async function createNoteFromTemplate(
	app: App,
	templateFile: TFile,
	folder: TFolder,
	pdfFile: TFile,
	notePath: string,
	markerProperty: string,
): Promise<CreatedNote> {
	const filename = pdfFile.basename;
	// Checked again here, after the awaits of preparing the template and with none before the snapshot below: a note
	// that arrived meanwhile (for example by sync) is refused, not taken for Templater's.
	refuseIfNoteExists(app, pdfFile, notePath);

	// Try Templater plugin first — it handles its own placeholder resolution
	const templater = getTemplaterPlugin(app);
	if (templater) {
		// What exists before the call, so that the notes that appear while it runs can be named.
		const before = app.vault.getMarkdownFiles();
		let threw = false;
		let failure: unknown = null;
		try {
			const created = await templater.templater.create_new_note_from_template(templateFile, folder, filename, false);
			if (created instanceof TFile) return { file: created, made: true };
		} catch (e) {
			threw = true;
			failure = e;
			console.warn("PDF Wrapper: Templater failed", e);
		}
		const atPath = app.vault.getAbstractFileByPath(notePath);
		const result = templaterResult({
			threw,
			atPath: atPath instanceof TFile ? atPath : null,
			before,
			after: app.vault.getMarkdownFiles(),
		});
		switch (result.kind) {
			case "use-note":
				if (atPath instanceof TFile) {
					if (threw) console.warn("PDF Wrapper: Templater failed after creating the note; using the note it created");
					return { file: atPath, made: false };
				}
				break;
			case "note-existed":
				throw new WrapRefusal(noteExistedMessage(pdfFile.name, result.path, result.others), "note-exists");
			case "template-failed":
				throw new WrapRefusal(
					`Templater did not create a note for ${pdfFile.name}. Check its own message, fix the template or answer ` +
					`its prompt, then wrap again.`,
					"template-failed",
				);
			case "notes-appeared":
				throw new WrapRefusal(
					notesAppearedMessage(pdfFile.name, markerProperty, result.paths, result.threw ? reason(failure) : null),
					"template-unclear",
				);
			case "create-manually":
				console.warn("PDF Wrapper: Templater created nothing; creating the note without it");
				break;
		}
	}

	// Fallback (Templater not installed, or it threw before creating anything): create the file manually and
	// resolve core Templates placeholders
	const raw = await app.vault.read(templateFile);
	const content = resolveCoreTemplatePlaceholders(app, raw, filename);
	return { file: await app.vault.create(notePath, content), made: true };
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
