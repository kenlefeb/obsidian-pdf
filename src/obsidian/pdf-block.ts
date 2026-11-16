import {
	Component,
	Keymap,
	MarkdownRenderChild,
	MarkdownRenderer,
	TFile,
	type App,
	type Plugin,
	type TAbstractFile,
	type TFolder,
} from "obsidian";
import { BLOCK_LANGUAGE, blockView, sameBlockView, type BlockView } from "../core/block.ts";
import { dirname, isPdf } from "../core/paths.ts";

/**
 * Renders, in place of a `wrapped-pdf` code block, the PDF beside the note the block is in. The block's own content
 * is ignored. Nothing here writes a file.
 */
export function registerPdfBlock(plugin: Plugin): void {
	plugin.registerMarkdownCodeBlockProcessor(BLOCK_LANGUAGE, (_source, el, ctx) => {
		ctx.addChild(new PdfBlock(plugin.app, el, ctx.sourcePath));
	});
}

// Obsidian's own embeds, by file extension. Not in the public type definitions, so everything is optional here and
// every use is inside try/catch.
type EmbedContext = { app: App; linktext: string; sourcePath: string; containerEl: HTMLElement; depth: number };
type EmbedLike = { loadFile?: () => unknown; unload?: () => void };
type EmbedCreators = { pdf?: (context: EmbedContext, file: TFile, subpath: string) => EmbedLike | null | undefined };
type AppWithEmbeds = { embedRegistry?: { embedByExtension?: EmbedCreators } };

// Each kind of failure is logged once per session, not on every redraw.
const logged = new Set<string>();
function logOnce(kind: string, message: string, error?: unknown): void {
	if (logged.has(kind)) return;
	logged.add(kind);
	console.warn(`PDF Wrapper: ${message}`, error ?? "");
}

class PdfBlock extends MarkdownRenderChild {
	/** The note the block is in. Held as a file so a later rename or move is seen through its path. */
	private readonly note: TFile | null;
	private shown: BlockView | null = null;
	/** Owns whatever the current drawing loaded; removing it unloads the viewer. */
	private holder: Component | null = null;

	constructor(private readonly app: App, containerEl: HTMLElement, private readonly sourcePath: string) {
		super(containerEl);
		this.note = app.vault.getFileByPath(sourcePath);
	}

	onload(): void {
		this.redraw();
		const vault = this.app.vault;
		this.registerEvent(vault.on("create", (file) => this.onVaultChange(file, null)));
		this.registerEvent(vault.on("rename", (file, oldPath) => this.onVaultChange(file, oldPath)));
		this.registerEvent(vault.on("delete", (file) => this.onVaultChange(file, null, file)));
	}

	private notePath(): string {
		return this.note?.path ?? this.sourcePath;
	}

	private onVaultChange(file: TAbstractFile, oldPath: string | null, deleted?: TAbstractFile): void {
		// Only the note itself, a PDF or a folder (which carries both) can change the answer.
		const relevant = !(file instanceof TFile)
			|| file === this.note
			|| isPdf(file.path)
			|| (oldPath !== null && isPdf(oldPath));
		if (relevant) this.redraw(deleted);
	}

	/** Draws again, but only when what would be shown has changed. `deleted` is a file that no longer counts. */
	private redraw(deleted?: TAbstractFile): void {
		const notePath = this.notePath();
		const siblings = this.folder(notePath)?.children ?? [];
		const files = siblings.filter((f): f is TFile => f instanceof TFile && f !== deleted);
		const view = blockView(notePath, files.map((f) => f.path));
		if (this.shown !== null && sameBlockView(this.shown, view)) return;
		this.shown = view;

		const holder = this.fresh();
		if (view.pdfPath === null) {
			this.containerEl.createDiv({ cls: "pdf-wrapper-block-missing", text: view.message });
			return;
		}
		const pdf = files.find((f) => f.path === view.pdfPath);
		if (pdf === undefined) return;
		if (!this.drawEmbed(pdf, holder)) void this.drawMarkdown(pdf);
	}

	private folder(notePath: string): TFolder | null {
		if (this.note !== null) return this.note.parent;
		const dir = dirname(notePath);
		return dir === "" ? this.app.vault.getRoot() : this.app.vault.getFolderByPath(dir);
	}

	/** Unloads the previous drawing, empties the block and returns the owner for the next drawing. */
	private fresh(): Component {
		if (this.holder !== null) this.removeChild(this.holder);
		this.containerEl.empty();
		this.holder = this.addChild(new Component());
		return this.holder;
	}

	/** Obsidian's own PDF embed. False when it is not available or failed at once; the caller then falls back. */
	private drawEmbed(pdf: TFile, holder: Component): boolean {
		try {
			const creators = (this.app as unknown as AppWithEmbeds).embedRegistry?.embedByExtension;
			if (typeof creators?.pdf !== "function") {
				logOnce("embed-missing", "Obsidian's PDF embed is not available; showing the PDF as a rendered embed link instead.");
				return false;
			}
			// The classes Obsidian gives its own PDF embeds, so the theme sizes the viewer the same way.
			const el = this.containerEl.createDiv({ cls: "pdf-wrapper-block-pdf internal-embed pdf-embed is-loaded" });
			const embed = creators.pdf(
				{ app: this.app, linktext: pdf.path, sourcePath: this.notePath(), containerEl: el, depth: 0 },
				pdf,
				"",
			);
			if (embed === null || embed === undefined) throw new Error("no embed was created");
			const { loadFile, unload } = embed;
			const made: unknown = embed;
			if (made instanceof Component) holder.addChild(made);
			else if (typeof unload === "function") holder.register(() => unload.call(embed));
			if (typeof loadFile === "function") {
				// A viewer that fails while loading is replaced by the fallback, unless the block has moved on.
				Promise.resolve(loadFile.call(embed)).catch((error: unknown) => {
					logOnce("embed-failed", "Obsidian's PDF embed failed; showing the PDF as a rendered embed link instead.", error);
					if (this.holder === holder) void this.drawMarkdown(pdf);
				});
			}
			return true;
		} catch (error) {
			logOnce("embed-failed", "Obsidian's PDF embed failed; showing the PDF as a rendered embed link instead.", error);
			return false;
		}
	}

	/** Fallback: let Obsidian render an embed of the PDF. If that fails too, a plain link. */
	private async drawMarkdown(pdf: TFile): Promise<void> {
		const holder = this.fresh();
		try {
			const el = this.containerEl.createDiv({ cls: "pdf-wrapper-block-pdf" });
			await MarkdownRenderer.render(this.app, `![[${pdf.path}]]`, el, this.notePath(), holder);
		} catch (error) {
			logOnce("markdown-failed", "could not render the PDF embed; showing a link instead.", error);
			if (this.holder === holder) this.drawLink(pdf);
		}
	}

	private drawLink(pdf: TFile): void {
		this.fresh();
		const link = this.containerEl.createEl("a", { cls: "internal-link", text: pdf.name, href: pdf.path });
		link.setAttr("data-href", pdf.path);
		link.addEventListener("click", (evt) => {
			evt.preventDefault();
			evt.stopPropagation();
			void this.app.workspace.openLinkText(pdf.path, this.notePath(), Keymap.isModEvent(evt));
		});
	}
}
