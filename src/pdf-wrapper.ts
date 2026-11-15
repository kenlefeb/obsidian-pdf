import { App, normalizePath, Notice, TFile, TFolder, type TAbstractFile } from "obsidian";
import { isLinkSafeName } from "./core/claims.ts";
import { dirname, isNote, joinPath } from "./core/paths.ts";
import type { PdfWrapperSettings } from "./core/settings-data.ts";
import {
	defaultTemplate,
	defaultTemplatePath,
	ensureTemplateComponents,
	templatePathWithExtension,
} from "./core/template.ts";
import { writeClaim } from "./obsidian/snapshot.ts";

/** Where the note wrapping `pdf` lives: beside it, with the same base name. */
export function siblingNotePath(pdf: TFile): string {
	return joinPath(dirname(pdf.path), `${pdf.basename}.md`);
}

/**
 * Creates `<name>.md` beside the PDF from the template and marks it with the claim.
 * The PDF is not moved. Throws an Error with a user-facing message on any failure.
 */
export async function wrapPdf(
	app: App,
	settings: PdfWrapperSettings,
	saveSettings: () => Promise<void>,
	pdfFile: TFile,
	options: { open: boolean },
): Promise<TFile> {
	if (!isLinkSafeName(pdfFile.path)) {
		throw new Error(`Cannot wrap ${pdfFile.name}: file names containing [ ] | # ^ cannot be linked. Rename the PDF first.`);
	}

	const folder = pdfFile.parent;
	if (!folder) throw new Error(`Cannot determine the folder of ${pdfFile.path}.`);

	const notePath = siblingNotePath(pdfFile);
	if (app.vault.getAbstractFileByPath(notePath)) {
		throw new Error(`A note already exists at ${notePath}.`);
	}

	const templateFile = await prepareTemplate(app, settings, saveSettings);

	const note = await createNoteFromTemplate(app, templateFile, folder, pdfFile.basename);
	if (note.path !== notePath) {
		// A template that renames or moves the note it creates: put it back beside the PDF.
		await app.fileManager.renameFile(note, notePath);
	}

	await writeClaim(app, note, settings.markerProperty, pdfFile.path, [pdfFile.name, pdfFile.basename]);

	if (options.open) {
		await app.workspace.getLeaf().openFile(note);
	}
	return note;
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
		settings.templatePath = path.replace(/\.md$/i, "");
		await saveSettings();
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

	let added: ("marker" | "embed")[];
	try {
		const check = ensureTemplateComponents(await app.vault.read(file), settings.markerProperty);
		added = check.added;
		if (added.length > 0) await app.vault.modify(file, check.text);
	} catch (e) {
		throw new Error(`Could not update the template ${path}: ${reason(e)}.`);
	}
	if (added.length > 0) {
		const parts = added.map((part) =>
			part === "marker" ? `the marker property \`${settings.markerProperty}\`` : "a PDF embed");
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
		console.warn("Wrap PDF: failed to access Templater plugin", e);
	}
	return null;
}

async function createNoteFromTemplate(
	app: App,
	templateFile: TFile,
	folder: TFolder,
	filename: string,
): Promise<TFile> {
	// Try Templater plugin first — it handles its own placeholder resolution
	const templater = getTemplaterPlugin(app);
	if (templater) {
		try {
			const created: TFile | undefined = await templater.templater.create_new_note_from_template(
				templateFile, folder, filename, false,
			);
			if (created instanceof TFile) return created;

			// Templater may not return the file; look it up
			const expectedPath = normalizePath(
				folder.isRoot() ? `${filename}.md` : `${folder.path}/${filename}.md`
			);
			const found = app.vault.getAbstractFileByPath(expectedPath);
			if (found instanceof TFile) return found;
		} catch (e) {
			console.warn("Wrap PDF: Templater failed, falling back to manual creation", e);
		}
	}

	// Fallback: create file manually and resolve core Templates placeholders
	const raw = await app.vault.read(templateFile);
	const content = resolveCoreTemplatePlaceholders(app, raw, filename);

	const notePath = normalizePath(
		folder.isRoot() ? `${filename}.md` : `${folder.path}/${filename}.md`
	);
	return await app.vault.create(notePath, content);
}

type MomentFn = () => { format: (fmt: string) => string };

function getMoment(): MomentFn | null {
	try {
		const m = (window as unknown as { moment?: MomentFn }).moment;
		return typeof m === "function" ? m : null;
	} catch (e) {
		console.warn("Wrap PDF: failed to access moment", e);
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
		console.warn("Wrap PDF: failed to access core Templates plugin", e);
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
