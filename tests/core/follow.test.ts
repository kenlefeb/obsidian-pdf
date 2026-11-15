import { expect, test } from "vitest";
import { copySourceByText, follow } from "../../src/core/follow.ts";
import type { MarkedNote, VaultSnapshot } from "../../src/core/model.ts";

const m = (notePath: string): MarkedNote => ({ notePath, markerLink: null, linkedPdf: null, ownTargets: [] });
/** Every note listed in `marked` is also in notePaths; `plain` adds unmarked notes. */
const snap = (marked: string[], pdfPaths: string[], plain: string[] = []): VaultSnapshot =>
	({ notePaths: [...marked, ...plain], pdfPaths, marked: marked.map(m) });
const recheckOnly = { actions: [], recheck: true, pendingRemoved: null };

// Rename of the note.

test("renaming the note renames the PDF and edits nothing", () => {
	const r = follow({ kind: "rename", path: "a/New.md", oldPath: "a/Old.md", local: true },
		{ notePaths: ["a/New.md"], pdfPaths: ["a/Old.pdf"], marked: [{ notePath: "a/New.md", markerLink: null, linkedPdf: null, ownTargets: [] }] });
	expect(r.actions).toEqual([{ type: "rename", from: "a/Old.pdf", to: "a/New.pdf" }]);
	expect(r.recheck).toBe(false);
	expect(r.pendingRemoved).toBeNull();
});
test("moving the note to another folder moves the PDF", () => {
	const r = follow({ kind: "rename", path: "b/New.md", oldPath: "a/Old.md", local: true }, snap(["b/New.md"], ["a/Old.pdf"]));
	expect(r).toEqual({ actions: [{ type: "rename", from: "a/Old.pdf", to: "b/New.pdf" }], recheck: false, pendingRemoved: null });
});
test("moving the note into the vault root joins without a leading slash", () => {
	const r = follow({ kind: "rename", path: "New.md", oldPath: "a/Old.md", local: true }, snap(["New.md"], ["a/Old.pdf"]));
	expect(r.actions).toEqual([{ type: "rename", from: "a/Old.pdf", to: "New.pdf" }]);
});
test("the PDF keeps its own spelling of the extension", () => {
	const r = follow({ kind: "rename", path: "a/New.md", oldPath: "a/Old.md", local: true }, snap(["a/New.md"], ["a/Old.PDF"]));
	expect(r.actions).toEqual([{ type: "rename", from: "a/Old.PDF", to: "a/New.PDF" }]);
});
test("a note rename that is not local does nothing but asks for a recheck", () => {
	const r = follow({ kind: "rename", path: "b/New.md", oldPath: "a/Old.md", local: false }, snap(["b/New.md"], ["a/Old.pdf"]));
	expect(r).toEqual(recheckOnly);
});
test("renaming a note that is not marked does nothing", () => {
	const r = follow({ kind: "rename", path: "a/New.md", oldPath: "a/Old.md", local: true }, snap([], ["a/Old.pdf"], ["a/New.md"]));
	expect(r).toEqual(recheckOnly);
});
test("renaming a marked note that had no PDF beside it does nothing", () => {
	const r = follow({ kind: "rename", path: "b/New.md", oldPath: "a/Old.md", local: true }, snap(["b/New.md"], ["att/Old.pdf"]));
	expect(r).toEqual(recheckOnly);
});
test("destination taken: one notice, nothing renamed, rechecked", () => {
	const r = follow({ kind: "rename", path: "a/New.md", oldPath: "a/Old.md", local: true }, snap(["a/New.md"], ["a/Old.pdf", "a/New.pdf"]));
	expect(r).toEqual({
		actions: [{ type: "notice", message: "Could not rename a/Old.pdf to match a/New.md: a file with that name already exists." }],
		recheck: true, pendingRemoved: null });
});
test("a destination differing from an existing PDF only by case counts as taken", () => {
	const r = follow({ kind: "rename", path: "a/New.md", oldPath: "a/Old.md", local: true }, snap(["a/New.md"], ["a/Old.pdf", "a/new.pdf"]));
	expect(r.actions.map((a) => a.type)).toEqual(["notice"]);
	expect(r.recheck).toBe(true);
});
test("case-only note rename follows: the PDF itself is not a clash", () => {
	const r = follow({ kind: "rename", path: "a/Doc.md", oldPath: "a/doc.md", local: true }, snap(["a/Doc.md"], ["a/doc.pdf"]));
	expect(r).toEqual({ actions: [{ type: "rename", from: "a/doc.pdf", to: "a/Doc.pdf" }], recheck: false, pendingRemoved: null });
});
test("a note rename that changes only its extension's case leaves the PDF alone", () => {
	const r = follow({ kind: "rename", path: "a/S.MD", oldPath: "a/S.md", local: true }, snap(["a/S.MD"], ["a/S.pdf"]));
	expect(r).toEqual(recheckOnly);
});
test("folder move: the PDF is already beside the note, so nothing is done", () => {
	const r = follow({ kind: "rename", path: "z/S.md", oldPath: "a/S.md", local: true }, snap(["z/S.md"], ["z/S.pdf"]));
	expect(r).toEqual(recheckOnly);
});
test("folder move: the PDF's own event has not arrived and the old place is empty, so nothing is done", () => {
	const r = follow({ kind: "rename", path: "z/S.md", oldPath: "a/S.md", local: true }, snap(["z/S.md"], []));
	expect(r).toEqual(recheckOnly);
});
test("note rename does not take a PDF that another marked note now sits beside", () => {
	const r = follow({ kind: "rename", path: "b/New.md", oldPath: "a/Old.md", local: true }, snap(["b/New.md", "a/Old.md"], ["a/Old.pdf"]));
	expect(r).toEqual(recheckOnly);
});

