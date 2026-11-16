import { expect, test } from "vitest";
import { currentOwnTargets, convertBody, convertedMessage, convertedSummary, convertProperties, linkTargets } from "../../src/core/convert.ts";

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

test("body: pathological lines come back unchanged (bounded work; a slow scan would time this test out)", () => {
	const brackets = "[".repeat(200000) + "(".repeat(200000) + "`".repeat(3) + "x\n";
	expect(convertBody(brackets, ["A.pdf"]).text).toBe(brackets);
	const nested = "[a](b ".repeat(40000) + ")".repeat(40000) + "\n";
	expect(convertBody(nested, ["A.pdf"]).text).toBe(nested);
	expect(convertBody(nested, ["b"]).text).toBe("[a](b ".repeat(39999) + "a" + ")".repeat(39999) + "\n");
	const wiki = "[".repeat(200000) + "]]\n";
	expect(convertBody(wiki, ["A.pdf"]).text).toBe(wiki);
});

test("body: a markdown target longer than the bound is left as written", () => {
	const long = "x".repeat(3000);
	const text = `[a](${long}) [b](A.pdf)\n`;
	expect(convertBody(text, [long, "A.pdf"])).toEqual({ text: `[a](${long}) b\n`, embeds: 0, links: 1 });
});

test("body: a wikilink to another file followed by (own target) is left as written", () => {
	for (const text of ["See [[B.pdf]](A.pdf) end\n", "![[B.pdf]](A.pdf)\n", "[[B.pdf|x]](A.pdf)\n"]) {
		expect(convertBody(text, ["A.pdf"])).toEqual({ text, embeds: 0, links: 0 });
	}
	expect(convertBody("[[[A.pdf]] [[B.pdf]] [[A.pdf]]\n", ["A.pdf"]).text).toBe("[A.pdf [[B.pdf]] A.pdf\n");
});

test("body: <target> followed by anything but a title is not a link to it", () => {
	expect(convertBody("[x](A.pdf junk) [y](A.pdf 't') [z](A.pdf (t))\n", ["A.pdf"]).text).toBe("[x](A.pdf junk) y z\n");
	expect(convertBody("[x](<A.pdf> junk) [y](<A.pdf> \"t\") [z](<A.pdf)\n", ["A.pdf"]).text).toBe("[x](<A.pdf> junk) y [z](<A.pdf)\n");
});

test("properties: a value with more than the link is kept", () => {
	const fm: Record<string, unknown> = {
		a: "[draft] see [scan](A.pdf)",
		b: "[x](<A.pdf>) text (y)",
		c: "[[B.pdf]](A.pdf)",
		d: "[[A.pdf]] and [[A.pdf]]",
		e: "[x](<A.pdf> junk)",
		f: ["[[B.pdf]](A.pdf)", "[x](<A.pdf> \"t\")", "[a [b]](A.pdf)"],
	};
	const before = { ...fm, f: ["[[B.pdf]](A.pdf)"] };
	expect(convertProperties(fm, "wrapped-pdf", ["A.pdf"])).toEqual(["f"]);
	expect(fm).toEqual({ ...before, "wrapped-pdf": true });
});

test("body: a CRLF file with a one-line body gets a CRLF block", () => {
	expect(convertBody("---\r\nx: 1\r\n---\r\n![[A.pdf]]", ["A.pdf"]).text).toBe("---\r\nx: 1\r\n---\r\n```wrapped-pdf\r\n```");
});

test("body: a byte order mark does not hide a fence on the first line", () => {
	const text = "\uFEFF```\n![[A.pdf]]\n```\n";
	expect(convertBody(text, ["A.pdf"]).text).toBe(text);
	expect(convertBody("\uFEFF![[A.pdf]]\n", ["A.pdf"]).text).toBe("\uFEFF```wrapped-pdf\n```\n");
});

test("body: converting twice changes nothing more", () => {
	const once = convertBody("---\nx: 1\n---\n\n![[A.pdf#page=3]]\n\nSee [[A.pdf|the scan]] and [[A.pdf]] and [[B.pdf]].\nbefore ![[A.pdf]] after\n", ["A.pdf"]);
	expect(convertBody(once.text, ["A.pdf"])).toEqual({ text: once.text, embeds: 0, links: 0 });
	// Accepted limit: display text that itself holds a link to an own target is put back as written, so that inner
	// link takes a second pass.
	const nested = convertBody("[see [[A.pdf]]](A.pdf)\n", ["A.pdf"]);
	expect(nested.text).toBe("see [[A.pdf]]\n");
	expect(convertBody(nested.text, ["A.pdf"]).text).toBe("see A.pdf\n");
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

test("link targets: every link and embed in the properties and the body, as written, once each", () => {
	const text = [
		"---",
		'wrapped-pdf: "[[Scan.pdf]]"',
		"attachments:",
		'  - "[[sub/Scan.pdf|scan]]"',
		'  - "![[Other.png]]"',
		"---",
		"![[Scan.pdf#page=2]] and [[ Scan.pdf |alias]] and [[Note]]",
		"[text](My%20Scan.pdf#page=3) ![x](<sub/My Scan.pdf> \"title\")",
		"",
	].join("\n");
	expect(linkTargets(text)).toEqual(["Scan.pdf", "sub/Scan.pdf", "Other.png", "Note", "My Scan.pdf", "sub/My Scan.pdf"]);
});

test("link targets: code is not read, CRLF and a missing frontmatter are fine", () => {
	expect(linkTargets("`[[A.pdf]]`\r\n```\r\n[[B.pdf]]\r\n```\r\n[[C.pdf]]\r\n")).toEqual(["C.pdf"]);
	expect(linkTargets("no links here")).toEqual([]);
	expect(linkTargets("")).toEqual([]);
});

test("link targets: what convertBody would match is what is listed", () => {
	const text = "---\nx: 1\n---\n![[Scan.pdf]] [[scan.PDF|s]] [a](Scan.pdf)\n";
	for (const target of linkTargets(text)) {
		expect(convertBody(text, [target]).text).not.toBe(text);
	}
	expect(linkTargets(text)).toEqual(["Scan.pdf", "scan.PDF"]);
});

test("summary of the messages of a run: the first, and how many more notes", () => {
	expect(convertedSummary([])).toBeNull();
	expect(convertedSummary(["one"])).toBe("one");
	expect(convertedSummary(["one", "two"])).toBe("one The same was done in 1 other note wrapped in this run.");
	expect(convertedSummary(["one", "two", "three"])).toBe("one The same was done in 2 other notes wrapped in this run.");
});

test("currentOwnTargets: fresh spellings first, then planned ones that still mean this PDF or nothing", () => {
	const resolve = (target: string): string | null =>
		({ "S.pdf": "a/S.pdf", "a/S.pdf": "a/S.pdf", "Other.pdf": "b/Other.pdf" } as Record<string, string>)[target] ?? null;
	// "x/Old.pdf" was the PDF's path before it was moved: it resolves to nothing now and is still taken out.
	// "Other.pdf" now resolves to another file: never taken out.
	expect(currentOwnTargets(["S.pdf"], ["x/Old.pdf", "Other.pdf", "a/S.pdf", "S.pdf"], "a/S.pdf", resolve))
		.toEqual(["S.pdf", "x/Old.pdf", "a/S.pdf"]);
	expect(currentOwnTargets([], [], "a/S.pdf", resolve)).toEqual([]);
});
