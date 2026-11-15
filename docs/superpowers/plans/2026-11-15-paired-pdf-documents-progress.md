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
Rough edge (spike build): 'rename a test pair' empty-list message does not name the Spike test folder.
