import { dirname, samePair } from "./paths.ts";
import type { Classification, PairState, Snapshot } from "./types.ts";

export function classify(snapshot: Snapshot): Classification {
	const claimCount = new Map<string, number>();
	const healthyCount = new Map<string, number>();
	for (const claim of snapshot.claims) {
		if (claim.pdfPath === null) continue;
		claimCount.set(claim.pdfPath, (claimCount.get(claim.pdfPath) ?? 0) + 1);
		if (samePair(claim.notePath, claim.pdfPath)) {
			healthyCount.set(claim.pdfPath, (healthyCount.get(claim.pdfPath) ?? 0) + 1);
		}
	}

	const pairs = snapshot.claims.map((claim) => {
		const pdfPath = claim.pdfPath;
		let state: PairState;
		if (pdfPath === null) state = "missing";
		else if (samePair(claim.notePath, pdfPath)) state = "healthy";
		else if ((healthyCount.get(pdfPath) ?? 0) > 0) state = "extra-claim";
		else if ((claimCount.get(pdfPath) ?? 0) > 1) state = "contested";
		else if (dirname(claim.notePath) === dirname(pdfPath)) state = "misnamed";
		else state = "displaced";
		return { ...claim, state };
	});

	const claimed = new Set<string>();
	for (const claim of snapshot.claims) {
		if (claim.pdfPath !== null) claimed.add(claim.pdfPath);
	}
	return { pairs, unwrappedPdfs: snapshot.pdfPaths.filter((p) => !claimed.has(p)) };
}

export function healthyPairs(c: Classification): { notePath: string; pdfPath: string }[] {
	const result: { notePath: string; pdfPath: string }[] = [];
	for (const pair of c.pairs) {
		if (pair.state === "healthy" && pair.pdfPath !== null) {
			result.push({ notePath: pair.notePath, pdfPath: pair.pdfPath });
		}
	}
	return result;
}
