import type { Plugin } from "obsidian";
import { healthyPairs } from "../core/classify.ts";
import { buildExplorerCss } from "../core/explorer-css.ts";
import type { AttentionStore } from "./attention-store.ts";

/** A burst of refreshes produces one rebuild this long after the last one. */
const REBUILD_DELAY_MS = 100;

type Pair = { notePath: string; pdfPath: string };

/**
 * One constructed stylesheet in `doc.adoptedStyleSheets`, holding the generated explorer rules. Purely cosmetic:
 * if the browser cannot build or apply the sheet, it warns once and does nothing from then on.
 */
export class ExplorerStyle {
	private sheet: CSSStyleSheet | null = null;
	private text = "";

	constructor(private readonly doc: Document) {
		try {
			const sheet = new CSSStyleSheet();
			doc.adoptedStyleSheets = [...doc.adoptedStyleSheets, sheet];
			this.sheet = sheet;
		} catch (error) {
			console.warn("PDF Wrapper: could not add the file explorer styling; paired PDFs stay visible.", error);
		}
	}

	update(pairs: Pair[], hide: boolean): void {
		if (this.sheet === null) return;
		const text = buildExplorerCss(pairs, { hide });
		if (text === this.text) return;
		try {
			this.sheet.replaceSync(text);
			this.text = text;
		} catch (error) {
			console.warn("PDF Wrapper: could not update the file explorer styling; paired PDFs stay visible.", error);
			this.remove();
		}
	}

	remove(): void {
		const sheet = this.sheet;
		if (sheet === null) return;
		try {
			this.doc.adoptedStyleSheets = this.doc.adoptedStyleSheets.filter((s) => s !== sheet);
		} catch (error) {
			console.warn("PDF Wrapper: could not remove the file explorer styling", error);
		}
		this.sheet = null;
	}
}

/**
 * Keeps the explorer rules in step with the store's healthy pairs: rebuilt (debounced) after every store change
 * and whenever `rebuild` is called, for example when the hide setting changes. Applies to the main window's
 * document only; popout windows have their own document and are not styled.
 * Removes the sheet, so every row reappears, when the plugin unloads.
 */
export function installExplorerStyle(plugin: Plugin, store: AttentionStore, shouldHide: () => boolean): { rebuild(): void } {
	const style = new ExplorerStyle(document);
	let timer: number | null = null;
	let unloaded = false;
	const apply = () => {
		timer = null;
		// Before the first scan the classification is empty, which would only un-hide rows.
		if (unloaded || !store.hasScanned()) return;
		try {
			style.update(healthyPairs(store.classification()), shouldHide());
		} catch (error) {
			console.warn("PDF Wrapper: could not rebuild the file explorer styling; it stays as it was.", error);
		}
	};
	const rebuild = () => {
		if (unloaded) return;
		if (timer !== null) window.clearTimeout(timer);
		timer = window.setTimeout(apply, REBUILD_DELAY_MS);
	};
	store.onChange(rebuild);
	plugin.register(() => {
		unloaded = true;
		if (timer !== null) window.clearTimeout(timer);
		style.remove();
	});
	return { rebuild };
}
