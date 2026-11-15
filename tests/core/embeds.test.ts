import { expect, test } from "vitest";
import { rewriteEmbeds } from "../../src/core/embeds.ts";

test("rewrites bare, extensionless and full-path embeds", () => {
	const out = rewriteEmbeds("x ![[S.pdf]] y ![[S]] z ![[old/S.pdf]]", ["old/S.pdf", "S.pdf", "S"], "new/T.pdf");
	expect(out).toBe("x ![[new/T.pdf]] y ![[new/T.pdf]] z ![[new/T.pdf]]");
});

test("keeps page subpath and alias", () => {
	expect(rewriteEmbeds("![[S.pdf#page=3|scan]]", ["S.pdf"], "a/S.pdf")).toBe("![[a/S.pdf#page=3|scan]]");
});

test("resolves template placeholders, case-insensitively", () => {
	expect(rewriteEmbeds("![[{{title}}.pdf]] ![[{{FILE}}]]", [], "a/S.pdf")).toBe("![[a/S.pdf]] ![[a/S.pdf]]");
});

test("leaves other embeds and plain links alone", () => {
	const s = "![[Other.pdf]] [[S.pdf]] ![[S.png]]";
	expect(rewriteEmbeds(s, ["S.pdf", "S"], "a/S.pdf")).toBe(s);
});

test("names with regex metacharacters", () => {
	expect(rewriteEmbeds("![[a (1)+.pdf]]", ["a (1)+.pdf"], "b/a (1)+.pdf")).toBe("![[b/a (1)+.pdf]]");
});

test("matches old targets case-insensitively", () => {
	expect(rewriteEmbeds("![[s.PDF]]", ["S.pdf"], "a/S.pdf")).toBe("![[a/S.pdf]]");
});

test("ignores whitespace around the target inside the brackets", () => {
	expect(rewriteEmbeds("![[ S.pdf ]]", ["S.pdf"], "a/S.pdf")).toBe("![[a/S.pdf]]");
});

test("keeps an alias-only embed's alias", () => {
	expect(rewriteEmbeds("![[S.pdf|300]]", ["S.pdf"], "a/S.pdf")).toBe("![[a/S.pdf|300]]");
});

test("keeps a placeholder's subpath", () => {
	expect(rewriteEmbeds("![[{{title}}.pdf#page=2]]", [], "a/S.pdf")).toBe("![[a/S.pdf#page=2]]");
});
