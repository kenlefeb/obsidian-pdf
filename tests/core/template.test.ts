import { expect, test } from "vitest";
import {
	defaultTemplate,
	defaultTemplatePath,
	ensureTemplateComponents,
	templatePathWithExtension,
} from "../../src/core/template.ts";

test("default template has the marker and the embed", () => {
	expect(defaultTemplate("wrapped-pdf")).toBe("---\nwrapped-pdf:\n---\n\n![[{{title}}.pdf]]\n");
});

test("the default template needs nothing added", () => {
	const t = defaultTemplate("pdf");
	expect(ensureTemplateComponents(t, "pdf")).toEqual({ text: t, added: [] });
});

test("default path prefers Templater, then core Templates, then Templates", () => {
	expect(defaultTemplatePath({ templater: "T", coreTemplates: "C" })).toBe("T/Wrapped PDF.md");
	expect(defaultTemplatePath({ templater: null, coreTemplates: "/Meta/Templates/" })).toBe("Meta/Templates/Wrapped PDF.md");
	expect(defaultTemplatePath({ templater: "  ", coreTemplates: "/" })).toBe("Templates/Wrapped PDF.md");
	expect(defaultTemplatePath({ templater: null, coreTemplates: null })).toBe("Templates/Wrapped PDF.md");
});

test("templatePathWithExtension", () => {
	expect(templatePathWithExtension("T/pdf")).toBe("T/pdf.md");
	expect(templatePathWithExtension("T/pdf.md")).toBe("T/pdf.md");
	expect(templatePathWithExtension("T/pdf.MD")).toBe("T/pdf.MD");
});

test("adds the marker as the first frontmatter line, leaving the rest byte-for-byte", () => {
	const t = "---\ncreated: <% tp.date.now() %>\ntags: [a, b]\n---\n# <% tp.file.title %>\n\n![[<% tp.file.title %>.pdf]]\n";
	const r = ensureTemplateComponents(t, "wrapped-pdf");
	expect(r.added).toEqual(["marker"]);
	expect(r.text).toBe("---\nwrapped-pdf:\ncreated: <% tp.date.now() %>\ntags: [a, b]\n---\n# <% tp.file.title %>\n\n![[<% tp.file.title %>.pdf]]\n");
});

test("adds frontmatter when there is none", () => {
	expect(ensureTemplateComponents("![[{{title}}.pdf]]\n", "wrapped-pdf")).toEqual({
		text: "---\nwrapped-pdf:\n---\n\n![[{{title}}.pdf]]\n",
		added: ["marker"],
	});
});

test("appends the embed when the body has none", () => {
	expect(ensureTemplateComponents("---\nwrapped-pdf:\n---\nNotes about {{title}}", "wrapped-pdf")).toEqual({
		text: "---\nwrapped-pdf:\n---\nNotes about {{title}}\n\n![[{{title}}.pdf]]\n",
		added: ["embed"],
	});
});

test("empty template gets both", () => {
	expect(ensureTemplateComponents("", "wrapped-pdf")).toEqual({
		text: "---\nwrapped-pdf:\n---\n\n![[{{title}}.pdf]]\n",
		added: ["marker", "embed"],
	});
});

test("existing marker with a value, or a different marker name", () => {
	expect(ensureTemplateComponents('---\nwrapped-pdf: "[[x.pdf]]"\n---\n![[a.pdf]]\n', "wrapped-pdf").added).toEqual([]);
	expect(ensureTemplateComponents("---\nwrapped-pdf:\n---\n![[a.pdf]]\n", "pdf").added).toEqual(["marker"]);
	expect(ensureTemplateComponents("---\nwrapped-pdf-old:\n---\n![[a.pdf]]\n", "wrapped-pdf").added).toEqual(["marker"]);
});

test("what counts as an embed", () => {
	const has = (body: string) => !ensureTemplateComponents("---\nm:\n---\n" + body, "m").added.includes("embed");
	expect(has("![[Scan.PDF]]")).toBe(true);
	expect(has("![[a/b.pdf#page=2|x]]")).toBe(true);
	expect(has("![[{{title}}]]")).toBe(true);
	expect(has("![[<% tp.file.title %>]]")).toBe(true);
	expect(has("[[a.pdf]]")).toBe(false);
	expect(has("![[photo.png]]")).toBe(false);
	expect(has("a.pdf")).toBe(false);
});

test("an embed mentioned only in the frontmatter does not count", () => {
	expect(ensureTemplateComponents('---\nm:\ncover: "![[a.pdf]]"\n---\ntext\n', "m").added).toEqual(["embed"]);
});

test("CRLF files keep CRLF", () => {
	const r = ensureTemplateComponents("---\r\ntitle: x\r\n---\r\nbody\r\n", "m");
	expect(r.text).toBe("---\r\nm:\r\ntitle: x\r\n---\r\nbody\r\n\r\n![[{{title}}.pdf]]\r\n");
});

test("an unclosed frontmatter fence is treated as no frontmatter", () => {
	const r = ensureTemplateComponents("---\ntitle: x\nbody", "m");
	expect(r.text.startsWith("---\nm:\n---\n\n---\ntitle: x\nbody")).toBe(true);
});

test("marker names with regex metacharacters are matched literally", () => {
	expect(ensureTemplateComponents("---\na.b:\n---\n![[x.pdf]]\n", "a.b").added).toEqual([]);
	expect(ensureTemplateComponents("---\naxb:\n---\n![[x.pdf]]\n", "a.b").added).toEqual(["marker"]);
});

test("running it twice changes nothing the second time", () => {
	const once = ensureTemplateComponents("hello", "m").text;
	expect(ensureTemplateComponents(once, "m")).toEqual({ text: once, added: [] });
});
