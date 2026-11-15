# SDD ledger — plan: docs/superpowers/plans/2026-11-15-paired-pdf-documents.md
Spec: docs/superpowers/specs/2026-11-15-paired-pdf-documents-design.md
Branch: claude/sweet-dijkstra-j3nlr9 (cloud container; designated dev branch, not main)
Scope this session: Tasks 1-5. Task 5 ends in a HARD STOP for the owner's spike results.

## Pre-flight scan
| Tasks | Produces vs consumes | Finding |
|---|---|---|
| 1 self | settings-data tests vs signatures | agree |
| 1 vs constraints | Step 6 keeps attachment-folder read + existing attachment frontmatter write in pdf-wrapper.ts | Ruling: interim state through Task 5 is allowed; Task 6 removes it — plan says so explicitly — cost if wrong: none, unreleased |
| 2 self | isLinkSafeName defined in prose, not in Produces block | Ruling: it is part of Task 2's interface; tell implementer |
| 2 -> 3 | samePair case rules ('a/S.md','a/S.PDF' true; base name case-sensitive) | agree |
| 3 self | one commented test body | plan says write real body; fine |
| 4 self | one commented test body | same |
| 3,4 -> 5 | buildExplorerCss, types | agree |
| 5 self | no unit tests, throwaway spike | Ruling: plan-mandated and spec-mandated (spikes are throwaway); LocalIntent is kept code but only verifiable in Obsidian — cost if wrong: caught by owner's spike |
| 1,5 | both modify main.ts, package.json | sequential, no conflict |

