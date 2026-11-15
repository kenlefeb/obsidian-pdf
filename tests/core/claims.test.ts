import { expect, test } from "vitest";
import { claimChanged, formatClaim, isLinkSafeName, parseClaim } from "../../src/core/claims.ts";

test("parses canonical and bare links", () => {
	expect(parseClaim("[[a/S.pdf|S.pdf]]")).toBe("a/S.pdf");
	expect(parseClaim("[[S.pdf]]")).toBe("S.pdf");
	expect(parseClaim("  [[S.PDF]] ")).toBe("S.PDF");
	expect(parseClaim("[[a/S.pdf#page=2|x]]")).toBe("a/S.pdf");
});

test("single-item list is accepted", () => {
	expect(parseClaim(["[[S.pdf]]"])).toBe("S.pdf");
});

test("malformed values are not claims", () => {
	for (const v of [undefined, null, 5, true, "", "S.pdf", "[[S]]", "[[S.md]]", "[[S.pdf]] and more", "[x](S.pdf)", [], ["[[a.pdf]]", "[[b.pdf]]"], [5], { a: 1 }]) {
		expect(parseClaim(v)).toBeNull();
	}
});

test("format is canonical", () => {
	expect(formatClaim("a/b/S.pdf")).toBe("[[a/b/S.pdf|S.pdf]]");
	expect(formatClaim("S.pdf")).toBe("[[S.pdf|S.pdf]]");
});

test("round-trips awkward names", () => {
	for (const p of ["a/It's (final) & co.pdf", "a/50% off, v2.pdf", "a/naïve résumé.pdf", "a/quote \"x\".pdf"]) {
		expect(parseClaim(formatClaim(p))).toBe(p);
	}
});

test("names with link metacharacters do not round-trip (wrap refuses them)", () => {
	expect(parseClaim(formatClaim("a/x|y.pdf"))).not.toBe("a/x|y.pdf");
});

test("isLinkSafeName flags link metacharacters", () => {
	expect(isLinkSafeName("a/Statement 2024.pdf")).toBe(true);
	for (const p of ["a/x[1].pdf", "a/x]1.pdf", "a/x|y.pdf", "a/x#1.pdf", "a/x^1.pdf"]) {
		expect(isLinkSafeName(p)).toBe(false);
	}
});

// claimChanged
const claim = (rawTarget: string, pdfPath: string | null) => ({ notePath: 'a/S.md', rawTarget, pdfPath });
test('claimChanged is false when both are absent or both say the same', () => {
	expect(claimChanged(null, null)).toBe(false);
	expect(claimChanged(claim('a/S.pdf', 'a/S.pdf'), claim('a/S.pdf', 'a/S.pdf'))).toBe(false);
	expect(claimChanged(claim('gone.pdf', null), claim('gone.pdf', null))).toBe(false);
});
test('claimChanged is true when the claim appears or disappears', () => {
	expect(claimChanged(null, claim('a/S.pdf', 'a/S.pdf'))).toBe(true);
	expect(claimChanged(claim('a/S.pdf', 'a/S.pdf'), null)).toBe(true);
});
test('claimChanged is true when the target or what it resolves to changes', () => {
	expect(claimChanged(claim('a/S.pdf', 'a/S.pdf'), claim('a/T.pdf', 'a/T.pdf'))).toBe(true);
	expect(claimChanged(claim('S.pdf', 'a/S.pdf'), claim('a/S.pdf', 'a/S.pdf'))).toBe(true);
	expect(claimChanged(claim('S.pdf', null), claim('S.pdf', 'a/S.pdf'))).toBe(true);
});
