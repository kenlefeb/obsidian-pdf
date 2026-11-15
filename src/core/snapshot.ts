import type { Snapshot } from "./types.ts";

/**
 * The snapshot with every trace of a deleted file removed: from the note and PDF lists, and the
 * claim of a deleted note (the metadata cache may still remember it). Claims on a deleted PDF stay.
 */
export function withoutPath(snapshot: Snapshot, path: string): Snapshot {
	return {
		notePaths: snapshot.notePaths.filter((p) => p !== path),
		pdfPaths: snapshot.pdfPaths.filter((p) => p !== path),
		claims: snapshot.claims.filter((c) => c.notePath !== path),
	};
}