// Rename of the PDF.

test("renaming the PDF renames the note", () => {
	const r = follow({ kind: "rename", path: "b/New.pdf", oldPath: "a/Old.pdf", local: true }, snap(["a/Old.md"], ["b/New.pdf"]));
	expect(r).toEqual({ actions: [{ type: "rename", from: "a/Old.md", to: "b/New.md" }], recheck: false, pendingRemoved: null });
});
test("the note keeps its own spelling of the extension", () => {
	const r = follow({ kind: "rename", path: "a/New.pdf", oldPath: "a/Old.pdf", local: true }, snap(["a/Old.MD"], ["a/New.pdf"]));
	expect(r.actions).toEqual([{ type: "rename", from: "a/Old.MD", to: "a/New.MD" }]);
});
test("a PDF rename that is not local does nothing but asks for a recheck", () => {
	const r = follow({ kind: "rename", path: "b/New.pdf", oldPath: "a/Old.pdf", local: false }, snap(["a/Old.md"], ["b/New.pdf"]));
	expect(r).toEqual(recheckOnly);
});
test("renaming a PDF whose note is not marked, or that had no note, does nothing", () => {
	expect(follow({ kind: "rename", path: "a/New.pdf", oldPath: "a/Old.pdf", local: true }, snap([], ["a/New.pdf"], ["a/Old.md"])))
		.toEqual(recheckOnly);
	expect(follow({ kind: "rename", path: "a/New.pdf", oldPath: "a/Old.pdf", local: true }, snap(["a/Other.md"], ["a/New.pdf"])))
		.toEqual(recheckOnly);
});
test("PDF renamed, note name taken: one notice, nothing renamed", () => {
	const r = follow({ kind: "rename", path: "a/New.pdf", oldPath: "a/Old.pdf", local: true }, snap(["a/Old.md"], ["a/New.pdf"], ["a/New.md"]));
	expect(r).toEqual({
		actions: [{ type: "notice", message: "Could not rename a/Old.md to match a/New.pdf: a file with that name already exists." }],
		recheck: true, pendingRemoved: null });
});
test("PDF renamed, note name taken only by case: one notice", () => {
	const r = follow({ kind: "rename", path: "a/New.pdf", oldPath: "a/Old.pdf", local: true }, snap(["a/Old.md"], ["a/New.pdf"], ["a/new.md"]));
	expect(r.actions.map((a) => a.type)).toEqual(["notice"]);
});
test("case-only PDF rename follows: the note itself is not a clash", () => {
	const r = follow({ kind: "rename", path: "a/old.pdf", oldPath: "a/Old.pdf", local: true }, snap(["a/Old.md"], ["a/old.pdf"]));
	expect(r).toEqual({ actions: [{ type: "rename", from: "a/Old.md", to: "a/old.md" }], recheck: false, pendingRemoved: null });
});
test("a PDF rename that changes only its extension's case leaves the note alone", () => {
	const r = follow({ kind: "rename", path: "a/S.PDF", oldPath: "a/S.pdf", local: true }, snap(["a/S.md"], ["a/S.PDF"]));
	expect(r).toEqual(recheckOnly);
});
test("folder move seen from the PDF: the note is no longer at its old place, so nothing is done", () => {
	const r = follow({ kind: "rename", path: "z/S.pdf", oldPath: "a/S.pdf", local: true }, snap(["z/S.md"], ["z/S.pdf"]));
	expect(r).toEqual(recheckOnly);
});
test("renames of other files: recheck only when a note or PDF is involved", () => {
	const s = snap([], ["a/S.pdf"], ["a/S.txt"]);
	expect(follow({ kind: "rename", path: "a/S.txt", oldPath: "a/S.md", local: true }, s)).toEqual(recheckOnly);
	expect(follow({ kind: "rename", path: "a/S.png", oldPath: "a/S.pdf", local: true }, s)).toEqual(recheckOnly);
	expect(follow({ kind: "rename", path: "a/x.png", oldPath: "a/y.png", local: true }, s))
		.toEqual({ actions: [], recheck: false, pendingRemoved: null });
});

