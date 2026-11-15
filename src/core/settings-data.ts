export interface PdfWrapperSettings {
	templatePath: string;
	markerProperty: string;
	hidePairedPdfs: boolean;
	pendingRemovedPdfs: string[];
}

export const DEFAULT_SETTINGS: PdfWrapperSettings = {
	templatePath: "",
	markerProperty: "wrapped-pdf",
	hidePairedPdfs: true,
	pendingRemovedPdfs: [],
};

function isRecord(value: unknown): value is Record<string, unknown> {
	return typeof value === "object" && value !== null && !Array.isArray(value);
}

/**
 * Build a plain settings object from whatever was saved on disk.
 * Unknown keys are dropped and values of the wrong type fall back to defaults.
 */
export function mergeSettings(saved: unknown): PdfWrapperSettings {
	const data = isRecord(saved) ? saved : {};

	const marker = typeof data.markerProperty === "string" ? data.markerProperty.trim() : "";

	return {
		templatePath: typeof data.templatePath === "string" ? data.templatePath : DEFAULT_SETTINGS.templatePath,
		markerProperty: marker || DEFAULT_SETTINGS.markerProperty,
		hidePairedPdfs: typeof data.hidePairedPdfs === "boolean" ? data.hidePairedPdfs : DEFAULT_SETTINGS.hidePairedPdfs,
		pendingRemovedPdfs: Array.isArray(data.pendingRemovedPdfs)
			? data.pendingRemovedPdfs.filter((p): p is string => typeof p === "string")
			: [],
	};
}

/**
 * Interpret Obsidian's raw "attachmentFolderPath" config value.
 * Returns the vault folder path when it names one specific folder, or null for
 * the vault root, a path relative to the note ("./..."), or an unusable value.
 */
export function specificAttachmentFolder(raw: unknown): string | null {
	if (typeof raw !== "string") return null;
	if (raw.startsWith("./")) return null;
	const folder = raw.replace(/\/+$/, "");
	return folder || null;
}
