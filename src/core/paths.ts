// Vault paths use "/" and have no leading slash. The root folder is "".

export function dirname(path: string): string {
	const i = path.lastIndexOf("/");
	return i < 0 ? "" : path.slice(0, i);
}

export function filename(path: string): string {
	return path.slice(path.lastIndexOf("/") + 1);
}

export function basename(path: string): string {
	const name = filename(path);
	const dot = name.lastIndexOf(".");
	return dot <= 0 ? name : name.slice(0, dot);
}

/** Lower-cased, without the dot. Empty when the name has no extension. */
export function extension(path: string): string {
	const name = filename(path);
	const dot = name.lastIndexOf(".");
	return dot <= 0 ? "" : name.slice(dot + 1).toLowerCase();
}

export function joinPath(dir: string, name: string): string {
	return dir === "" ? name : `${dir}/${name}`;
}

export function isPdf(path: string): boolean {
	return extension(path) === "pdf";
}

export function isNote(path: string): boolean {
	return extension(path) === "md";
}

/** True for the folder itself or anything below it, at any depth. */
export function isInFolder(path: string, folder: string): boolean {
	return folder === "" || path === folder || path.startsWith(`${folder}/`);
}

/** Same folder and same base name (case-sensitive); note is .md, pdf is .pdf. */
export function samePair(notePath: string, pdfPath: string): boolean {
	return isNote(notePath)
		&& isPdf(pdfPath)
		&& dirname(notePath) === dirname(pdfPath)
		&& basename(notePath) === basename(pdfPath);
}

/** The entry of `paths` equal to `path` ignoring letter case, as a case-insensitive file system would see it, or null. */
export function findPathIgnoringCase(paths: string[], path: string): string | null {
	const wanted = path.toLowerCase();
	return paths.find((p) => p.toLowerCase() === wanted) ?? null;
}

/**
 * The folder and base name, lower-cased: a note and a PDF that would pair on a case-insensitive file system share
 * this key. Only meaningful between a note and a PDF; the extension is not part of it.
 */
export function pairKey(path: string): string {
	return `${dirname(path)}/${basename(path)}`.toLowerCase();
}
