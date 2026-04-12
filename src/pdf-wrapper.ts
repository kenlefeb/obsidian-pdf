/* eslint-disable @typescript-eslint/no-explicit-any, @typescript-eslint/no-unsafe-assignment, @typescript-eslint/no-unsafe-member-access, @typescript-eslint/no-unsafe-call */
import { App, normalizePath, TFile, TFolder } from "obsidian";
import type { PdfWrapperSettings } from "./settings.ts";

export async function wrapPdf(app: App, settings: PdfWrapperSettings, pdfFile: TFile): Promise<void> {
	const originalFolder = pdfFile.parent;
	if (!originalFolder) throw new Error("Cannot determine the PDF's parent folder");

	const pdfBasename = pdfFile.basename;
	const pdfName = pdfFile.name;

	// Bail out if a wrapper note already exists
	const notePath = normalizePath(
		originalFolder.isRoot()
			? `${pdfBasename}.md`
			: `${originalFolder.path}/${pdfBasename}.md`
	);
	if (app.vault.getAbstractFileByPath(notePath)) {
		throw new Error(`A note already exists at ${notePath}`);
	}

	// Resolve and validate template (stored without .md extension)
	const templatePath = settings.templatePath.endsWith(".md")
		? settings.templatePath
		: `${settings.templatePath}.md`;
	const templateFile = app.vault.getAbstractFileByPath(templatePath) as TFile | null;
	if (!(templateFile instanceof TFile)) {
		throw new Error(`Template not found: ${templatePath}`);
	}

	// 1. Move PDF to the configured attachment folder
	const attachmentFolder = resolveAttachmentFolder(settings, originalFolder);
	await ensureFolder(app, attachmentFolder);

	const newPdfPath = attachmentFolder
		? normalizePath(`${attachmentFolder}/${pdfName}`)
		: pdfName;

	if (newPdfPath !== pdfFile.path) {
		if (app.vault.getAbstractFileByPath(newPdfPath)) {
			throw new Error(`A file already exists at ${newPdfPath}`);
		}
		await app.fileManager.renameFile(pdfFile, newPdfPath);
	}
	// After renameFile, pdfFile.path is now newPdfPath

	// 2. Create wrapper note from template
	const noteFile = await createNoteFromTemplate(app, templateFile, originalFolder, pdfBasename);

	// 3. Update frontmatter attachment property
	await updateFrontmatter(app, noteFile, pdfFile.path);

	// 4. Fix embed links to point to the moved PDF
	await updateEmbedLinks(noteFile, app, pdfBasename, pdfFile.path);

	// 5. Open the new note
	await app.workspace.getLeaf().openFile(noteFile);
}

/**
 * Resolve the Obsidian "Default location for new attachments" setting
 * relative to the note's original folder.
 */
function resolveAttachmentFolder(settings: PdfWrapperSettings, noteFolder: TFolder): string {
	const raw = settings.attachmentsPath;

	// Vault root (default)
	if (!raw || raw === "/") return "";

	// Relative to current file: "./" or "./subfolder"
	if (raw.startsWith("./")) {
		const relative = raw.slice(2);
		const parent = noteFolder.isRoot() ? "" : noteFolder.path;
		if (!relative) return parent;
		return parent ? `${parent}/${relative}` : relative;
	}

	// Absolute vault path
	return raw;
}

async function ensureFolder(app: App, path: string): Promise<void> {
	if (!path) return;
	if (app.vault.getAbstractFileByPath(path)) return;
	await app.vault.createFolder(path);
}

async function createNoteFromTemplate(
	app: App,
	templateFile: TFile,
	folder: TFolder,
	filename: string,
): Promise<TFile> {
	// Try Templater plugin first — it handles its own placeholder resolution
	const templater = (app as any).plugins?.plugins?.["templater-obsidian"];
	if (templater?.templater?.create_new_note_from_template) {
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

function resolveCoreTemplatePlaceholders(app: App, content: string, title: string): string {
	const m = (window as any).moment;

	const coreTemplates = (app as any).internalPlugins?.getPluginById?.("templates");
	const opts = coreTemplates?.instance?.options;
	const dateFormat: string = opts?.dateFormat || "YYYY-MM-DD";
	const timeFormat: string = opts?.timeFormat || "HH:mm";

	const date: string = m ? m().format(dateFormat) : new Date().toISOString().slice(0, 10);
	const time: string = m ? m().format(timeFormat) : new Date().toTimeString().slice(0, 5);

	return content
		.replace(/\{\{title\}\}/g, title)
		.replace(/\{\{date\}\}/g, date)
		.replace(/\{\{time\}\}/g, time);
}

async function updateFrontmatter(app: App, noteFile: TFile, pdfPath: string): Promise<void> {
	const pdfName = pdfPath.split("/").pop() ?? pdfPath;
	const wikilink = `[[${pdfPath}|${pdfName}]]`;

	await app.fileManager.processFrontMatter(noteFile, (fm: Record<string, any>) => {
		const keys = Object.keys(fm);
		const attachmentsKey = keys.find(k => k.toLowerCase() === "attachments");
		const attachmentKey = keys.find(k => k.toLowerCase() === "attachment");

		if (attachmentsKey) {
			if (!Array.isArray(fm[attachmentsKey])) {
				fm[attachmentsKey] = fm[attachmentsKey] ? [fm[attachmentsKey]] : [];
			}
			(fm[attachmentsKey] as string[]).push(wikilink);
		} else if (attachmentKey) {
			fm[attachmentKey] = wikilink;
		}
	});
}

async function updateEmbedLinks(
	noteFile: TFile,
	app: App,
	pdfBasename: string,
	pdfPath: string,
): Promise<void> {
	let content = await app.vault.read(noteFile);
	const escaped = pdfBasename.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
	const linkTarget = pdfPath.replace(/\.pdf$/i, "") + ".pdf";

	// Replace ![[basename.pdf]] or ![[basename]] with full path
	const namePattern = new RegExp(`!\\[\\[${escaped}(\\.pdf)?\\]\\]`, "g");

	// Replace unresolved template placeholders like ![[{{file}}.pdf]] or ![[{{title}}]]
	const placeholderPattern = /!\[\[\{\{(?:file|title)\}\}(?:\.pdf)?\]\]/gi;

	const replacement = `![[${linkTarget}]]`;
	const updated = content
		.replace(namePattern, replacement)
		.replace(placeholderPattern, replacement);

	if (updated !== content) {
		await app.vault.modify(noteFile, updated);
	}
}
