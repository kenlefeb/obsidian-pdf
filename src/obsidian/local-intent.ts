import { TFolder, type App, type DataWriteOptions, type FileManager, type TAbstractFile, type Vault } from "obsidian";
import { around } from "monkey-around";
import { IntentMarks } from "../core/marks.ts";

/**
 * Notes which paths are being changed by this device's own Obsidian, by wrapping
 * the `Vault` methods that in-app renames, moves and deletes go through.
 * Changes Obsidian picks up from the file system (Finder, sync) are expected not
 * to pass through these methods. That expectation is unverified; see spike 2.
 *
 * It also tracks every wrapped call still running (including `FileManager.renameFile`,
 * which rewrites links after `Vault.rename` has returned), so a reaction can wait until
 * the user's own operation has fully finished.
 */
export class LocalIntent {
	private readonly marks = new IntentMarks();
	private readonly inFlight = new Set<Promise<unknown>>();

	constructor(private readonly app: App) {}

	/** Wraps `Vault.rename`, `trash`, `delete`, `create`, `createBinary`, `copy` and `FileManager.renameFile`. Returns the uninstaller. */
	install(): () => void {
		/** Runs `run`, counting it as in flight until it settles. */
		const follow = <T>(run: () => Promise<T>): Promise<T> => {
			const pending = run();
			const settled = pending.then(() => undefined, () => undefined);
			this.inFlight.add(settled);
			void settled.then(() => this.inFlight.delete(settled));
			return pending;
		};

		const track = <T>(file: TAbstractFile, run: () => Promise<T>): Promise<T> =>
			trackPath(file.path, file instanceof TFolder, run);

		const trackPath = <T>(path: string, isFolder: boolean, run: () => Promise<T>): Promise<T> => {
			// If the call fails, the change did not happen, so the path is not being changed locally.
			const unmark = this.marks.mark(path, isFolder);
			let pending: Promise<T>;
			try {
				pending = follow(run);
			} catch (error) {
				unmark();
				throw error;
			}
			return pending.catch((error: unknown) => {
				unmark();
				throw error;
			});
		};

		// Wrap the instances rather than the prototypes: Obsidian reaches these methods
		// through `app.vault` and `app.fileManager`, and an own property on the instance shadows
		// the prototype for every caller without altering the class for anything else.
		const unwrapVault = around(this.app.vault, {
			// The destination path is marked, so a file made inside Obsidian (a drop, a paste, a copy) reads as local
			// when its `create` event arrives. Rename and delete marks are by path too, so these do not affect them.
			create(next) {
				return function (this: Vault, path: string, data: string, options?: DataWriteOptions) {
					return trackPath(path, false, () => next.call(this, path, data, options));
				};
			},
			createBinary(next) {
				return function (this: Vault, path: string, data: ArrayBuffer, options?: DataWriteOptions) {
					return trackPath(path, false, () => next.call(this, path, data, options));
				};
			},
			copy(next) {
				return function <T extends TAbstractFile>(this: Vault, file: T, newPath: string) {
					// A folder mark is never used up and answers for every path inside for 5 s, so a sync or Finder delete
					// there would read as local. A folder copy is therefore only followed (kept in flight), not marked.
					if (file instanceof TFolder) return follow(() => next.call(this, file, newPath)) as Promise<T>;
					return trackPath(newPath, false, () => next.call(this, file, newPath)) as Promise<T>;
				};
			},
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
		// No mark of its own: the `Vault.rename` inside it marks the path. This only keeps the
		// operation in flight while Obsidian updates links to the renamed file.
		const unwrapFileManager = around(this.app.fileManager, {
			renameFile(next) {
				return function (this: FileManager, file: TAbstractFile, newPath: string) {
					return follow(() => next.call(this, file, newPath));
				};
			},
		});
		return () => {
			unwrapFileManager();
			unwrapVault();
		};
	}

	/**
	 * True if `path` was marked within the last 5000 ms. A file mark is used up by
	 * the first call that matches it. A folder mark is not used up: it answers for
	 * the folder itself and for every path inside it until it expires, because a
	 * folder move or delete fires one event per child in no guaranteed order.
	 */
	consume(path: string): boolean {
		return this.marks.consume(path);
	}

	/** What `consume(path)` would answer, without using a mark up. For diagnostics that must not take a mark from the Watcher. */
	peek(path: string): boolean {
		return this.marks.peek(path);
	}

	/** Resolves once no wrapped call is running (at once when none is). Never rejects. */
	async whenIdle(): Promise<void> {
		while (this.inFlight.size > 0) {
			await Promise.all([...this.inFlight]);
		}
	}
}
