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
