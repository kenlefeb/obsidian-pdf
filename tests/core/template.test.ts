import { expect, test } from "vitest";
import {
	defaultTemplate,
	defaultTemplatePath,
	ensureTemplateComponents,
	templatePathWithExtension,
	type TemplateCheck,
} from "../../src/core/template.ts";

const BLOCK = "```wrapped-pdf\n```";
const BLOCK_CRLF = "```wrapped-pdf\r\n```";

/** A check that changed nothing. */
const intact = (text: string): TemplateCheck => ({ text, added: [], markerSet: false, replacedEmbed: false });

test("default template has the marker set to true and the block", () => {
	expect(defaultTemplate("wrapped-pdf")).toBe("---\nwrapped-pdf: true\n---\n\n```wrapped-pdf\n```\n");
});

test("the default template needs nothing changed, whatever the marker is called", () => {
	const t = defaultTemplate("pdf");
	expect(t).toBe(`---\npdf: true\n---\n\n${BLOCK}\n`);
	expect(ensureTemplateComponents(t, "pdf")).toEqual(intact(t));
});

test("a complete template of the new form is unchanged", () => {
	const t = `---\ncreated: <% tp.date.now() %>\nwrapped-pdf: true\ntags: [a, b]\n---\n# <% tp.file.title %>\n\n${BLOCK}\n\nNotes\n`;
	expect(ensureTemplateComponents(t, "wrapped-pdf")).toEqual(intact(t));
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

test("the placeholder embed is replaced by the block, where it stood", () => {
	const t = "---\nwrapped-pdf: true\n---\n# {{title}}\n\n![[{{title}}.pdf]]\n\nNotes\n";
	expect(ensureTemplateComponents(t, "wrapped-pdf")).toEqual({
		text: `---\nwrapped-pdf: true\n---\n# {{title}}\n\n${BLOCK}\n\nNotes\n`,
		added: [],
		markerSet: false,
		replacedEmbed: true,
	});
});

test("the template the earlier default wrote becomes the new default", () => {
	expect(ensureTemplateComponents("---\nwrapped-pdf:\n---\n\n![[{{title}}.pdf]]\n", "wrapped-pdf")).toEqual({
		text: defaultTemplate("wrapped-pdf"),
		added: [],
		markerSet: true,
		replacedEmbed: true,
	});
});

test("a marker holding the placeholder link is set to true", () => {
	const fixed = (line: string) => ensureTemplateComponents(`---\ntitle: x\n${line}\n---\n${BLOCK}\n`, "wrapped-pdf");
	const expected = { text: `---\ntitle: x\nwrapped-pdf: true\n---\n${BLOCK}\n`, added: [], markerSet: true, replacedEmbed: false };
	expect(fixed('wrapped-pdf: "[[{{title}}.pdf]]"')).toEqual(expected);
	expect(fixed("wrapped-pdf: '[[{{title}}.pdf]]'")).toEqual(expected);
	expect(fixed("wrapped-pdf:   [[{{file}}.pdf]]  ")).toEqual(expected);
	expect(fixed('wrapped-pdf: "[[{{title}}]]"')).toEqual(expected);
	expect(fixed("wrapped-pdf:")).toEqual(expected);
	expect(fixed("wrapped-pdf:   ")).toEqual(expected);
});

test("a quoted marker key keeps its quotes when its value is set", () => {
	expect(ensureTemplateComponents(`---\n"wrapped-pdf": "[[{{title}}.pdf]]"\n---\n${BLOCK}\n`, "wrapped-pdf").text)
		.toBe(`---\n"wrapped-pdf": true\n---\n${BLOCK}\n`);
});

test.each([
	'wrapped-pdf: "[[<% tp.file.title %>.pdf]]"',
	"wrapped-pdf: <% tp.file.title %>",
	"wrapped-pdf: <%* tR += true %>",
	'wrapped-pdf: "[[x.pdf]]"',
	'wrapped-pdf: "[[{{title}}.pdf|scan]]"',
	"wrapped-pdf: false",
	"wrapped-pdf: yes # set by hand",
	"wrapped-pdf: # nothing yet",
])("any other marker value is left byte for byte: %s", (line) => {
	const t = `---\n${line}\n---\n${BLOCK}\n`;
	expect(ensureTemplateComponents(t, "wrapped-pdf")).toEqual(intact(t));
});

test("an empty marker that is continued on the following lines is left alone", () => {
	for (const t of [
		`---\nm:\n  - "[[{{title}}.pdf]]"\n---\n${BLOCK}\n`,
		`---\nm:\n- a\n---\n${BLOCK}\n`,
		`---\nm:\n\n  # why\n  nested: 1\n---\n${BLOCK}\n`,
		`---\nm:\n\ta\n---\n${BLOCK}\n`,
	]) {
		expect(ensureTemplateComponents(t, "m")).toEqual(intact(t));
	}
});

test("an empty marker followed by a blank line and another property is set to true", () => {
	expect(ensureTemplateComponents(`---\nm:\n\n# note\ntitle: x\n---\n${BLOCK}\n`, "m").text)
		.toBe(`---\nm: true\n\n# note\ntitle: x\n---\n${BLOCK}\n`);
});

test("only the first marker line is looked at", () => {
	const t = `---\nm: true\nm:\n---\n${BLOCK}\n`;
	expect(ensureTemplateComponents(t, "m")).toEqual(intact(t));
});

test("adds the marker as the first frontmatter line, leaving the rest byte-for-byte", () => {
	const t = "---\ncreated: <% tp.date.now() %>\ntags: [a, b]\n---\n# <% tp.file.title %>\n\n![[<% tp.file.title %>.pdf]]\n";
	expect(ensureTemplateComponents(t, "wrapped-pdf")).toEqual({
		text: `---\nwrapped-pdf: true\ncreated: <% tp.date.now() %>\ntags: [a, b]\n---\n# <% tp.file.title %>\n\n${BLOCK}\n`,
		added: ["marker"],
		markerSet: false,
		replacedEmbed: true,
	});
});

test("adds frontmatter when there is none", () => {
	expect(ensureTemplateComponents("![[{{title}}.pdf]]\n", "wrapped-pdf")).toEqual({
		text: `---\nwrapped-pdf: true\n---\n\n${BLOCK}\n`,
		added: ["marker"],
		markerSet: false,
		replacedEmbed: true,
	});
	expect(ensureTemplateComponents(`${BLOCK}\n`, "wrapped-pdf")).toEqual({
		text: `---\nwrapped-pdf: true\n---\n\n${BLOCK}\n`,
		added: ["marker"],
		markerSet: false,
		replacedEmbed: false,
	});
});

test("appends the block when the body has neither it nor a placeholder embed", () => {
	expect(ensureTemplateComponents("---\nwrapped-pdf: true\n---\nNotes about {{title}}", "wrapped-pdf")).toEqual({
		text: `---\nwrapped-pdf: true\n---\nNotes about {{title}}\n\n${BLOCK}\n`,
		added: ["block"],
		markerSet: false,
		replacedEmbed: false,
	});
});

test("empty template gets both", () => {
	expect(ensureTemplateComponents("", "wrapped-pdf")).toEqual({
		text: `---\nwrapped-pdf: true\n---\n\n${BLOCK}\n`,
		added: ["marker", "block"],
		markerSet: false,
		replacedEmbed: false,
	});
});

test("a different marker name is not the marker", () => {
	expect(ensureTemplateComponents(`---\nwrapped-pdf: true\n---\n${BLOCK}\n`, "pdf").added).toEqual(["marker"]);
	expect(ensureTemplateComponents(`---\nwrapped-pdf-old: true\n---\n${BLOCK}\n`, "wrapped-pdf").added).toEqual(["marker"]);
});

test("which embeds are placeholders for the PDF", () => {
	const check = (body: string) => ensureTemplateComponents("---\nm: true\n---\n" + body, "m");
	for (const embed of [
		"![[{{title}}.pdf]]",
		"![[{{file}}.pdf]]",
		"![[{{title}}]]",
		"![[{{FILE}}.PDF]]",
		"![[ {{title}}.pdf ]]",
		"![[{{title}}.pdf#page=2|x]]",
		"![[<% tp.file.title %>.pdf]]",
		"![[<%tp.file.title%>]]",
		"![[<%- tp.file.title -%>.pdf]]",
		"![[<% tp.file.folder(true) %>/<% tp.file.title %>.pdf]]",
		"![[Scans/{{title}}.pdf]]",
	]) {
		expect(check(embed + "\n"), embed).toEqual({ text: `---\nm: true\n---\n${BLOCK}\n`, added: [], markerSet: false, replacedEmbed: true });
	}
	// Anything else is not known to be the note's PDF: it is kept, and the block is added after it.
	for (const other of [
		"![[Scan.PDF]]",
		"![[a/b.pdf#page=2|x]]",
		"![[photo.png]]",
		"![[<% tp.user.cover() %>]]",
		"![[{{title}}.png]]",
		"![[{{date}}.pdf]]",
		"![[<% tp.user.other() %>.pdf]]",
		"![[<% tp.file.title %>/<% tp.date.now() %>.pdf]]",
		"![[{{title}} scan.pdf]]",
		"[[{{title}}.pdf]]",
		"{{title}}.pdf",
	]) {
		expect(check(other + "\n"), other).toEqual({ text: `---\nm: true\n---\n${other}\n\n${BLOCK}\n`, added: ["block"], markerSet: false, replacedEmbed: false });
	}
});

test("a placeholder embed inside a line leaves the text around it, with the block on its own lines", () => {
	expect(ensureTemplateComponents("---\nm: true\n---\nScan: ![[{{title}}.pdf]] (original)\nend\n", "m").text)
		.toBe(`---\nm: true\n---\nScan:\n\n${BLOCK}\n\n(original)\nend\n`);
});

test("every placeholder embed is replaced", () => {
	const r = ensureTemplateComponents("---\nm: true\n---\n![[{{title}}.pdf]]\ntext\n![[{{title}}.pdf]]", "m");
	expect(r.text).toBe(`---\nm: true\n---\n${BLOCK}\ntext\n${BLOCK}`);
	expect(r.replacedEmbed).toBe(true);
});

test("a placeholder embed inside a fenced code block is not an embed", () => {
	const t = "---\nm: true\n---\n````md\n![[{{title}}.pdf]]\n````\n";
	expect(ensureTemplateComponents(t, "m")).toEqual({
		text: `${t}\n${BLOCK}\n`,
		added: ["block"],
		markerSet: false,
		replacedEmbed: false,
	});
	const tilde = "---\nm: true\n---\n~~~\n![[{{title}}.pdf]]\n";
	expect(ensureTemplateComponents(tilde, "m").replacedEmbed).toBe(false);
});

test("a placeholder embed with a block already there is still replaced", () => {
	expect(ensureTemplateComponents(`---\nm: true\n---\n${BLOCK}\n\n![[{{title}}.pdf]]\n`, "m").text)
		.toBe(`---\nm: true\n---\n${BLOCK}\n\n${BLOCK}\n`);
});

test("an embed or a block mentioned only in the frontmatter does not count", () => {
	expect(ensureTemplateComponents('---\nm: true\ncover: "![[{{title}}.pdf]]"\n---\ntext\n', "m")).toEqual({
		text: `---\nm: true\ncover: "![[{{title}}.pdf]]"\n---\ntext\n\n${BLOCK}\n`,
		added: ["block"],
		markerSet: false,
		replacedEmbed: false,
	});
	expect(ensureTemplateComponents("---\nm: true\nx: |\n```wrapped-pdf\n```\n---\ntext\n", "m").added).toEqual(["block"]);
});

test("CRLF files keep CRLF", () => {
	expect(ensureTemplateComponents("---\r\ntitle: x\r\n---\r\nbody\r\n", "m").text)
		.toBe(`---\r\nm: true\r\ntitle: x\r\n---\r\nbody\r\n\r\n${BLOCK_CRLF}\r\n`);
	expect(ensureTemplateComponents("---\r\nm: \"[[{{title}}.pdf]]\"\r\ntitle: x\r\n---\r\nbody ![[{{title}}.pdf]]\r\nend\r\n", "m").text)
		.toBe(`---\r\nm: true\r\ntitle: x\r\n---\r\nbody\r\n\r\n${BLOCK_CRLF}\r\nend\r\n`);
	expect(ensureTemplateComponents("---\r\nm:\r\n---\r\n", "m").text).toBe(`---\r\nm: true\r\n---\r\n${BLOCK_CRLF}\r\n`);
});

test("an unclosed frontmatter fence is treated as no frontmatter", () => {
	const r = ensureTemplateComponents("---\ntitle: x\nbody", "m");
	expect(r.text.startsWith("---\nm: true\n---\n\n---\ntitle: x\nbody")).toBe(true);
});

test("marker names with regex metacharacters are matched literally", () => {
	expect(ensureTemplateComponents(`---\na.b: true\n---\n${BLOCK}\n`, "a.b").added).toEqual([]);
	expect(ensureTemplateComponents(`---\naxb: true\n---\n${BLOCK}\n`, "a.b").added).toEqual(["marker"]);
});

test("running it twice changes nothing the second time", () => {
	const once = ensureTemplateComponents("hello", "m").text;
	expect(ensureTemplateComponents(once, "m")).toEqual(intact(once));
});

test("frontmatter that ends the file without a newline keeps its closing fence", () => {
	expect(ensureTemplateComponents("---\nm:\n---", "m").text).toBe(`---\nm: true\n---\n${BLOCK}\n`);
	expect(ensureTemplateComponents("---\r\nm:\r\n---", "m").text).toBe(`---\r\nm: true\r\n---\r\n${BLOCK_CRLF}\r\n`);
	expect(ensureTemplateComponents("---\n---", "m").text).toBe(`---\nm: true\n---\n${BLOCK}\n`);
	expect(ensureTemplateComponents("---\r\n---", "m").text).toBe(`---\r\nm: true\r\n---\r\n${BLOCK_CRLF}\r\n`);
});

test("the line ending comes from the opening fence, not from a stray CRLF in the body", () => {
	const r = ensureTemplateComponents("---\ntitle: x\n---\nline\r\n![[{{title}}.pdf]]\n", "m");
	expect(r.text).toBe(`---\nm: true\ntitle: x\n---\nline\r\n${BLOCK}\n`);
});

test("without frontmatter the first line ending in the text decides", () => {
	expect(ensureTemplateComponents("a\r\nb\n", "m").text).toBe(`---\r\nm: true\r\n---\r\n\r\na\r\nb\n\r\n${BLOCK_CRLF}\r\n`);
});

test("a leading BOM is kept and frontmatter is found after it", () => {
	const r = ensureTemplateComponents(`\uFEFF---\ntitle: x\n---\n${BLOCK}\n`, "m");
	expect(r.text).toBe(`\uFEFF---\nm: true\ntitle: x\n---\n${BLOCK}\n`);
	expect(r.added).toEqual(["marker"]);
	expect(ensureTemplateComponents("\uFEFFhello", "m").text).toBe(`\uFEFF---\nm: true\n---\n\nhello\n\n${BLOCK}\n`);
});

test("leading blank lines before the fence mean there is no frontmatter", () => {
	const r = ensureTemplateComponents(`\n---\nm: true\n---\n${BLOCK}\n`, "m");
	expect(r.text).toBe(`---\nm: true\n---\n\n\n---\nm: true\n---\n${BLOCK}\n`);
	expect(r.added).toEqual(["marker"]);
});

test("a quoted marker key counts as present", () => {
	expect(ensureTemplateComponents(`---\n"wrapped-pdf": x\n---\n${BLOCK}\n`, "wrapped-pdf")).toEqual(intact(`---\n"wrapped-pdf": x\n---\n${BLOCK}\n`));
	expect(ensureTemplateComponents(`---\n'wrapped-pdf': x\n---\n${BLOCK}\n`, "wrapped-pdf").added).toEqual([]);
});

const awkward: Record<string, string> = {
	"fence at EOF": "---\nm: true\n---",
	"fence at EOF, no marker": "---\ntitle: x\n---",
	"empty frontmatter at EOF": "---\n---",
	"CRLF fence at EOF": "---\r\nm: true\r\n---",
	"CRLF empty frontmatter at EOF": "---\r\n---",
	"CRLF with frontmatter": "---\r\ntitle: x\r\n---\r\nbody\r\n",
	"CRLF without frontmatter": "body\r\nmore\r\n",
	"--- later in the body": "---\ntitle: x\n---\nbody\n---\nmore\n",
	"body without trailing newline": "---\ntitle: x\n---\nbody",
	BOM: "\uFEFF---\ntitle: x\n---\nbody\n",
	"BOM without frontmatter": "\uFEFFbody",
	empty: "",
	"Templater code in frontmatter": "---\ncreated: <% tp.date.now() %>\nx: <% tp.file.title | y %>\n---\n# t\n",
	"Templater marker": "---\nm: <% tp.file.title %>\nx: 1\n---\n# t\n",
	"unclosed fence": "---\ntitle: x\nbody",
};

// With no placeholder embed and no placeholder marker value, the check only inserts: taking the inserted marker and
// block out again gives back the original, byte for byte.
for (const [name, original] of Object.entries(awkward)) {
	test(`invariants: ${name}`, () => {
		const r = ensureTemplateComponents(original, "m");
		expect(r.markerSet).toBe(false);
		expect(r.replacedEmbed).toBe(false);
		expect(ensureTemplateComponents(r.text, "m")).toEqual(intact(r.text));

		let rest = r.text;
		const bom = rest.startsWith("\uFEFF") ? "\uFEFF" : "";
		rest = rest.slice(bom.length);
		const eol = /^---\r\n/.test(rest) || (!/^---\n/.test(rest) && rest.includes("\r\n")) ? "\r\n" : "\n";
		expect(r.added).toContain("block");
		const block = `\`\`\`wrapped-pdf${eol}\`\`\`${eol}`;
		expect(rest.endsWith(block)).toBe(true);
		rest = rest.slice(0, -block.length);
		if (r.added.includes("marker")) {
			const prefix = `---${eol}m: true${eol}---${eol}${eol}`;
			if (rest.startsWith(prefix)) rest = rest.slice(prefix.length);
			else {
				const marker = `m: true${eol}`;
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
