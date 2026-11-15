// The data the core works on once pairing is by name and folder only: a marked note and the PDF beside it.

export interface MarkedNote {
	notePath: string;
	/** Raw target when the marker value is a link to a PDF (the old format); else null. */
	markerLink: string | null;
	/** Resolved path of markerLink; null when there is no link or it resolves to nothing. */
	linkedPdf: string | null;
	/**
	 * Raw link targets, as written anywhere in the note (properties or body), that resolve to the PDF beside the note
	 * or to linkedPdf. Includes markerLink when it resolves.
	 */
	ownTargets: string[];
}

export interface VaultSnapshot {
	notePaths: string[];
	pdfPaths: string[];
	marked: MarkedNote[];
}

export type PairState = "healthy" | "pdf-not-found";

export interface Pair {
	note: MarkedNote;
	/** The PDF beside the note under its name; null when it is not found. */
	pdfPath: string | null;
	state: PairState;
}

export interface Pairing {
	pairs: Pair[];
	unwrappedPdfs: string[];
}

export type FollowEvent =
	| { kind: "rename"; path: string; oldPath: string; local: boolean }
	| { kind: "delete"; path: string; local: boolean; wasMarked: boolean; linkedElsewhere?: boolean }
	| { kind: "create"; path: string; local: boolean; copiedFrom: string | null };

export type FileAction =
	| { type: "rename"; from: string; to: string }
	| { type: "copy"; from: string; to: string }
	| { type: "delete"; path: string }
	| { type: "wrap"; pdfPath: string }
	| { type: "removeMarker"; notePath: string }
	| { type: "convert"; notePath: string; ownTargets: string[] }
	| { type: "notice"; message: string };

export interface FollowResult {
	actions: FileAction[];
	recheck: boolean;
	pendingRemoved: string | null;
}

export type ListKind = "pdf-not-found" | "links-own-pdf" | "note-removed" | "unwrapped";

export interface ListItem {
	kind: ListKind;
	notePath: string | null;
	pdfPath: string | null;
}

export type RepairId = "use-pdf" | "rename-note-to-pdf" | "copy-pdf" | "remove-marker"
	| "convert" | "delete-pdf" | "wrap" | "keep-plain";
