import { TFolder, type App, type TAbstractFile, type Vault } from "obsidian";
import { around } from "monkey-around";

/** How long a mark stays valid after the wrapped method was called. */
const MARK_TTL_MS = 5000;

interface Mark {
	expires: number;
	folder: boolean;
}

/**
 * Notes which paths are being changed by this device's own Obsidian, by wrapping
 * the `Vault` methods that in-app renames, moves and deletes go through.
 * Changes Obsidian picks up from the file system (Finder, sync) are expected not
 * to pass through these methods. That expectation is unverified; see spike 2.
 */
export class LocalIntent {
	private readonly marks = new Map<string, Mark>();

	constructor(private readonly app: App) {}

	/** Wraps `Vault.rename`, `Vault.trash` and `Vault.delete`. Returns the uninstaller. */
	install(): () => void {
		const track = <T>(file: TAbstractFile, run: () => Promise<T>): Promise<T> => {
			const mark = this.mark(file);
			return run().catch((error: unknown) => {
				// The change did not happen, so the path is not being changed locally.
				if (this.marks.get(file.path) === mark) this.marks.delete(file.path);
				throw error;
			});
		};

		// Wrap the vault instance rather than Vault.prototype: Obsidian reaches these
		// methods through `app.vault`, and an own property on the instance shadows the
		// prototype for every caller without altering the class for anything else.
		return around(this.app.vault, {
			rename(next) {
				return function (this: Vault, file: TAbstractFile, newPath: string) {
					return track(file, () => next.call(this, file, newPath));
				};
			},
			trash(next) {
				return function (this: Vault, file: TAbstractFile, system: boolean) {
					return track(file, () => next.call(this, file, system));
				};
			},
			delete(next) {
				return function (this: Vault, file: TAbstractFile, force?: boolean) {
					return track(file, () => next.call(this, file, force));
				};
			},
		});
	}

	/**
	 * True if `path` was marked within the last 5000 ms. A file mark is used up by
	 * the first call that matches it. A folder mark is not used up: it answers for
	 * the folder itself and for every path inside it until it expires, because a
	 * folder move or delete fires one event per child in no guaranteed order.
	 */
	consume(path: string): boolean {
		const now = Date.now();
		for (const [markedPath, mark] of this.marks) {
			if (mark.expires <= now) this.marks.delete(markedPath);
		}

		const exact = this.marks.get(path);
		if (exact) {
			if (!exact.folder) this.marks.delete(path);
			return true;
		}
		for (const [markedPath, mark] of this.marks) {
			if (mark.folder && path.startsWith(`${markedPath}/`)) return true;
		}
		return false;
	}

	private mark(file: TAbstractFile): Mark {
		const mark: Mark = { expires: Date.now() + MARK_TTL_MS, folder: file instanceof TFolder };
		this.marks.set(file.path, mark);
		return mark;
	}
}
