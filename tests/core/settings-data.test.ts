import { expect, test } from "vitest";
import { DEFAULT_SETTINGS, mergeSettings, specificAttachmentFolder } from "../../src/core/settings-data.ts";

test("defaults when nothing saved", () => {
	expect(mergeSettings(null)).toEqual({ templatePath: "", markerProperty: "wrapped-pdf", hidePairedPdfs: true, pendingRemovedPdfs: [] });
});

test("keeps valid saved values and drops unknown keys", () => {
	expect(mergeSettings({ templatePath: "T/pdf", markerProperty: "pdf", hidePairedPdfs: false, pendingRemovedPdfs: ["a/b.pdf"], app: {}, _attachmentsPath: "x" }))
		.toEqual({ templatePath: "T/pdf", markerProperty: "pdf", hidePairedPdfs: false, pendingRemovedPdfs: ["a/b.pdf"] });
});

test("wrong types and blank marker fall back to defaults", () => {
	expect(mergeSettings({ templatePath: 5, markerProperty: "  ", hidePairedPdfs: "yes", pendingRemovedPdfs: "x" })).toEqual(DEFAULT_SETTINGS);
});

test("marker name is trimmed", () => {
	expect(mergeSettings({ markerProperty: " pdf " }).markerProperty).toBe("pdf");
});

test("result is JSON-serialisable and not the defaults object", () => {
	const s = mergeSettings({});
	expect(JSON.parse(JSON.stringify(s))).toEqual(s);
	expect(s).not.toBe(DEFAULT_SETTINGS);
	expect(s.pendingRemovedPdfs).not.toBe(DEFAULT_SETTINGS.pendingRemovedPdfs);
});

test("specificAttachmentFolder", () => {
	expect(specificAttachmentFolder("attachments")).toBe("attachments");
	expect(specificAttachmentFolder("a/b/")).toBe("a/b");
	for (const v of ["", "/", "./", "./attachments", undefined, 3]) expect(specificAttachmentFolder(v)).toBeNull();
});
