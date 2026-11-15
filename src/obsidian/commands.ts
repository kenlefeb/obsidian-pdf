import { Notice, TFile, type App } from "obsidian";
import { attentionNotice } from "../core/attention.ts";
import { isNote, isPdf } from "../core/paths.ts";
import type PdfWrapperPlugin from "../main.ts";
import { existingSiblingNote, wrapPdf, WrapMessage } from "../pdf-wrapper.ts";
import { AttentionModal } from "../ui/attention-modal.ts";
import type { AttentionStore } from "./attention-store.ts";
import { duplicateWrapped, healthyPdf } from "./duplicate.ts";
import type { Executor } from "./execute.ts";

export interface CommandDeps {
	executor: Executor;
	store: AttentionStore;
	/** The coalescing refresh of the list and the explorer rules. */
	refreshSoon: () => void;
}

/** True when "Wrap PDF" can act on the file: a PDF with no note beside it yet. */
function canWrap(app: App, file: TFile): boolean {
	return isPdf(file.path) && existingSiblingNote(app, file) === null;
}

/** True when "Duplicate wrapped document" can act on the file: the note of a healthy pair. */
function canDuplicate(plugin: PdfWrapperPlugin, file: TFile): boolean {
	return isNote(file.path) && healthyPdf(plugin.app, plugin.settings, file) !== null;
}

/**
 * Registers the commands and file-menu items. Returns the function that opens the Needs attention list, for the
 * startup notice.
 */
export function registerCommands(plugin: PdfWrapperPlugin, deps: CommandDeps): { showAttention: () => void } {
	const { app } = plugin;
	const showAttention = () => new AttentionModal(app, deps.store).open();
	const duplicate = (file: TFile) => void duplicateWrapped(app, deps.executor, plugin.settings, file, deps.refreshSoon);

	plugin.addCommand({
		id: 'show-needs-attention',
		name: 'Show documents needing attention',
		callback: showAttention,
	});
	plugin.addCommand({
		id: 'scan-pairs',
		name: 'Check wrapped documents',
		callback: () => {
			void deps.store.refresh().then(showAttention);
		},
	});
	plugin.addCommand({
		id: 'wrap-active-pdf',
		name: 'Wrap active PDF',
		checkCallback: (checking) => {
			const file = app.workspace.getActiveFile();
			if (!file || !canWrap(app, file)) return false;
			if (!checking) void wrapFromUser(plugin, file, deps.refreshSoon);
			return true;
		},
	});
	plugin.addCommand({
		id: 'duplicate-wrapped-document',
		name: 'Duplicate wrapped document',
		checkCallback: (checking) => {
			const file = app.workspace.getActiveFile();
			if (!file || !canDuplicate(plugin, file)) return false;
			if (!checking) duplicate(file);
			return true;
		},
	});

	plugin.registerEvent(
		app.workspace.on('file-menu', (menu, file) => {
			if (!(file instanceof TFile)) return;
			if (canDuplicate(plugin, file)) {
				menu.addItem((item) => {
					item.setTitle('Duplicate wrapped document')
						.setIcon('copy')
						.onClick(() => duplicate(file));
				});
			}
			// Offered only when the command would be: not for a PDF that already has its note.
			if (canWrap(app, file)) {
				menu.addItem((item) => {
					item.setTitle('Wrap PDF')
						.setIcon('file-text')
						.onClick(() => wrapFromUser(plugin, file, deps.refreshSoon));
				});
			}
		}),
	);

	return { showAttention };
}

/** The startup notice saying how many entries the list has; clicking it opens the list. */
export function showStartupNotice(count: number, showAttention: () => void): void {
	const notice = new Notice(attentionNotice(count));
	notice.messageEl.addEventListener('click', () => {
		notice.hide();
		showAttention();
	});
}

/** A wrap the user asked for: opens the note and reports the outcome in a notice. */
async function wrapFromUser(plugin: PdfWrapperPlugin, pdfFile: TFile, afterWrap: () => void): Promise<void> {
	try {
		await wrapPdf(plugin.app, plugin.settings, () => plugin.saveSettings(), pdfFile, { open: true });
		new Notice(`Wrapped ${pdfFile.basename}`);
	} catch (e) {
		if (e instanceof WrapMessage) {
			new Notice(e.message);
			return;
		}
		new Notice(`Failed to wrap ${pdfFile.name}: ${e instanceof Error ? e.message : String(e)}`);
		console.error('PDF Wrapper: failed to wrap', pdfFile.path, e);
	} finally {
		// A wrap that ended incomplete still created the note, so pairs may have changed either way.
		try {
			afterWrap();
		} catch (e) {
			console.error('PDF Wrapper: refresh after wrap failed', e);
		}
	}
}
