import { ButtonComponent, Modal, Platform, SuggestModal, type App } from "obsidian";
import { repairLabel, rowFile, stateLine } from "../core/list-text.ts";
import type { ListItem, Pairing, RepairId } from "../core/model.ts";
import { copyCandidates, describeConvert, describeConvertAll, pdfCandidates, renameCandidates, repairsFor } from "../core/repairs.ts";
import type { AttentionStore } from "../obsidian/attention-store.ts";

/** The repairs that first ask which PDF: what the chooser says, and the PDFs it offers. */
const CHOICES: Partial<Record<RepairId, { placeholder: string; candidates: (item: ListItem, pairing: Pairing) => string[] }>> = {
	"use-pdf": { placeholder: "Choose the PDF for this note", candidates: pdfCandidates },
	"rename-note-to-pdf": { placeholder: "Choose the PDF whose name this note takes", candidates: renameCandidates },
	"copy-pdf": { placeholder: "Choose the wrapped document whose PDF is copied", candidates: copyCandidates },
};

/** The Needs attention list: one row per entry, with a button per repair. Re-renders whenever the store changes. */
export class AttentionModal extends Modal {
	private unsubscribe: (() => void) | null = null;
	private untrack: (() => void) | null = null;
	/** Repairs clicked here whose task has not settled yet; while any is, every button stays disabled. */
	private running = 0;
	/** The check started on open has finished without any check ever completing. */
	private checkFailed = false;

	constructor(app: App, private readonly store: AttentionStore) {
		super(app);
	}

	onOpen(): void {
		this.untrack = this.store.trackModal(this);
		this.modalEl.addClass("pdf-wrapper-attention");
		if (Platform.isMobile) this.modalEl.addClass("pdf-wrapper-mobile");
		this.setTitle("Documents needing attention");
		this.unsubscribe = this.store.onChange(() => this.render());
		this.render();
		if (!this.store.hasScanned()) {
			void this.store.refresh().then(() => {
				// A failed check keeps no list; say so rather than stay on "Checking…".
				if (this.unsubscribe === null || this.store.hasScanned()) return;
				this.checkFailed = true;
				this.render();
			});
		}
	}

	onClose(): void {
		this.unsubscribe?.();
		this.unsubscribe = null;
		this.untrack?.();
		this.untrack = null;
		this.contentEl.empty();
	}

	private render(): void {
		const { contentEl } = this;
		contentEl.empty();
		if (!this.store.hasScanned()) {
			const text = this.checkFailed ? "Could not check wrapped documents. Close this and try again." : "Checking…";
			contentEl.createEl("p", { text, cls: "pdf-wrapper-attention-empty" });
			return;
		}
		const items = this.store.items();
		if (items.length === 0) {
			contentEl.createEl("p", { text: "Everything is in order.", cls: "pdf-wrapper-attention-empty" });
			return;
		}

		const counts = this.store.bulkCounts();
		if (counts.convert > 0 || counts.wrap > 0) {
			const header = contentEl.createDiv({ cls: "pdf-wrapper-attention-header" });
			if (counts.convert > 0) {
				// One confirmation for the whole run.
				new ButtonComponent(header).setButtonText("Convert all").onClick(() => new ConfirmModal(this.app, this.store, {
					title: "Convert all?",
					text: describeConvertAll(counts.convert),
					button: "Convert all",
				}, () => this.busy(() => this.store.convertAll())).open());
			}
			if (counts.wrap > 0) {
				new ButtonComponent(header).setButtonText("Wrap all").onClick(() => this.busy(() => this.store.wrapAll()));
			}
		}

		const list = contentEl.createDiv({ cls: "pdf-wrapper-attention-list" });
		for (const item of items) this.renderRow(list, item);
		if (this.running > 0) this.disableButtons();
	}

