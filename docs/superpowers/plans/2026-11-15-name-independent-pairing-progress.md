# Progress — name-independent pairing
Plan: docs/superpowers/plans/2026-11-15-name-independent-pairing.md
Start: 0f932c2 — baseline 321 tests, build, lint green (prior session)
Pre-flight: tasks 1-4 pure core (new files), 5-8 Obsidian layer switch, 9 docs. Sequential; no parallel tasks (shared files).
| Task | Base | Head | Status |
|---|---|---|---|
| 1 | 0f932c2 | 87f243b | APPROVED. Minors: template folder slashes (normalise in Task 5 templateLocations); S.md+S.MD share a PDF; 0 counts as marked |
| 2 | 87f243b | 0bf4bd7 | APPROVED after 1 fix round. Accepted limits: code detection (comments, math, tab fences), embeds in lists/tables, convertedMessage wording is after-wrap only (Task 8 uses describeConvert) |
| 3 | 38568df | 3608b34 | APPROVED (minors: param name linkedElsewhere in followNoteDelete, isFree dup, test polish) (accepted: kept-PDF notice, lower-case copy ext, extra guards) |
| 4 | 0bf4bd7 | ddfa87b | APPROVED after 2 fix rounds (Convert never moves another document PDF). Task 8 to check: Convert all label, executor stops after failed rename, items only via buildList |
| 5 | ddfa87b | 54a38da | APPROVED after 1 fix round. Deferred minors: read failure blocks marking; summary wording approximate; readMarked 3-arg no template check |
| 6 | ced5957 | 8460703 | APPROVED after 1 fix round. Unverified in Obsidian. Checklist: link opens once; empty block in canvas; viewer height |
| 7 | 54a38da | 191197e | APPROVED; minors fix 191197e (copy-like name guard) not separately re-reviewed, covered by final review. Deferred: watcher.ts 424 lines, withoutFile to core |
| 8 | 191197e | 6ca734c | APPROVED; minors fix 6ca734c (bulk convert via gatherNoteFolder) to be covered by final review |
| 9 | 6ca734c | f49a41d | done; reviewed in final review. Owner decisions to surface: Note composer merge deletes PDF; auto-wrap guard holds unrelated PDFs |
| final | f49a41d | 9177973 | Whole-branch code review: no Critical; fix wave cbc1738 (Convert after a move, name restriction removed, early returns, notices). Docs review corrections 9177973. 391 tests, build, lint green. Nothing run in Obsidian. |

## Decisions left for the owner
- Merging a wrapped note with Note composer deletes its PDF with it (no link protects it now).
- The automatic-wrapping hold is silent and folder-wide: one "PDF not found" note in a folder stops automatic wrapping of outside PDFs arriving there, with no retry.
- Convert adds no block to a note that had no embed.

## Deferred minors
- watcher.ts is over 400 lines (copy-source lookup and link check could move out).
- Code detection in Convert covers fenced blocks and inline code only.
- `readMarked` with three arguments does no template check.
- Read failure before marking in wrap blocks the marker (reported to the user).
- The bulk run skips stale entries without saying which.
