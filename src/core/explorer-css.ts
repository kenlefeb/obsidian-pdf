/** Escapes \ and " for use inside a double-quoted attribute selector. */
export function cssAttrValue(path: string): string {
	return path.replace(/[\\"]/g, "\\$&");
}

export function buildExplorerCss(pairs: { notePath: string; pdfPath: string }[], options: { hide: boolean }): string {
	const rules: string[] = [];
	for (const { notePath, pdfPath } of pairs) {
		if (options.hide) {
			rules.push(`.nav-file:has(> .nav-file-title[data-path="${cssAttrValue(pdfPath)}"]) { display: none; }`);
		}
		rules.push(
			`.nav-file-title[data-path="${cssAttrValue(notePath)}"] .nav-file-title-content::after { content: " PDF"; color: var(--text-faint); font-size: var(--font-ui-smaller); }`,
		);
	}
	return rules.join("\n");
}