	private renderRow(list: HTMLElement, item: ListItem): void {
		const pairing = this.store.pairing();
		const row = list.createDiv({ cls: "pdf-wrapper-attention-row" });
		const info = row.createDiv({ cls: "pdf-wrapper-attention-info" });
		const file = rowFile(item);
		info.createDiv({ text: file.name, cls: "pdf-wrapper-attention-name" });
		info.createDiv({ text: file.folder, cls: "pdf-wrapper-attention-folder" });
		info.createDiv({ text: stateLine(item, pairing), cls: "pdf-wrapper-attention-state" });

		const repairs = repairsFor(item, pairing);
		if (item.kind === "pdf-not-found" && !repairs.includes("use-pdf")) {
			// Say why "Use a PDF" is not offered; the PDF may simply not have arrived yet.
			info.createDiv({
				text: "No unwrapped PDF is in its folder or has its name. It may not have downloaded yet.",
				cls: "pdf-wrapper-attention-hint",
			});
		}
		const buttons = row.createDiv({ cls: "pdf-wrapper-attention-fixes" });
		repairs.forEach((repair, i) => {
			const button = new ButtonComponent(buttons).setButtonText(repairLabel(repair));
			// Removing the marker is never the suggested way out.
			if (i === 0 && repair !== "remove-marker") button.setCta();
			const choice = CHOICES[repair];
			if (choice !== undefined) {
				const candidates = choice.candidates(item, pairing);
				button.onClick(() => new PdfChoiceModal(this.app, this.store, choice.placeholder, candidates,
					(pdf) => this.apply(item, repair, pdf)).open());
			} else if (repair === "convert") {
				button.onClick(() => new ConfirmModal(this.app, this.store, {
					title: "Convert this note?",
					text: describeConvert(item, pairing),
					button: "Convert",
				}, () => this.apply(item, repair)).open());
			} else if (repair === "delete-pdf") {
				button.onClick(() => new ConfirmModal(this.app, this.store, {
					title: "Delete the PDF?",
					text: `${item.pdfPath ?? ""} will be deleted, as your "Deleted files" setting says.`,
					button: "Delete",
					warning: true,
				}, () => this.apply(item, repair)).open());
			} else {
				button.onClick(() => this.apply(item, repair));
			}
		});
	}

	private apply(item: ListItem, repair: RepairId, chosenPdf?: string): void {
		this.busy(() => this.store.applyRepair(item, repair, chosenPdf));
	}

	/** Keeps every button disabled from now until `work` settles, across any re-render in between. */
	private busy(work: () => Promise<unknown>): void {
		this.running++;
		this.disableButtons();
		work().catch((error: unknown) => console.error("PDF Wrapper: repair failed", error))
			.finally(() => {
				this.running--;
				if (this.unsubscribe !== null) this.render();
			});
	}

	private disableButtons(): void {
		this.contentEl.querySelectorAll("button").forEach((b) => b.disabled = true);
	}
}

class PdfChoiceModal extends SuggestModal<string> {
	private untrack: (() => void) | null = null;

	constructor(
		app: App,
		private readonly store: AttentionStore,
		placeholder: string,
		private readonly candidates: string[],
		private readonly choose: (pdf: string) => void,
	) {
		super(app);
		this.setPlaceholder(placeholder);
	}

	onOpen(): void {
		void super.onOpen();
		this.untrack = this.store.trackModal(this);
	}

	onClose(): void {
		super.onClose();
		this.untrack?.();
		this.untrack = null;
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

/** Asks before a repair runs: says what it will do, with Cancel and a button that goes ahead. */
class ConfirmModal extends Modal {
	private untrack: (() => void) | null = null;

	constructor(
		app: App,
		private readonly store: AttentionStore,
		private readonly ask: { title: string; text: string; button: string; warning?: boolean },
		private readonly confirm: () => void,
	) {
		super(app);
	}

	onOpen(): void {
		this.untrack = this.store.trackModal(this);
		if (Platform.isMobile) this.modalEl.addClass("pdf-wrapper-mobile");
		this.setTitle(this.ask.title);
		this.contentEl.createEl("p", { text: this.ask.text });
		const buttons = this.contentEl.createDiv({ cls: "pdf-wrapper-confirm-buttons" });
		new ButtonComponent(buttons).setButtonText("Cancel").onClick(() => this.close());
		const go = new ButtonComponent(buttons).setButtonText(this.ask.button).onClick(() => {
			this.close();
			this.confirm();
		});
		if (this.ask.warning === true) go.setWarning();
		else go.setCta();
	}

	onClose(): void {
		this.untrack?.();
		this.untrack = null;
		this.contentEl.empty();
	}
}
