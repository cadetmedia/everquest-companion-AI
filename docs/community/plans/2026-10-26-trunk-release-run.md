# The trunk switch and the release run (2026-10-26) — where it stopped

The owner's 15-step list (2026-10-26), stopped after step 5 for time ("we don't have time for all
that. Notate where we are and finish the current step"). Resume from "Next" below.

## Done

1. Every branch merged into `main_community` (all recipe branches were level; `fix-media-devices`
   is the upstream-PR copy of a fix `main_community` already has; the `log-archive-*` branches had
   nothing outside it).
2. `main_community` is the GitHub default branch (it already was).
3. All 70 other local branches carry a `RETIRED.md` commit (not merged, not yet pushed).
4. Rules, notes, skills and the owner's agent memory rewritten for the trunk model
   (`RULES.md`, `CLAUDE.md`, `BRANCHES.md`, `WORKFLOW.md`, `BRANCH_NOTES.md`, `DATA_REFRESH.md`,
   `RELEASING.md`, the community-release skill, `publish-release.sh`).
5. Optimization pass 1 (performance review, `../audits/2026-10-20-performance-review.md`, "Done
   2026-10-26"): main-process polling and the map watch, renderer tab caches and lazy overlays,
   the gaps snapshot halved, the engine read path.

Also merged the same night, before the switch: respawn times for the wiki from the player's kills
(the Respawns Gaps domain), the log-archive carry-over spot, the capture re-check fixes, and the
2026-10-25 delta.

## Stopped mid-step (resume here first)

- **perf-engine** (finding #3 and the engine's idle nap) was stopped by the owner's word mid-work.
  Branch `perf-engine`, one commit `57846dbda` ("Engine read path: keep the last module.snapshot
  answer per module until its cursor moves"), NOT merged. Its worktree,
  `%TEMP%\claude\c--git-everquest-companion\6f89175f-1664-43a9-8e4c-033060b7c1e3\scratchpad\wt-perf-engine`,
  holds uncommitted edits to `engine/crates/engined/tests/module_snapshot.rs` and
  `engine/crates/protocol-codegen/tests/staleness.rs`, and was writing `nap.rs` (the quiet-log nap
  back-off, unfinished). Its `node_modules` junction is unlinked; its `engine/target` (a full Rust
  build) is still there: delete it once the work is merged. To resume: review the commit and the
  uncommitted edits, finish or drop the nap back-off, gate (`cargo test --workspace`, clippy, the
  factoring ratchet, the npm gate), merge into `main_community`, measure and note it in the
  performance review.
- **The merged trunk has not been gated** since perf-main, perf-renderer and perf-gaps-slim were
  merged (each was gated alone; the merges were clean). Run the full gate on `main_community` first.
- **Nothing is pushed.** `main_community` is 60+ commits ahead of `origin/main_community`, and the 70
  retired branches' `RETIRED.md` commits are local only. Push with the release, or sooner on the
  owner's word.

## Next (owner's list, steps 7-15)

1. Code review of everything merged since `b614e946` (the last build the owner ran before
   2026-10-25 evening).
2. A second optimization pass (the review's open items: #1 the always-watched big modules, #3's
   concurrent dispatch if perf-engine left it, #6 derivations into the engine, #8 data weight).
3. A bug pass, then a review and QA pass.
4. The EOZ GitHub pack compare and a delta scrape (DATA_REFRESH.md).
5. A full regression test (npm gate, `cargo test --workspace`, a production build, the app run on
   the owner's log), then fix what it finds.
6. A final review by the lead agent (owner, 2026-10-26: "Do a final review yourself also before
   release after the sub agents do their final review").
7. The release: RELEASING.md and the community-release skill, on the owner's word (given in the
   list). Push `main_community` and the retired branches with it.

## Open questions for the owner

- The `gearOwnership` cache would change the visible per-window "read at" time (owner asked; the
  Plan tab's first visit still runs its pool twice without it).
- Respawns: should a time also need a share of the gaps to agree (a glyphed guard: 3:33 from 5 of
  34)?
- Raid Targets now shows an empty roster for a moment during a character switch instead of the
  previous character's statuses (perf-renderer).
- The old worktrees under `.claude/worktrees/` (junctions already unlinked) were not removed: the
  bulk removal was refused by the permission check. Remove them one by one, or by the owner.
