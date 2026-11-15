import { expect, test } from "vitest";
import { convertBody, convertedMessage, convertProperties } from "../../src/core/convert.ts";

test("properties: list keeps other entries, single value emptied, marker true", () => {
	const fm: Record<string, unknown> = { "wrapped-pdf": "[[A.pdf]]", attachments: ["[[Other.png]]", "[[A.pdf|scan]]", "[[sub/A.pdf]]"], source: "[[A.pdf]]", title: "A.pdf" };
	expect(convertProperties(fm, "wrapped-pdf", ["A.pdf", "sub/A.pdf"])).toEqual(["attachments", "source"]);
	expect(fm).toEqual({ "wrapped-pdf": true, attachments: ["[[Other.png]]"], source: null, title: "A.pdf" });
});

test("properties: subpath, embed and markdown forms count; other targets and non-strings are kept", () => {
	const fm: Record<string, unknown> = {
		marker: true,
		a: "![[A.pdf#page=2]]",
		b: "[scan](My%20A.pdf#page=2)",
		c: "[[B.pdf]]",
		d: "see [[A.pdf]]",
		e: [1, "[[A.pdf]]", null, "[[a.pdf]]"],
		f: 3,
		g: ["[[A.pdf]]"],
	};
	expect(convertProperties(fm, "marker", ["A.pdf", "My A.pdf"])).toEqual(["a", "b", "e", "g"]);
	expect(fm).toEqual({ marker: true, a: null, b: null, c: "[[B.pdf]]", d: "see [[A.pdf]]", e: [1, null, "[[a.pdf]]"], f: 3, g: [] });
});

test("properties: the marker is set even when absent, and is never reported", () => {
	const fm: Record<string, unknown> = { title: "x" };
	expect(convertProperties(fm, "wrapped-pdf", ["A.pdf"])).toEqual([]);
	expect(fm).toEqual({ title: "x", "wrapped-pdf": true });
});

test("body: embed becomes the block, link becomes text", () => {
	const r = convertBody("---\nx: 1\n---\n\n![[A.pdf#page=3]]\n\nSee [[A.pdf|the scan]] and [[A.pdf]] and [[B.pdf]].\n", ["A.pdf"]);
	expect(r.text).toBe("---\nx: 1\n---\n\n```wrapped-pdf\n```\n\nSee the scan and A.pdf and [[B.pdf]].\n");
	expect(r).toMatchObject({ embeds: 1, links: 2 });
});

test("body: embed mid-line gets its own lines", () => {
	expect(convertBody("before ![[A.pdf]] after\n", ["A.pdf"]).text).toBe("before\n\n```wrapped-pdf\n```\n\nafter\n");
});

test("body: code is left alone, CRLF kept, markdown links handled, no frontmatter ok", () => {
	const code = "```\n![[A.pdf]]\n```\n`![[A.pdf]]`\n";
	expect(convertBody(code, ["A.pdf"]).text).toBe(code);
	expect(convertBody("![[A.pdf]]\r\nx\r\n", ["A.pdf"]).text).toBe("```wrapped-pdf\r\n```\r\nx\r\n");
	expect(convertBody("![](My%20A.pdf) [scan](My%20A.pdf)\n", ["My A.pdf"]).links).toBe(1);
});

test("nothing to do returns the same text and a null message", () => {
	expect(convertBody("plain\n", ["A.pdf"])).toEqual({ text: "plain\n", embeds: 0, links: 0 });
	expect(convertedMessage("A", [], 0, 0)).toBeNull();
	expect(convertedMessage("A", ["attachments"], 1, 0)).toContain("attachments");
});

test("body: the frontmatter is not touched", () => {
	const text = "---\nwrapped-pdf: \"[[A.pdf]]\"\nattachments:\n  - \"[[A.pdf]]\"\n---\n[[A.pdf]]\n";
	expect(convertBody(text, ["A.pdf"]).text).toBe("---\nwrapped-pdf: \"[[A.pdf]]\"\nattachments:\n  - \"[[A.pdf]]\"\n---\nA.pdf\n");
});

test("body: markdown embed and link, with spaces, angle brackets, subpath and title", () => {
	const r = convertBody("![](My%20A.pdf) [scan](My%20A.pdf)\n[x](<My A.pdf>) [](sub/My%20A.pdf#page=2 \"t\") [y](Other.pdf)\n", ["My A.pdf", "sub/My A.pdf"]);
	expect(r.text).toBe("```wrapped-pdf\n```\n\nscan\nx My A.pdf [y](Other.pdf)\n");
	expect(r).toMatchObject({ embeds: 1, links: 3 });
});

test("body: targets match exactly; a path link shows the file name; a table-escaped alias is read", () => {
	const r = convertBody("[[a.pdf]] [[x/A.pdf]] [[sub/A.pdf#page=1]] | [[A.pdf\\|scan]] |\n", ["A.pdf", "sub/A.pdf"]);
	expect(r.text).toBe("[[a.pdf]] [[x/A.pdf]] A.pdf | scan |\n");
	expect(r.links).toBe(2);
});

test("body: several embeds on a line, an indented embed, and a last line with no line ending", () => {
	expect(convertBody("a ![[A.pdf]] b ![[A.pdf|300]]", ["A.pdf"])).toEqual({ text: "a\n\n```wrapped-pdf\n```\n\nb\n\n```wrapped-pdf\n```", embeds: 2, links: 0 });
	expect(convertBody("x\r\n  ![[A.pdf]]", ["A.pdf"]).text).toBe("x\r\n```wrapped-pdf\r\n```");
});

test("body: fences of tildes and longer fences, an unclosed fence, and double-backtick code", () => {
	const text = "~~~md\n![[A.pdf]]\n~~~\n````\n```\n[[A.pdf]]\n````\n``a ` [[A.pdf]]`` `unclosed [[A.pdf]]\n```js\n[[A.pdf]]\n";
	const r = convertBody(text, ["A.pdf"]);
	expect(r.text).toBe("~~~md\n![[A.pdf]]\n~~~\n````\n```\n[[A.pdf]]\n````\n``a ` [[A.pdf]]`` `unclosed A.pdf\n```js\n[[A.pdf]]\n");
	expect(r.links).toBe(1);
});

test("body: an escaped bracket is not a link; an unfinished link is left as written", () => {
	const text = "\\[[A.pdf]] [[A.pdf [x](A.pdf [[A.pdf]\n";
	expect(convertBody(text, ["A.pdf"])).toEqual({ text, embeds: 0, links: 0 });
});

test("body: a long line of brackets is handled quickly", () => {
	const text = "[".repeat(200000) + "(".repeat(200000) + "`".repeat(3) + "x\n";
	const started = Date.now();
	expect(convertBody(text, ["A.pdf"]).text).toBe(text);
	expect(Date.now() - started).toBeLessThan(2000);
});

test("message: names the note, the properties and the counts", () => {
	const message = convertedMessage("Statement", ["attachments", "source"], 1, 2) ?? "";
	expect(message).toContain("Statement");
	expect(message).toContain("attachments, source");
	expect(message).toContain("1 embed ");
	expect(message).toContain("2 links ");
	expect(convertedMessage("A", [], 0, 1)).toContain("1 link ");
	expect(convertedMessage("A", [], 2, 0)).toContain("2 embeds ");
});