// Delete.

test("local delete of a healthy pair's note deletes the PDF when no other note links to it", () => {
	expect(follow({ kind: "delete", path: "a/S.md", local: true, wasMarked: true, linkedElsewhere: false }, snap([], ["a/S.pdf"])))
		.toEqual({ actions: [{ type: "delete", path: "a/S.pdf" }], recheck: false, pendingRemoved: null });
});
test("local delete finds the PDF whatever the case of its extension", () => {
	const r = follow({ kind: "delete", path: "a/S.md", local: true, wasMarked: true, linkedElsewhere: false }, snap([], ["a/S.PDF"]));
	expect(r.actions).toEqual([{ type: "delete", path: "a/S.PDF" }]);
});
test("local delete keeps a PDF other notes still link to: notice, reminder, rechecked", () => {
	expect(follow({ kind: "delete", path: "a/S.md", local: true, wasMarked: true, linkedElsewhere: true }, snap([], ["a/S.pdf"])))
		.toEqual({
			actions: [{ type: "notice", message: "Kept S.pdf: other notes still link to it." }],
			recheck: true, pendingRemoved: "a/S.pdf" });
});
test("local delete keeps the PDF when nobody checked for other links", () => {
	const r = follow({ kind: "delete", path: "a/S.md", local: true, wasMarked: true }, snap([], ["a/S.pdf"]));
	expect(r.actions.some((a) => a.type === "delete")).toBe(false);
	expect(r.pendingRemoved).toBe("a/S.pdf");
	expect(r.recheck).toBe(true);
});
test("a delete that is not local protects the PDF and leaves the reminder", () => {
	for (const linkedElsewhere of [false, true, undefined]) {
		expect(follow({ kind: "delete", path: "a/S.md", local: false, wasMarked: true, linkedElsewhere }, snap([], ["a/S.pdf"])))
			.toEqual({ actions: [], recheck: true, pendingRemoved: "a/S.pdf" });
	}
});
test("delete of a note that was not marked does nothing", () => {
	for (const local of [true, false]) {
		expect(follow({ kind: "delete", path: "a/S.md", local, wasMarked: false, linkedElsewhere: false }, snap([], ["a/S.pdf"])))
			.toEqual(recheckOnly);
	}
});
test("delete of a marked note with no PDF beside it does nothing", () => {
	expect(follow({ kind: "delete", path: "a/S.md", local: true, wasMarked: true, linkedElsewhere: false }, snap([], ["att/S.pdf"])))
		.toEqual(recheckOnly);
	expect(follow({ kind: "delete", path: "a/S.md", local: true, wasMarked: true, linkedElsewhere: false }, snap([], ["a/s.pdf"])))
		.toEqual(recheckOnly);
});
test("delete leaves a PDF that another note still sits beside", () => {
	for (const local of [true, false]) {
		expect(follow({ kind: "delete", path: "a/S.md", local, wasMarked: true, linkedElsewhere: false }, snap(["a/S.MD"], ["a/S.pdf"])))
			.toEqual(recheckOnly);
	}
});
test("delete of a PDF never deletes the note", () => {
	for (const local of [true, false]) {
		expect(follow({ kind: "delete", path: "a/S.pdf", local, wasMarked: false }, snap(["a/S.md"], []))).toEqual(recheckOnly);
	}
});
test("delete of a file that is neither note nor PDF does nothing", () => {
	expect(follow({ kind: "delete", path: "a/x.png", local: true, wasMarked: false }, snap([], [])))
		.toEqual({ actions: [], recheck: false, pendingRemoved: null });
});

