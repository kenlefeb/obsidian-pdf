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

test("frontmatter that ends the file without a newline keeps its closing fence", () => {
	const embed = "![[{{title}}.pdf]]";
	expect(ensureTemplateComponents("---\nm:\n---", "m").text).toBe(`---\nm:\n---\n${embed}\n`);
	expect(ensureTemplateComponents("---\r\nm:\r\n---", "m").text).toBe(`---\r\nm:\r\n---\r\n${embed}\r\n`);
	expect(ensureTemplateComponents("---\n---", "m").text).toBe(`---\nm:\n---\n${embed}\n`);
	expect(ensureTemplateComponents("---\r\n---", "m").text).toBe(`---\r\nm:\r\n---\r\n${embed}\r\n`);
});

test("the line ending comes from the opening fence, not from a stray CRLF in the body", () => {
	const r = ensureTemplateComponents("---\ntitle: x\n---\nline\r\n![[a.pdf]]\n", "m");
	expect(r.text).toBe("---\nm:\ntitle: x\n---\nline\r\n![[a.pdf]]\n");
});

test("without frontmatter the first line ending in the text decides", () => {
	expect(ensureTemplateComponents("a\r\nb\n", "m").text).toBe("---\r\nm:\r\n---\r\n\r\na\r\nb\n\r\n![[{{title}}.pdf]]\r\n");
});

test("a leading BOM is kept and frontmatter is found after it", () => {
	const r = ensureTemplateComponents("\uFEFF---\ntitle: x\n---\n![[a.pdf]]\n", "m");
	expect(r.text).toBe("\uFEFF---\nm:\ntitle: x\n---\n![[a.pdf]]\n");
	expect(r.added).toEqual(["marker"]);
	expect(ensureTemplateComponents("\uFEFFhello", "m").text).toBe("\uFEFF---\nm:\n---\n\nhello\n\n![[{{title}}.pdf]]\n");
});

test("leading blank lines before the fence mean there is no frontmatter", () => {
	const r = ensureTemplateComponents("\n---\nm:\n---\n![[a.pdf]]\n", "m");
	expect(r.text).toBe("---\nm:\n---\n\n\n---\nm:\n---\n![[a.pdf]]\n");
	expect(r.added).toEqual(["marker"]);
});

test("a quoted marker key counts as present", () => {
	expect(ensureTemplateComponents('---\n"wrapped-pdf": x\n---\n![[a.pdf]]\n', "wrapped-pdf").added).toEqual([]);
	expect(ensureTemplateComponents("---\n'wrapped-pdf': x\n---\n![[a.pdf]]\n", "wrapped-pdf").added).toEqual([]);
});

const awkward: Record<string, string> = {
	"fence at EOF": "---\nm:\n---",
	"fence at EOF, no marker": "---\ntitle: x\n---",
	"empty frontmatter at EOF": "---\n---",
	"CRLF fence at EOF": "---\r\nm:\r\n---",
	"CRLF empty frontmatter at EOF": "---\r\n---",
	"CRLF with frontmatter": "---\r\ntitle: x\r\n---\r\nbody\r\n",
	"CRLF without frontmatter": "body\r\nmore\r\n",
	"--- later in the body": "---\ntitle: x\n---\nbody\n---\nmore\n",
	"body without trailing newline": "---\ntitle: x\n---\nbody",
	BOM: "\uFEFF---\ntitle: x\n---\nbody\n",
	"BOM without frontmatter": "\uFEFFbody",
	empty: "",
	"Templater code in frontmatter": "---\ncreated: <% tp.date.now() %>\nx: <% tp.file.title | y %>\n---\n# t\n",
	"unclosed fence": "---\ntitle: x\nbody",
};

for (const [name, original] of Object.entries(awkward)) {
	test(`invariants: ${name}`, () => {
		const r = ensureTemplateComponents(original, "m");
		expect(ensureTemplateComponents(r.text, "m")).toEqual({ text: r.text, added: [] });

		let rest = r.text;
		const bom = rest.startsWith("\uFEFF") ? "\uFEFF" : "";
		rest = rest.slice(bom.length);
		const eol = /^---\r\n/.test(rest) || (!/^---\n/.test(rest) && rest.includes("\r\n")) ? "\r\n" : "\n";
		if (r.added.includes("embed")) {
			expect(rest.endsWith(`![[{{title}}.pdf]]${eol}`)).toBe(true);
			rest = rest.slice(0, -`![[{{title}}.pdf]]${eol}`.length);
		}
		if (r.added.includes("marker")) {
			const prefix = `---${eol}m:${eol}---${eol}${eol}`;
			if (rest.startsWith(prefix)) rest = rest.slice(prefix.length);
			else {
				const marker = `m:${eol}`;
				const at = rest.indexOf(eol) + eol.length;
				expect(rest.slice(at, at + marker.length)).toBe(marker);
				rest = rest.slice(0, at) + rest.slice(at + marker.length);
			}
		}
		const original2 = original.slice(original.startsWith("\uFEFF") ? 1 : 0);
		expect(bom === (original.startsWith("\uFEFF") ? "\uFEFF" : "")).toBe(true);
		expect(rest.startsWith(original2)).toBe(true);
		expect(rest.slice(original2.length)).toMatch(/^[\r\n]*$/);
	});
}
