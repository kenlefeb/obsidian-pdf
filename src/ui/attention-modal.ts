import { ButtonComponent, Modal, Platform, SuggestModal, type App } from "obsidian";
import { fixLabel, rowFile, stateLine } from "../core/attention.ts";
import { candidatesForMissing, fixesFor } from "../core/fixes.ts";
import type { AttentionItem, FixId } from "../core/types.ts";
import type { AttentionStore } from "../obsidian/attention-store.ts";

/** The Needs attention list: one row per entry, with a button per fix. Re-renders whenever the store changes. */
export class AttentionModal extends Modal {
	private unsubscribe: (() => void) | null = null;

	constructor(app: App, private readonly store: AttentionStore) {
		super(app);
	}

	onOpen(): void {
		this.modalEl.addClass("pdf-wrapper-attention");
		if (Platform.isMobile) this.modalEl.addClass("pdf-wrapper-mobile");
		this.setTitle("Documents needing attention");
		this.unsubscribe = this.store.onChange(() => this.render());
		this.render();
	}

	onClose(): void {
		this.unsubscribe?.();
		this.unsubscribe = null;
		this.contentEl.empty();
	}

	private render(): void {
		const { contentEl } = this;
		contentEl.empty();
		const items = this.store.items();
		if (items.length === 0) {
			contentEl.createEl("p", { text: "Everything is in order.", cls: "pdf-wrapper-attention-empty" });
			return;
		}

		const counts = this.store.bulkCounts();
		if (counts.fix > 0 || counts.wrap > 0) {
			const header = contentEl.createDiv({ cls: "pdf-wrapper-attention-header" });
			if (counts.fix > 0) {
				new ButtonComponent(header).setButtonText("Fix all").onClick(() => this.busy(() => this.store.fixAll()));
			}
			if (counts.wrap > 0) {
				new ButtonComponent(header).setButtonText("Wrap all").onClick(() => this.busy(() => this.store.wrapAll()));
			}
		}

		const list = contentEl.createDiv({ cls: "pdf-wrapper-attention-list" });
		for (const item of items) this.renderRow(list, item);
	}

	private renderRow(list: HTMLElement, item: AttentionItem): void {
		const row = list.createDiv({ cls: "pdf-wrapper-attention-row" });
		const info = row.createDiv({ cls: "pdf-wrapper-attention-info" });
		const file = rowFile(item);
		info.createDiv({ text: file.name, cls: "pdf-wrapper-attention-name" });
		info.createDiv({ text: file.folder, cls: "pdf-wrapper-attention-folder" });
		info.createDiv({ text: stateLine(item, this.store.classification()), cls: "pdf-wrapper-attention-state" });

		const fixes = row.createDiv({ cls: "pdf-wrapper-attention-fixes" });
		fixesFor(item.kind).forEach((fix, i) => {
			const button = new ButtonComponent(fixes).setButtonText(fixLabel(fix));
			if (i === 0) button.setCta();
			if (fix === "choose-pdf") {
				const candidates = candidatesForMissing(item, this.store.classification());
				if (candidates.length === 0) {
					// eslint-disable-next-line obsidianmd/ui/sentence-case -- "PDFs" is an acronym's plural; the text is the brief's wording.
					button.setDisabled(true).setTooltip("No candidate PDFs found");
					return;
				}
				button.onClick(() => new PdfChoiceModal(this.app, candidates, (pdf) => this.apply(item, fix, pdf)).open());
			} else if (fix === "delete-pdf") {
				const path = item.pdfPath ?? "";
				button.onClick(() => new ConfirmDeleteModal(this.app, path, () => this.apply(item, fix)).open());
			} else {
				button.onClick(() => this.apply(item, fix));
			}
		});
	}

	private apply(item: AttentionItem, fix: FixId, chosenPdf?: string): void {
		this.busy(() => this.store.applyFix(item, fix, chosenPdf));
	}

	/** Disables every button until `work` settles; the store's refresh then re-renders the list. */
	private busy(work: () => Promise<unknown>): void {
		this.contentEl.querySelectorAll("button").forEach((b) => b.disabled = true);
		work().catch((error: unknown) => console.error("PDF Wrapper: fix failed", error))
			.finally(() => {
				if (this.unsubscribe !== null) this.render();
			});
	}
}

class PdfChoiceModal extends SuggestModal<string> {
	constructor(app: App, private readonly candidates: string[], private readonly choose: (pdf: string) => void) {
		super(app);
		this.setPlaceholder("Choose the PDF for this note");
	}

	getSuggestions(query: string): string[] {
		const q = query.toLowerCase();
		return this.candidates.filter((p) => p.toLowerCase().includes(q));
	}

	renderSuggestion(pdf: string, el: HTMLElement): void {
		el.setText(pdf);
	}

	onChooseSuggestion(pdf: string): void {
		this.choose(pdf);
	}
}

class ConfirmDeleteModal extends Modal {
	constructor(app: App, private readonly path: string, private readonly confirm: () => void) {
		super(app);
	}

	onOpen(): void {
		if (Platform.isMobile) this.modalEl.addClass("pdf-wrapper-mobile");
		this.setTitle("Delete the PDF?");
		this.contentEl.createEl("p", { text: `${this.path} will be deleted, as your "Deleted files" setting says.` });
		const buttons = this.contentEl.createDiv({ cls: "pdf-wrapper-confirm-buttons" });
		new ButtonComponent(buttons).setButtonText("Cancel").onClick(() => this.close());
		new ButtonComponent(buttons).setButtonText("Delete").setWarning().onClick(() => {
			this.close();
			this.confirm();
		});
	}

	onClose(): void {
		this.contentEl.empty();
	}
}