// Create (an in-app copy of a wrapped note).

test("a local copy of a healthy pair's note copies the PDF under the copy's name", () => {
	const r = follow({ kind: "create", path: "a/S 1.md", local: true, copiedFrom: "a/S.md" }, snap(["a/S.md", "a/S 1.md"], ["a/S.pdf"]));
	expect(r).toEqual({ actions: [{ type: "copy", from: "a/S.pdf", to: "a/S 1.pdf" }], recheck: false, pendingRemoved: null });
});
test("a copy landing in another folder, or the root, gets the PDF beside it", () => {
	expect(follow({ kind: "create", path: "b/Copy.md", local: true, copiedFrom: "a/S.md" }, snap(["a/S.md", "b/Copy.md"], ["a/S.pdf"])).actions)
		.toEqual([{ type: "copy", from: "a/S.pdf", to: "b/Copy.pdf" }]);
	expect(follow({ kind: "create", path: "Copy.md", local: true, copiedFrom: "a/S.md" }, snap(["a/S.md", "Copy.md"], ["a/S.pdf"])).actions)
		.toEqual([{ type: "copy", from: "a/S.pdf", to: "Copy.pdf" }]);
});
test("the copied PDF is named with a lower-case extension", () => {
	const r = follow({ kind: "create", path: "a/S 1.md", local: true, copiedFrom: "a/S.md" }, snap(["a/S.md", "a/S 1.md"], ["a/S.PDF"]));
	expect(r.actions).toEqual([{ type: "copy", from: "a/S.PDF", to: "a/S 1.pdf" }]);
});
test("create with no known source does nothing", () => {
	const r = follow({ kind: "create", path: "a/S 1.md", local: true, copiedFrom: null }, snap(["a/S.md", "a/S 1.md"], ["a/S.pdf"]));
	expect(r).toEqual(recheckOnly);
});
test("a copy that is not local is not acted on", () => {
	const r = follow({ kind: "create", path: "a/S 1.md", local: false, copiedFrom: "a/S.md" }, snap(["a/S.md", "a/S 1.md"], ["a/S.pdf"]));
	expect(r).toEqual(recheckOnly);
});
test("a copy that is not marked (not indexed yet) is not acted on", () => {
	const r = follow({ kind: "create", path: "a/S 1.md", local: true, copiedFrom: "a/S.md" }, snap(["a/S.md"], ["a/S.pdf"], ["a/S 1.md"]));
	expect(r).toEqual(recheckOnly);
});
test("a copy that already has its PDF does nothing (second identical event)", () => {
	const r = follow({ kind: "create", path: "a/S 1.md", local: true, copiedFrom: "a/S.md" },
		snap(["a/S.md", "a/S 1.md"], ["a/S.pdf", "a/S 1.pdf"]));
	expect(r).toEqual(recheckOnly);
});
test("a copy whose source is not the note of a healthy pair is not acted on", () => {
	// Source marked but without a PDF; source with a PDF but not marked; source gone.
	expect(follow({ kind: "create", path: "a/S 1.md", local: true, copiedFrom: "a/S.md" }, snap(["a/S.md", "a/S 1.md"], [])))
		.toEqual(recheckOnly);
	expect(follow({ kind: "create", path: "a/S 1.md", local: true, copiedFrom: "a/S.md" }, snap(["a/S 1.md"], ["a/S.pdf"], ["a/S.md"])))
		.toEqual(recheckOnly);
	expect(follow({ kind: "create", path: "a/S 1.md", local: true, copiedFrom: "a/Gone.md" }, snap(["a/S 1.md"], ["a/Gone.pdf"])))
		.toEqual(recheckOnly);
});
test("a copy whose PDF name is taken differing only by case: one notice, nothing copied", () => {
	const r = follow({ kind: "create", path: "a/S 1.md", local: true, copiedFrom: "a/S.md" },
		snap(["a/S.md", "a/S 1.md"], ["a/S.pdf", "a/s 1.pdf"]));
	expect(r).toEqual({
		actions: [{
			type: "notice",
			message: "Copied S 1.md, but could not copy its PDF: a file named S 1.pdf already exists. "
				+ "The copy is listed under documents needing attention.",
		}],
		recheck: true, pendingRemoved: null });
});
test("create of a PDF or of another file is only rechecked when it is a PDF", () => {
	expect(follow({ kind: "create", path: "a/S.PDF", local: false, copiedFrom: null }, snap([], ["a/S.PDF"]))).toEqual(recheckOnly);
	expect(follow({ kind: "create", path: "a/S.png", local: true, copiedFrom: null }, snap([], [])))
		.toEqual({ actions: [], recheck: false, pendingRemoved: null });
});