## Progress
Task 1: dispatched (BASE 4e526b2, implementer ad68df4dbf6d5e419, model sonnet)
Task 1: implementer DONE_WITH_CONCERNS at 028c8a8
Ruling: accept vitest ^3.2.7 and @types/node ^20.19 (latest vitest would not resolve against pinned esbuild 0.25.5) — CI runs Node 20/22 so types match — cost if wrong: dev-dependency bump only, revertible
Ruling: accept label "Hide paired PDF files in the file explorer" (lint sentence-case rule rejected "PDFs") — lint is a global constraint, label wording is not spec-fixed — cost if wrong: one string
Ruling: eslint.config.mts unchanged is fine — lint passes and covers tests via tsconfig include
Task 1: review Approved, no Critical/Important. Label deviation covered by ruling above.
Task 1: cannot-verify resolved by controller: npm ci from committed lockfile + build + lint + test (see session) 
Task 1: minor (deferred): marker input stays blank after emptying while stored value is default; saves on every keystroke
Task 1: minor (deferred): specificAttachmentFolder keeps a leading slash ("/foo") and whitespace-only values
Task 1: minor (deferred): package.json name still obsidian-wrap-pdf (Task 14 renames)
Task 1: complete (commits 4e526b2..028c8a8, review clean)
Task 2: implementer DONE at bb558ac (BASE 028c8a8, agent afe7a8d3a1cb96041)
Ruling: commit trailers follow each subagent's own session attribution — the harness names the authoring model per session — cost if wrong: trailer text only
Task 2: review Approved, no Critical/Important
Task 2: minor (deferred): non-round-trip test asserts .not.toBe; toBeNull would pin behaviour (plan-mandated form)
Task 2: minor (deferred): isInFolder does not tolerate trailing slash on folder; '' folder untested (specificAttachmentFolder already strips trailing slashes)
Task 2: minor (deferred): no regression tests for [[S.pdf|]], [[ ]], [[.pdf]]
Task 2: complete (commits 028c8a8..bb558ac, review clean)
Task 3: dispatching (BASE bb558ac, model sonnet)
Task 3: implementer DONE at 3230bf7 (agent a09d25bf5c85060e8)
Task 3: review Approved, no Critical/Important
Task 3: minor (deferred): classify.ts `claimed` set duplicates claimCount keys
Task 3: minor (deferred): no test for one healthy + two copies; healthyPairs test lacks extra-claim/missing entries
Task 3: minor (deferred): quote style differs between src (double) and tests (single)
Task 3: complete (commits bb558ac..3230bf7, review clean)
Task 4: implementer DONE at d9fc15b (BASE 3230bf7, agent a26e7aba0275cb1e2)
Ruling (Task 5): spike log file is per device (pdf-wrapper-spike-log-<desktop|mobile>-<id>.md, id persisted in local storage) instead of one shared pdf-wrapper-spike-log.md — two devices appending to one synced file would conflict and corrupt the evidence the spike exists to gather — cost if wrong: owner sends two files instead of one, which the plan already asks for
Task 5: dispatching (BASE d9fc15b, model opus)
Task 4: review Approved, no Critical/Important
Task 4: minor (deferred): rewriteEmbeds matches old targets case-sensitively; Obsidian resolves links case-insensitively (worth fixing before Task 6 uses it)
Task 4: minor (deferred): whitespace inside ![[ S.pdf ]] not matched; no test for alias-only embed ![[S.pdf|300]] or placeholder with subpath/alias
Task 4: minor (deferred): note-path escaping not asserted at buildExplorerCss level; brace-count test name overstates ("parses as a stylesheet")
Task 4: minor (deferred): inline pair/options types in explorer-css.ts could be named
Task 4: complete (commits 3230bf7..d9fc15b, review clean)
Task 5: implementer running (agent a6d2d5820ce4e8e5d, model opus, BASE d9fc15b)
Task 5: implementer DONE_WITH_CONCERNS at 2cef7bc
Ruling: accept implementer's deviations (command reworded for lint; folder marks not consumed, expire at 5 s; marks removed when the wrapped call throws; PDF size logged in bytes; iCloud not-downloaded section added; instance-level wrapping of app.vault) — all are observations within the task's intent, and spec lists the iCloud question — cost if wrong: caught by review or by the owner's spike
Task 5: review Needs fixes — 3 Important: (I1) pair-rename note-to-PDF gap unmeasurable with 1-minute waits; (I2) phone auto-lock distorts timings; (I3) iCloud not-downloaded question not answered by logs though checklist claims it
Task 5: fix round 1/5 dispatching to original implementer a6d2d5820ce4e8e5d (FIX_BASE 2cef7bc). Also sending cheap minors: Q1 wording, drop concurrent dummy creation, record Obsidian versions, sync-throw in track
Task 5: minor (deferred): recentDeletes never pruned for PDFs; unload flush not awaited (throwaway code)
Task 5: fix round 1/5 (7 addressed, 0 open; commits 2cef7bc..3c33d77)
Task 5: minor (deferred): "Auto-Lock was" line filled twice; header says size only for create/rename/delete/modify but also set on metadata `deleted`
Task 5: complete through step 5 (commits d9fc15b..3c33d77, review clean after 1 fix round). Step 6 = HARD STOP: hand build + checklist to owner, wait for spike logs. Do NOT start Task 6 before results.
Owner change 2026-11-15 (approved): wrapping has no prerequisites. Spec rev 4, plan gained Task 6a and amended Tasks 5(step 6), 6, 8, 11 — commit 2dea4cf.
Ruling: Tasks 6a and 6 proceed before spike results — wrap-in-place and the template logic do not depend on local-intent or explorer findings; the gate now sits before Task 7 — cost if wrong: none, layout and marker are owner-decided
Ruling: Task 6 implementer also makes rewriteEmbeds match old targets case-insensitively and trim whitespace (Task 4 deferred minor), with tests — Obsidian resolves links case-insensitively and Task 6 is the first caller — cost if wrong: small, unit-tested
Task 6a: dispatching (BASE 2dea4cf, model sonnet)
Task 6a: implementer DONE_WITH_CONCERNS at a490e5f (agent a01c0c2714a1ca6fe). Concern = lint parse error on spike-build/main.js, which was the controller's untracked hand-off copy; loose files removed (zip kept), lint clean again.
Owner report 2026-11-15: "hiding doesn't appear to be working" — screenshot shows the settings toggle on and a real wrapped PDF still visible. Expected: the toggle is not wired until Task 13; spike hiding only applies to dummy pairs via the spike commands. Owner told. Obsidian version seen: 1.15.1 desktop. NOT yet a spike-1 result.
Task 6a: review Needs fixes — 1 Important: embed glued onto closing fence when frontmatter ends file without newline (template corruption)
Task 6a: fix round 1/5 dispatched to original implementer a01c0c2714a1ca6fe (FIX_BASE a490e5f); also sent minors: line ending from fence line, BOM, quoted marker key, invariant test
Task 6a: minor (deferred): usableFolder trims before stripping slashes ("/ T /" keeps inner spaces)
Task 6: implementer running concurrently (agent a282cbe885dc4fd30, model opus, BASE a490e5f) — touches pdf-wrapper.ts, main.ts, obsidian/snapshot.ts, core/embeds.ts(+test); commits will interleave with 6a fix, so review packages must be path-scoped
Task 6a: fix round 1 committed d284ed7; re-review dispatched (agent a380d4881a08e7e18)
Task 6: implementer DONE_WITH_CONCERNS at 79a33f9 (commits a70dc7c, 79a33f9). Concern 1 (other agent's uncommitted template files) resolved: 6a fix landed as d284ed7, full suite re-run by controller.
Task 6 concerns for the reviewer/fix round: doubled wording "Failed to wrap X: Cannot wrap X: ..."; literal backticks in the template-updated notice; saveSettings failure not naming the path; processFrontMatter-creates-block assumption undocumented
Task 6a: fix round 1/5 (5 addressed, 0 open; commits a490e5f..d284ed7 scoped to template files)
Task 6a: minor (deferred): raw U+FEFF literal in template.ts source (use ﻿ escape); frontmatter-only file gets embed with no blank line after fence
Task 6a: complete (commits 2dea4cf..d284ed7, review clean after 1 fix round)
Task 6: review dispatched (agent a4fe4237005e9fe86, model opus)
Owner report 2 (2026-11-15): dummy pairs "don't use the template / link / embed" (by design: dummy pairs are empty files) AND "file explorer isn't hiding anything" after the spike toggle — possible real spike-1 finding on Obsidian 1.15.1; diagnosing.
Task 6: review Needs fixes — 2 Important: (I1) failure after note creation leaves unexplained half-wrapped note; (I2) saveSettings failure has no path/context
Ruling: template repair uses vault.process instead of the brief's vault.modify — atomic read-modify-write avoids losing a concurrent edit or sync; spec fixes behaviour not the API call — cost if wrong: none
Task 6: fix round 1/5 dispatched to original implementer a282cbe885dc4fd30 (FIX_BASE d284ed7 for Task 6 files). Also sent minors: WrapRefusal wording, backticks, template==note path + case-insensitive sibling, embed rewrite scope, in-flight guard, checklist additions
Task 6: minor (deferred, plan-mandated unchanged code): when Templater throws or returns nothing, the fallback creates the note from the raw template with <% %> left in and reports success
Owner result (partial spike 1): spike hiding command works on Obsidian 1.15.1 desktop; scale/restart/phone not yet reported.
Task 6: fix round 1 committed e0d43e0; controller re-ran tests; re-review dispatching
Task 6: fix round 1/5 (8 + checklist addressed, 0 original open; commits d284ed7..e0d43e0). Re-review raised 5 new Minors in the fix diff.
Ruling: new items 1 (open failure shown as "Failed to wrap…: Wrapped…") and 2 ("could not mark" when only embed rewrite failed) are treated as Important — they are messages that misdescribe vault state, which the owner's revision-4 rule forbids — cost if wrong: one extra short round
Task 6: fix round 2/5 dispatched to a282cbe885dc4fd30 (FIX_BASE e0d43e0): open-failure display, embed-step error distinction, Templater-wrote-then-threw lookup, doc comment, I1 wording
Task 6: minor (deferred): case-insensitive sibling check also blocks on case-sensitive filesystems (decision not recorded in spec); possible duplicated frontmatter-fence logic between core/frontmatter.ts and core/template.ts; Templater returning undefined after self-rename can leave a second unreported note
Owner result (spike 1, desktop): hiding 300 dummy pairs works well on Obsidian 1.15.1 Mac. Restart and phone unchecked; 3000 not run. Decision per plan: hidePairedPdfs default stays true; note unverified items in README/checklist. Spike 2 still outstanding — gate before Task 7 stands.
Task 6: fix round 2/5 (5 addressed, 0 open; commits e0d43e0..abf9d10)
Task 6: minor (deferred): checklist line for tp.file.rename says notice "starts 'Created…'" but it now starts "Failed to wrap X.pdf: Created…"
Task 6: minor (deferred): notMarked says "Created <path>" when a leftover file exists after vault.create failed (concurrent create) — may misattribute who created it
Task 6: minor (deferred): no unit coverage for EmbedUpdateError branch, WrapIncomplete, Templater-reuse path (Obsidian layer; manual checklist covers)
Task 6: complete (commits a490e5f..abf9d10 excluding d284ed7, review clean after 2 fix rounds)
GATE: Tasks 7-14 wait for owner's spike 2 logs. Spike 1 desktop result recorded above. Next action on resume: read logs, decide local-intent, set SETTLE_MS, then dispatch Task 7.
Owner result (spike 1, desktop, 3000 pairs): hiding works while scrolling until about row 900-something, then PDFs are no longer hidden. Controller reproduced the same 6000 rules on 3000 simulated rows in Chromium 153: all parsed, all PDFs hidden — so not a CSS-engine limit; cause is Obsidian-specific (explorer virtualisation / DOM) or the sheet held fewer pairs. Awaiting owner diagnostics (notice count, first visible Doc number, console probe).
Owner decision 2026-11-15: expose local-intent reliance as a setting, default assuming detection works. Spec rev 5; plan Task 5 step 6 no longer a gate; Task 8 gains followDeletes/followRenames; Task 13 default stays on.
Ruling: added a sibling followRenames setting alongside the owner's delete setting — same detection, same failure remedy — cost if wrong: one extra toggle
GATE LIFTED: Tasks 7-14 proceed. SETTLE_MS provisional 2000 (no spike 2 data).
Task 7: dispatching (model sonnet)
Task 7: implementer DONE at 732e648 (agent aac6c73c3b341610f, BASE 9d1e8de). Known issue to fix: case-only rename of a note finds its own partner as 'destination taken' → notice instead of following.
Task 7: review Needs fixes — I1 case-only rename refused with false notice; I2 (plan-mandated) setClaim emitted for non-local renames
Ruling: I2 — spec governing rule beats the plan's unconditioned "setClaim only" rows: no writes for non-local changes; return recheck — cost if wrong: after an outside folder move a pair may be listed for a one-click fix instead of silently normalised
Task 7: fix round 1/5 dispatched to aac6c73c3b341610f (FIX_BASE 732e648, scoped to react.ts + test). Also sent: other-owner guard, recheck coverage, case-insensitive shouldAutoWrap, test snapshot fix
Task 7: minor (deferred): a PDF rename can move the note of a pair that was not healthy before the event (event carries no previous claim) — unusual snapshot; consider carrying previous claim
Task 7: hand-off to Task 8: executor must re-check destination at execution time (folders invisible to react), handle case-only renames on case-insensitive filesystems, pass null (not '') for root attachment folder, exclude deleted note's own claim from the snapshot
Task 9: implementer running concurrently (agent a2c1b7f71a6e8e80a, model sonnet, BASE 732e648)
Task 9: implementer DONE_WITH_CONCERNS at d95c451 (concerns = disclosed choices; '' attachment folder handled by callers passing null per specificAttachmentFolder). Review dispatching.
Task 7: fix round 1 committed 628e23e; controller ran full suite; re-review dispatching
Task 7: re-review of fix round 1 dispatched (sonnet)
Task 9: review Needs fixes — 4 Important: choose-pdf leaves broken embed (rawTarget not in oldTargets); isBulkFixable/planFix do not re-check a stale item against the snapshot (can move a healthy pair's PDF); choose-pdf accepts a claimed PDF; delete-pdf not validated against snapshot/kind
Task 9: fix round 1/5 dispatched to a2c1b7f71a6e8e80a (FIX_BASE d95c451): isCurrent() re-validation at top of planFix, delete-pdf/choose-pdf guards, isBulkFixable ownership, rawTarget in oldTargets, candidate ordering
Task 9: hand-off to Task 10: store should drop rows where isCurrent() is false and refresh after a 'changed since listed' notice; executor must refuse a folder at a destination
Task 8: implementer running (agent aca86a1bcb85709b4, model opus, BASE 628e23e), concurrent with Task 9 fix round 1 and Task 7 re-review
Task 7: fix round 1/5 (6 addressed, 0 open; commits 732e648..628e23e scoped to react files)
Task 7: complete (commits 9d1e8de..628e23e, review clean after 1 fix round)
Task 9: fix round 1 committed c151296; re-review dispatching
Task 9: fix round 1/5 (6 addressed, 0 open; commits d95c451..c151296 scoped to fixes files)
Task 9: minor (deferred): noticeOnly test helper cannot tell the stale notice from the taken notice; isBulkFixable/planFix re-run classify per item (O(N×snapshot) in fix-all); oldTargets may include the new canonical target (verify rewriteEmbeds treats old==new as no-op)
Task 9: complete (commits 732e648..c151296 scoped, review clean after 1 fix round)
Task 8: implementer DONE_WITH_CONCERNS at fe84ec7 (agent aca86a1bcb85709b4, review BASE c151296)
Ruling: accept Executor.run → Promise<boolean>, OwnChanges.mark returning a release function, LocalIntent.peek() for the spike log, and the single-line sentence-case lint disable for the proper noun "Finder" — all serve the brief's intent — cost if wrong: caught in review
Ruling: onRecheck signature becomes (pendingRemoved: string[]) => void, called once per settle window — one rescan per window instead of one per path — to be applied in Task 8's fix round or Task 10
Task 8: review Needs fixes — I1 onRecheck signature ruling not applied (sent after dispatch). Reviewer ⚠️: reaction may race Obsidian's link updater when a PDF is renamed in-app (possible corrupted note text).
Ruling: treat the link-updater race as Important and fix now — wrap fileManager.renameFile for in-flight tracking and await LocalIntent.whenIdle() before reacting — unverifiable here, but the downside is corrupted user text — cost if wrong: a short delay before following; one more instance-level wrap whose effectiveness the checklist must confirm
Task 8: fix round 1/5 dispatched to aca86a1bcb85709b4 (FIX_BASE fe84ec7): onRecheck string[], whenIdle, queue hardening, unloaded flag, wrap mark release, pure pieces to core with tests, folder checklist cases
Task 8: fix round 1 committed b9b180d; controller re-ran checks; re-review dispatching
Task 8: re-review of fix round 1 dispatched (agent a03d4d2440cadce53, opus)
Task 10: implementer running concurrently (agent a9c5c1d830b996f41, model opus, BASE b9b180d); told not to modify watcher/execute/local-intent or existing core files
Ruling: AttentionStore.refresh takes string[] (matches Watcher.onRecheck) — supersedes the brief's string|null
Task 8: fix round 1/5 (7 addressed, 0 original open; commits fe84ec7..b9b180d). Re-review raised 4 new Minors.
Ruling: fix round 2 for Task 8 will apply — cap whenIdle wait at 10 s then proceed (unbounded wait can silently stall following for the session); correct the checklist console check (monkey-around wrapper prints `current.apply(this, args)`, not next.call); add checklist assumptions (create fires before vault.create resolves; rename with "Automatically update internal links" off; Templater move-back rename); fix overstated unload comment. HELD until Task 10 commits, because both edit docs/manual-test-checklist.md.
Task 10: implementer DONE_WITH_CONCERNS at c96deae (agent a9c5c1d830b996f41). Concerns = disclosed deviations (singular wording, one lint suppression, bulkCounts(), delayed second refresh, button labels) — accepted pending review.
Task 8: fix round 2/5 dispatching to aca86a1bcb85709b4 (FIX_BASE c96deae, scoped to watcher/local-intent/execute/checklist)
Task 8: fix round 2 committed 8686a4e; re-review dispatching (sonnet)
Task 8: fix round 2/5 (4 addressed, 0 open; commits c96deae..8686a4e)
Task 8: minor (deferred): while a wrapped call is stuck, each queued event waits the full 10 s; wait test lacks timer-count assertion after cap; Templater move-back rename enters the queue as a local rename (expected harmless); wrap own-mark release relies on create firing before vault.create resolves (checklist)
Task 8: complete (commits c151296..8686a4e excluding c96deae, review clean after 2 fix rounds)
Task 10: review Needs fixes — I1 fixes can run after unload (queued task or modal left open)
Ruling: raise the reviewer's "note-removed entry lingers while cache lags, delete-pdf could trash a PDF whose note exists" to Important (I2) — it trashes a file — fix by checking the vault file list directly before delete-pdf — cost if wrong: one extra refusal message in a rare window
Ruling: in bulk runs a stale item (Executor returns false) is skipped, not a stop; only a throw stops — matches intent of the amendment
Task 10: fix round 1/5 dispatched to a9c5c1d830b996f41 (FIX_BASE 8686a4e for its files): unloaded guards + close modals, delete-pdf sibling-note check, running state, finally in bulk loops, Checking… state, visible no-candidates line, checklist
Task 10: minor (deferred): classify re-run per item in refresh and bulk loops (O(items × vault))
Task 10: fix round 1 committed c596e10; re-review dispatching (sonnet). Task 11 dispatching concurrently (sonnet, BASE c596e10).
Task 10: fix round 1/5 (8 addressed, 0 open; commits 8686a4e..c596e10)
Task 10: minor (deferred): if every scan throws the modal stays on "Checking…" (show "Could not check…" when the opening refresh settles unscanned); modal opened after unload registers a listener on a closed modal; classify per item
Task 10: complete (commits b9b180d..c596e10 excluding 8686a4e, review clean after 1 fix round)
Task 11: implementer running (agent ad67cd17bfca73c85, sonnet, BASE c596e10)
Task 11: implementer DONE_WITH_CONCERNS at 95b68cd (Executor gained run(actions,{quiet}); 20 notices on a 20-PDF drop). Review dispatching (sonnet). Task 12 dispatching concurrently (sonnet, BASE 95b68cd).
Task 11: review dispatched (agent acd5e055bc5201110, opus)
Task 12: implementer running (agent a11abcbd1621f1b04, sonnet, BASE 95b68cd)
Ruling (Task 12): copy the PDF before the note — a failure then leaves an unwrapped PDF rather than a note claiming the original's PDF — supersedes the brief's note-first order — cost if wrong: none
Task 12: implementer DONE_WITH_CONCERNS at 7278f04 (concerns = unverified at runtime; disclosed choices). Review dispatching (sonnet).
Task 12: review Needs fixes — I1 partial-failure Notice can name a pre-existing file as "left behind… you can delete it"
Task 12: fix round 1/5 dispatched to a11abcbd1621f1b04 (FIX_BASE 7278f04): track which copies were made (3 separate runs), pure message function with tests, notices for silent outcomes, onDone → store.refresh
Task 12: minor (deferred): oldTargets includes the bare base name, so `![[S]]` (which Obsidian resolves to a note first) is rewritten to a PDF embed — inherited from the original plugin's behaviour; review whether base-name rewriting should be limited to the wrap step
Task 11: review Needs fixes — I1 failure de-duplication ineffective (messages name the file); I2 equal settle on both devices cancels out, near-zero cross-device protection
Ruling (I1): replace per-message de-duplication and per-success notices with a per-pass summary (≤3 successes individually, else "Wrapped n PDFs"; failures summarised with the first problem) — supersedes the brief's "Notice per wrap" — the brief's own purpose was no notice storm — cost if wrong: wording only
Ruling (I2): settle depends on origin — in-app 2000 ms; outside 15000 ms + random 0–15000 ms jitter per PDF; LocalIntent also wraps Vault.create/createBinary/copy so in-app drops read as local — spec says the settle is what prevents double wrapping — cost if wrong: Finder-saved PDFs wait up to 30 s; duplicates still possible when both devices see a PDF simultaneously (per-device switch remains the remedy)
Task 11: fix round 1/5 dispatched to ad67cd17bfca73c85 (FIX_BASE 7278f04 for its files). Also: rename-into-place arrivals, drain-failure notice, no notices after unload, quiet limited to wrap, refresh per wrap, 60 s hung-wrap warning
Task 11: minor (deferred): one O(vault) snapshot per wrap; a hung wrap stalls the auto-wrap queue (warning only)
Task 12: fix round 1 committed 6afdfa5; re-review dispatching (sonnet)
Task 12: fix round 1/5 (3 addressed, 0 open; commits 7278f04..6afdfa5)
Task 12: minor (deferred): onDone not called on refusal paths (harmless); "Try again" notice sits oddly beside the leftover notice; no notice if the new note vanished before opening; in-flight guard keyed by note path only
Task 12: complete (commits 95b68cd..6afdfa5, review clean after 1 fix round)
Task 11: fix round 1 committed cd6611f; controller re-ran checks; re-review dispatching (opus). Task 13 dispatching concurrently (sonnet, BASE cd6611f).
Task 11: re-review of fix round 1 dispatched (agent a0ace970fe7d96a37, opus) — asked specifically whether the new create/copy LocalIntent marks can make a later outside rename/delete read as local
Task 13: implementer running (agent ae5b14e0ca76df587, sonnet, BASE cd6611f)
Task 13: implementer DONE_WITH_CONCERNS at d2f2270 (Executor gained optional afterRun callback → refreshSoon; accepted pending review). Review dispatching (sonnet).
Task 11: fix round 1/5 (8 addressed, 0 original open; commits 6afdfa5..cd6611f). Re-review Clean with 5 Minors.
Ruling: fix the folder-copy mark now (round 2) although rated Minor — it is a path to trashing a PDF on a non-local delete — cost: one small round
Task 11: fix round 2/5 dispatched to ad67cd17bfca73c85 (FIX_BASE d2f2270 for its files): no marks for folder copies, checklist expected wait, doubled full stop, watcher comment
Task 11: minor (deferred): refusal→skipped mapping untested (Obsidian layer); cross-device duplicate still likely (~25% at 2 s note-sync lag) when both devices see an outside PDF at once — design limit, per-device switch is the remedy; whenIdle now also waits on other plugins' creates (capped 10 s)
Task 13: review dispatched (agent a0d7c9bafe26aeb70, sonnet)
Task 13: review Needs fixes — I1 uncoalesced afterRun→refresh: bulk run of N queues N full rescans after the run and none during it
Ruling: toggle rebuilding from the cached classification (not via store.refresh) is accepted — no scan needed, same classification path
Task 13: fix round 1/5 dispatched to ae5b14e0ca76df587 (FIX_BASE d2f2270): coalesce refreshSoon, per-item rescan+notify inside store bulk loop, suppress afterRun for store-initiated runs, guard timer callback and handleWrapPdf finally, afterRun tests, sheet-removed assertion
Task 11: fix round 2 committed 977d0fb; re-review dispatching (sonnet)
Task 13: fix round 1 committed f2a3fc6; controller re-ran checks; re-review dispatching (sonnet)
Task 11: fix round 2/5 (4 addressed, 0 open; commits d2f2270..977d0fb scoped)
Task 11: minor (deferred): stoppedMessage strips only full stops; no checklist item for copying a folder that contains a wrapped pair; watcher comment wording
Task 11: complete (commits c596e10..977d0fb scoped, review clean after 2 fix rounds)
Task 14: dispatching (sonnet, BASE f2a3fc6), concurrent with Task 13 re-review
Task 13: re-review of fix round 1 dispatched (agent ab8bab314a1df3947, sonnet)
Task 14: implementer running (agent a71dcf04f6ff79e6b, sonnet, BASE f2a3fc6)
Ruling (Task 14): spike commands are removed from the plugin as planned; spike 2 stays available by building commit f2a3fc6, noted in the spike checklist — spec rev 5 says spike 2 "remains available as an optional diagnostic" — cost if wrong: owner must build an older commit to run it
Task 13: fix round 1/5 (5 addressed, 0 open; commits 977d0fb..f2a3fc6)
Task 13: minor (deferred): redundant final scan in a bulk run and ~2N+1 snapshots for N items; no follow-up refresh after a failed/stale first bulk item (guarded by done > 0); direct store.refresh() calls outside the scheduler (auto-wrap callback, duplicate); Executor's skipAfterRun branch and store bulk changes untested (Obsidian layer)
Task 13: complete (commits cd6611f..f2a3fc6 excluding 977d0fb, review clean after 1 fix round)
Task 14: implementer DONE_WITH_CONCERNS at a0735bc. Concern on 3000-row wording resolved: owner confirmed 3,000 rows hidden once creation finished. Review dispatching (sonnet).
Task 14: review Needs fixes — README states unverified behaviour as guarantees ("never acts/deletes" for outside changes; sync never followed), claims "no explorer internals" though styling relies on undocumented row markup, checklist quotes a label ("Unwrapped") the UI does not show
Ruling: state line for a pending PDF becomes "Its note was deleted; the PDF was kept" — the old "removed outside Obsidian" is false when delete-following is switched off and the user deletes in-app — supersedes the plan's text — cost if wrong: wording only
Task 14: fix round 1/5 dispatched to a71dcf04f6ff79e6b (FIX_BASE a0735bc)
Task 14: fix round 1 committed 5671b71; re-review dispatched (sonnet). Final whole-branch review dispatched (opus) on aa377be..5671b71.
Task 14: fix round 1/5 (11 addressed). Re-review found remaining unhedged README sentences outside the fix diff: lines 7, 153, 160 (guarantees resting on unverified detection), 114 ("never deleted by the plugin" vs the Delete fix), 46, 94 ("note removed" wording); CLAUDE.md:74 vs :69 (try/catch claim), CLAUDE.md:48 and comments still say "removed outside Obsidian"; auto-wrap notice says "Unwrapped PDFs" vs list label "Not wrapped"
Ruling: these doc sentences are carried into the single final fix wave rather than a second Task 14 round — one fixer, one re-review — cost if wrong: none, they are tracked here
Task 14: complete pending final fix wave (commits f2a3fc6..5671b71)
FINAL REVIEW (opus, aa377be..5671b71): no Critical. 5 Important: I1 Wrap all vs auto-wrap/manual wrap collisions stop the run; I2 frontmatter-only changes never refresh list/explorer, marker setting applies per keystroke; I3 auto-wrap pass O(P²·N) + 2 rescans per wrap; I4 followed delete can trash a PDF other notes embed; I5 checklist has a wrong expected message and an impossible file name. "Ready with fixes."
Ruling (final I4): before following a delete, if any other note links to or embeds the PDF, keep it and list it — the spec is silent, but trashing an embedded PDF is the anti-goal — cost if wrong: a PDF kept and listed that the user wanted gone (one click)
Ruling (final I1): in bulk wraps a WrapRefusal is a skip, not a stop; unwrapped PDFs with a same-name unclaimed note beside them are not listed as "Not wrapped" (they cannot be wrapped; such legacy hand-wrapped pairs need the owner's migration) — cost if wrong: those PDFs are invisible to the list
Ruling: triage accepted as given by the final reviewer; "should fix" items go into the single fix wave; the broad consolidation of destination-free helpers is logged, not done
Ruling: Task 11 create/copy LocalIntent wrapping stays; README gains the caveat that sync plugins writing through the file API make synced PDFs look local
FINAL FIX WAVE: findings in final-findings.md; dispatching ONE fixer (opus), FIX_BASE 5671b71
Residual (logged, not fixed): seven "is destination free / sibling exists" variants; partnerDestination/ownExtension duplicated with different conventions; PDF rename can move the note of a not-yet-healthy pair; cross-device duplicate wraps (design limit); attachments stored beside notes + auto-wrap on = every pasted PDF treated as a document
FINAL FIX WAVE: committed 32981f0..ff778cd (6 commits), DONE_WITH_CONCERNS (F4 depends on metadata cache having indexed the other note's link; package.json description left at 1.0 wording). Controller re-ran checks. Single scoped re-review dispatching (opus).
FINAL FIX WAVE re-review (opus): all of F1–F5 and items 1–23 ADDRESSED; nothing on the do-not-do list done; no Critical. Residual findings from the fix wave itself:
Ruling (breaker, parked): R1 — with Templater, a template that errors or whose prompt is cancelled now reports "Templater created the note somewhere else…" although no note exists, and the checklist line for a throwing template still expects the old fallback note — parked for the owner: no second fix wave; not a safety issue (nothing is deleted or overwritten) — cost if left: a misleading message in a common Templater case and one wrong checklist expectation
Ruling (breaker, parked): R2 — rescan's Wrap-all count re-checks every "Not wrapped" item against every note (O(U·N)) once per wrap during a long automatic-wrapping pass, reintroducing stutter for large bulk arrivals — parked for the owner — cost if left: slow UI while hundreds of PDFs are auto-wrapped in a large vault
Ruling (breaker, parked): R3 — keep-if-linked on delete depends on Obsidian's link index already showing the other note's link; a merge that writes the link and deletes the note in quick succession may still trash the PDF — pre-accepted residual; cheap narrowing exists (also check recently modified notes' text) — cost if left: the Note composer merge case may still lose the PDF to the trash
Parked minors: "Wrap all" can stay visible and report 0 for a PDF whose name cannot be linked; marker field commits a partial name if focus leaves mid-word; README delete row states the link check as a guarantee; equivalence test for shouldAutoWrap is circular
STATE: all 14 tasks complete; final review done; one fix wave done; residuals R1–R3 parked for owner. Head ff778cd. 265 unit tests, build, lint pass. Nothing has been run in Obsidian except the spike's explorer hiding.
Owner bug report: Obsidian's built-in copy ('Duplicate') copies only the note. Spec rev 6: in-app copy of a wrapped note copies the PDF too. Task 15 brief written; dispatching implementer (opus).
Owner decision 2026-11-15: "go ahead with all three" — fix the parked residuals R1 (Templater message), R2 (Wrap-all count cost), R3 (keep-if-linked window). Brief: task-16-brief.md (also the four parked minors). To be dispatched after Task 15 commits (both touch watcher.ts, README, checklist).
Task 15: implementer running (agent ab5c4d4263f9c1d50, opus, BASE e2a2d1e)
Task 15: implementer DONE_WITH_CONCERNS at 635b033 (deviation: pending entry consumed when the re-run executes, to avoid a double notice). Review dispatching (opus). Task 16 dispatching concurrently (opus, BASE 635b033).
Task 15: review Needs fixes — I1 README escape-hatch section no longer true: the in-app copy is a new automatic action on the same unverified detection and neither setting stops it; second-device check missing. Minors: pending entry survives delete/rename of its path; folder marks make creates read local; CLAUDE.md wrapping section stale; inert isFree exemption; one unhedged README sentence; spurious notice if the user runs the Extra-claim fix in the window.
Ruling: gate the in-app copy by the existing followRenames setting ("Rename and move the PDF with its note") and extend that setting's description to mention copies — gives the user an off switch on the same detection — supersedes the brief's "no new setting / not gated" — cost if wrong: turning off rename-following also turns off copy-following
Task 15: fix round 1 HELD until Task 16 commits (both edit watcher.ts, README, checklist).
Task 16: implementer DONE_WITH_CONCERNS at a2a1c67 (4 commits fa5cf38..a2a1c67). Controller re-ran checks. Review dispatching (opus). Task 15 fix round 1 dispatching to ab5c4d4263f9c1d50 (FIX_BASE a2a1c67 for its files).
Task 15: fix round 1 committed cceee91; controller re-ran checks; re-review dispatching (sonnet)
Task 15: fix round 1/5 (6 addressed, 0 open; commits a2a1c67..cceee91)
Task 15: minor (deferred): relies on Obsidian's copy action setting a file mark on the new note's own path (fails safe: copy is listed); README in-app copy row does not mention it depends on the rename setting; spurious "already exists" notice if the list's "Copy the PDF" fix is run in the short window before the automatic copy
Task 15: complete (commits e2a2d1e..cceee91 scoped, review clean after 1 fix round)
Task 16: review Needs fixes — I1: P1's recovery of "exactly one new note elsewhere" can move and mark an unrelated note (sync-delivered, created or renamed in another window during a Templater prompt). P2 and P3 sound.
Ruling: accept "Wrap all" stopping on a template-failed refusal — a failing template fails for every PDF, unlike per-PDF refusals which are skipped — cost if wrong: one stop instead of N identical failures
Ruling: automatic wrapping pauses for the session after a template-failed result until a later wrap succeeds — avoids a notice (and a Templater error or prompt) per PDF — cost if wrong: PDFs wait in the list until the user wraps one or fixes the template
Task 16: fix round 1/5 dispatched to acc779c7497dba226 (FIX_BASE cceee91): recover only a genuinely new note carrying the marker; link forms; skip text step when PDF gone; pause auto-wrap on template failure; Templater-throws-after-move; checklist
Task 16: minor (deferred): false "linked" for same-named PDFs in other folders or a recent note linking [[A]] (safe: PDF kept); candidate set rebuilt per delete event
Task 16: fix round 1 committed 186220d..9d43aec (4 commits); controller re-ran checks; re-review dispatching (opus)
Task 16: fix round 1/5 (M1–M5 addressed; I1 partly — plausibility rule still accepts a sync-delivered wrapped note whose PDF has not arrived, and a same-named PDF elsewhere). New minors: false "created somewhere else" claim; catch-path explanation; quadratic link scan; un-performable checklist step.
Ruling: remove the Templater recovery entirely — when Templater does not return a note, the plugin never moves, renames or edits any other note; it names the notes that appeared — each tightening of the guess had a hole, and the promise not to touch unrelated notes must hold by construction — cost if wrong: a template that moves its own note and returns nothing leaves the user one manual step (the common case, Templater returning the moved file, is still handled)
Task 16: fix round 2/5 dispatched to acc779c7497dba226 (FIX_BASE 9d43aec): remove recovery, outcomes a–e, linear link scan, checklist step, message audit, dead code
Task 16: fix round 2 committed 56af996..bd59e64 (3 commits); controller re-ran checks; re-review dispatching (opus)
Task 16: fix round 2/5 (R1–R5 addressed, 0 Important open; commits 9d43aec..bd59e64). Re-review: promise holds on every path in pdf-wrapper.ts; 6 Minors.
Ruling: run a third small round for minors 1–5 although none is Important — they touch the promise (a pre-existing note at the pair's path marked in a sub-second window), a possibly false message, a path-normalisation mismatch, and a link cap that leans towards "not linked" (the deleting side) — cost: one small round
Task 16: fix round 3/5 dispatched to acc779c7497dba226 (FIX_BASE bd59e64)
Task 16: fix round 3 committed bec09d4..215e058 (3 commits); controller re-ran checks; re-review dispatching (sonnet)
Task 16: fix round 3/5 (6 addressed, 0 open; commits bd59e64..215e058)
Task 16: minor (deferred): for non-NFC or nbsp file names the normalised note path is compared against raw vault paths in two places (sibling check, template-collision check); the "a note already existed" refusal is a silent skip in bulk/automatic mode so a stray note Templater created is not reported there; encodeURI can throw on a lone surrogate in a PDF name (caught by the Watcher → PDF kept); README says "a note at the expected place" where the code requires it to be new; no checklist step for the note-existed refusal; false "linked" for same-named PDFs elsewhere (safe)
Task 16: complete (commits 635b033..215e058 scoped, review clean after 3 fix rounds). Parked residuals R1, R2, R3 are resolved.
STATE: Tasks 1–16 complete. Head 215e058 + this log. 321 unit tests, build, lint pass. Nothing has been run in Obsidian except the spike's explorer hiding.
