/** How long a mark stays valid after it was made. */
export const MARK_TTL_MS = 5000;

export type Clock = () => number;

interface Mark {
	expires: number;
	folder: boolean;
}

/** Shared bookkeeping: path → mark, expiring after MARK_TTL_MS. */
class Marks {
	private readonly marks = new Map<string, Mark>();

	constructor(private readonly now: Clock) {}

	/** Marks `path` and returns a function that removes this mark again, and nothing else. */
	mark(path: string, folder: boolean): () => void {
		const mark: Mark = { expires: this.now() + MARK_TTL_MS, folder };
		this.marks.set(path, mark);
		return () => {
			if (this.marks.get(path) === mark) this.marks.delete(path);
		};
	}

	/** True if `path` is marked or lies inside a marked folder. Uses up an exact file mark when `useUp`. */
	check(path: string, useUp: boolean): boolean {
		this.dropExpired();
		const exact = this.marks.get(path);
		if (exact) {
			if (useUp && !exact.folder) this.marks.delete(path);
			return true;
		}
		for (const [markedPath, mark] of this.marks) {
			if (mark.folder && path.startsWith(`${markedPath}/`)) return true;
		}
		return false;
	}

	/** True, once, if `path` has a file mark of its own. A folder mark covering it does not count and is left as it is. */
	checkFile(path: string): boolean {
		this.dropExpired();
		const exact = this.marks.get(path);
		if (!exact || exact.folder) return false;
		this.marks.delete(path);
		return true;
	}

	private dropExpired(): void {
		const now = this.now();
		for (const [markedPath, mark] of this.marks) {
			if (mark.expires <= now) this.marks.delete(markedPath);
		}
	}
}

/**
 * Paths the plugin itself is about to change, so it does not react to its own renames, copies,
 * deletes and new notes. Marked just before the vault call; the event uses the mark up.
 */
export class OwnChanges {
	private readonly marks: Marks;

	constructor(now: Clock = Date.now) {
		this.marks = new Marks(now);
	}

	/** Marks `path` and returns a function that removes this mark (for a vault call that failed). */
	mark(path: string): () => void {
		return this.marks.mark(path, false);
	}

	/** True, once, if `path` was marked within the last 5000 ms. */
	consume(path: string): boolean {
		return this.marks.check(path, true);
	}
}

/** How long a note created inside Obsidian waits for the metadata cache to index it. */
export const PENDING_CREATE_TTL_MS = 10000;

/**
 * Notes just created inside Obsidian whose marker the metadata cache may not have indexed yet when their `create`
 * event is handled. The Watcher reacts to them once more when the cache reports them changed.
 */
export class PendingCreates {
	private readonly expiries = new Map<string, number>();

	constructor(private readonly now: Clock = Date.now) {}

	/** Remembers `path` for PENDING_CREATE_TTL_MS from now, restarting the expiry if it is already remembered. */
	add(path: string): void {
		const now = this.now();
		// Forget expired entries nobody asked about again, so the map stays small.
		for (const [pendingPath, expires] of this.expiries) {
			if (expires <= now) this.expiries.delete(pendingPath);
		}
		this.expiries.set(path, now + PENDING_CREATE_TTL_MS);
	}

	/** True while `path` is remembered and has not expired. Does not use it up. */
	has(path: string): boolean {
		const expires = this.expiries.get(path);
		if (expires === undefined) return false;
		if (expires > this.now()) return true;
		this.expiries.delete(path);
		return false;
	}

	/** True, once, while `path` is remembered and has not expired. */
	consume(path: string): boolean {
		const pending = this.has(path);
		this.expiries.delete(path);
		return pending;
	}

	/** Drops `path`, for example because the note there was deleted or renamed away. */
	forget(path: string): void {
		this.expiries.delete(path);
	}

	clear(): void {
		this.expiries.clear();
	}
}

/** How long the source of an in-app copy is remembered for the `create` event of the copy. */
export const COPY_SOURCE_TTL_MS = 10000;

/** Which file each file just copied inside Obsidian was copied from: destination path → source path. */
export class CopySources {
	private readonly sources = new Map<string, { sourcePath: string; expires: number }>();

	constructor(private readonly now: Clock = Date.now) {}

	/** Remembers that `destPath` is a copy of `sourcePath`, for COPY_SOURCE_TTL_MS from now. */
	record(destPath: string, sourcePath: string): void {
		const now = this.now();
		// Forget expired entries nobody took, so the map stays small.
		for (const [path, source] of this.sources) {
			if (source.expires <= now) this.sources.delete(path);
		}
		this.sources.set(destPath, { sourcePath, expires: now + COPY_SOURCE_TTL_MS });
	}

	/** The source recorded for `destPath`, once; null when there is none or it has expired. */
	take(destPath: string): string | null {
		const source = this.sources.get(destPath);
		if (source === undefined) return null;
		this.sources.delete(destPath);
		return source.expires > this.now() ? source.sourcePath : null;
	}
}

/**
 * Paths being changed by this device's own Obsidian (see LocalIntent). A file mark is used up by the first
 * `consume` that matches it. A folder mark is not used up: it answers for the folder itself and for every path
 * inside it until it expires, because a folder move or delete fires one event per child in no guaranteed order.
 */
export class IntentMarks {
	private readonly marks: Marks;

	constructor(now: Clock = Date.now) {
		this.marks = new Marks(now);
	}

	mark(path: string, folder: boolean): () => void {
		return this.marks.mark(path, folder);
	}

	consume(path: string): boolean {
		return this.marks.check(path, true);
	}

	/**
	 * True, once, if `path` itself was marked as a file. Unlike `consume`, a folder mark covering `path` does not
	 * count: a folder rename or delete marks everything inside it, and a note that sync creates there meanwhile must
	 * not read as an in-app copy.
	 */
	consumeFileMark(path: string): boolean {
		return this.marks.checkFile(path);
	}
}