test("follow never converts, removes a marker or wraps", () => {
	const s = snap(["a/New.md", "a/S.md", "a/S 1.md"], ["a/Old.pdf", "a/S.pdf"]);
	const results = [
		follow({ kind: "rename", path: "a/New.md", oldPath: "a/Old.md", local: true }, s),
		follow({ kind: "delete", path: "a/Old.md", local: true, wasMarked: true, linkedElsewhere: false }, s),
		follow({ kind: "create", path: "a/S 1.md", local: true, copiedFrom: "a/S.md" }, s),
	];
	const types = results.flatMap((r) => r.actions.map((a) => a.type));
	expect(types).toEqual(["rename", "delete", "copy"]);
});

// The source of a copy, by identical text.

test("copySourceByText: the one candidate with identical text", () => {
	expect(copySourceByText("x", [{ notePath: "a/A.md", text: "y" }, { notePath: "a/B.md", text: "x" }])).toBe("a/B.md");
});
test("copySourceByText: none identical, or no candidates", () => {
	expect(copySourceByText("x", [])).toBeNull();
	expect(copySourceByText("x", [{ notePath: "a/A.md", text: "x " }])).toBeNull();
});
test("copySourceByText: two identical candidates cannot be told apart", () => {
	expect(copySourceByText("x", [{ notePath: "a/A.md", text: "x" }, { notePath: "a/B.md", text: "x" }])).toBeNull();
});
