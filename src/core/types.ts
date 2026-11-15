/** One note's claim on a PDF. `pdfPath` is the resolved vault path, null if unresolved. */
export interface NoteClaim {
	notePath: string;
	rawTarget: string;
	pdfPath: string | null;
}

export interface Snapshot {
	notePaths: string[];
	pdfPaths: string[];
	claims: NoteClaim[];
}

export type PairState = "healthy" | "missing" | "misnamed" | "displaced" | "extra-claim" | "contested";

export interface PairStatus extends NoteClaim {
	state: PairState;
}

export interface Classification {
	pairs: PairStatus[];
	unwrappedPdfs: string[];
}

export type VaultEvent =
	| { kind: "rename"; path: string; oldPath: string; local: boolean }
	| { kind: "delete"; path: string; local: boolean; claimedPdf: string | null } // for a deleted note: its resolved claim from the previous cache
	| { kind: "create"; path: string; local: boolean };

export type Action =
	| { type: "rename"; from: string; to: string }
	| { type: "copy"; from: string; to: string }
	| { type: "setClaim"; notePath: string; pdfPath: string; oldTargets: string[] }
	| { type: "removeClaim"; notePath: string }
	| { type: "delete"; path: string }
	| { type: "wrap"; pdfPath: string }
	| { type: "notice"; message: string };

export interface Reaction {
	actions: Action[];
	recheck: boolean;
	pendingRemoved: string | null;
}

export type AttentionKind = Exclude<PairState, "healthy"> | "note-removed" | "unwrapped";

export interface AttentionItem {
	kind: AttentionKind;
	notePath: string | null;
	pdfPath: string | null;
	rawTarget: string | null;
}

export type FixId = "rename-pdf-to-note" | "rename-note-to-pdf" | "move-pdf-to-note" | "copy-pdf-for-note"
	| "choose-pdf" | "remove-claim" | "delete-pdf" | "wrap" | "keep-plain";
