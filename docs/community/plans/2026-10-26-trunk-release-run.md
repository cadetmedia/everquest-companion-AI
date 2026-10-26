# The trunk switch and the release run (2026-10-26) — where it stopped

The owner's 15-step list (2026-10-26), stopped after step 5 for time ("we don't have time for all
that. Notate where we are and finish the current step"). Resume from "Next" below.

## The owner's list, verbatim

> 1. lets keep the old branches, merge everything into main_community. 2. make sure main community
> is the new primary branch. 3. Then once that is all done, update the old feature branches to
> indicate they retired. 4. Then update all information and rules in all branches and memory files
> so that this new break from original fork is the way forward 5. continue your optimizations now
> on the new primary main_community branch that we will use. 6. all work can still be done in
> temporary work-trees and/or branches 7. do a code review of everything once done 8. do another
> optimization pass 9. do a bug pass 10. do a review and qa pass 11. do a delta scrape of the wiki
> and latest github data from the wiki EOZ package cache to get our cache as up-to-date as we can
> 12. do a full regression test yourself 13. fix issues identified 14. if everythign is good, do a
> release by tagging and pushing up and all that jazz 15. when done let me know
>
> try to do as much with subagents so your context window doesn't get bloated more than it must

Later the same night: "Do a final review yourself also before release after the sub agents do their
final review"; "maybe we need to rerun the performance review after all changes to compare?"; then,
for time: "Notate where we are and finish the current step". Rough estimate given for steps 7-15:
4-6.5 hours (reviews and passes 30-45 min each, delta 15-20, regression 20-30, release 20-30).

How to run it: one subagent per independent area, each in its own scratch worktree on its own
temporary branch off `main_community` (node_modules junction; unlink it with
`(Get-Item <wt>\node_modules -Force).Delete()` before removing the folder), told to commit there and
not merge or push; the lead agent merges, gates the merged trunk and removes the worktree and branch.

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
  answer per module until its cursor moves"), then `38269abd9`, a WIP commit of the test edits the
  agent left uncommitted (`engine/crates/engined/tests/module_snapshot.rs`,
  `engine/crates/protocol-codegen/tests/staleness.rs`; unreviewed). NOT merged. The quiet-log nap
  back-off (`nap.rs`) was not started. Everything is on the branch; its old scratch worktree
  (`%TEMP%\claude\...\scratchpad\wt-perf-engine`, `engine/target` inside) is disposable. To resume:
  `git worktree add` a fresh tree for `perf-engine` (or reuse the old one if it still exists),
  review both commits, do or drop the nap back-off, gate (`cargo test --workspace`, clippy, the
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
2. Re-run the performance review once perf-engine is in (owner, 2026-10-26: "maybe we need to
   rerun the performance review after all changes to compare?"): repeat every number in the
   review's "Measured" section the same way (production build, hidden and isolated, copies of the
   owner's logs; tab switches incl. the owner's setup of 9 overlays), plus the bench scripts in
   `../audits/2026-10-26-perf-bench.md`, and write before/after into the review. Use the result to
   rank the second optimization pass.
3. A second optimization pass (the review's open items: #1 the always-watched big modules, #3's
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
- A wiki fix to offer the owner (it will show as a Respawns "Fix respawn" row once the app runs the
  new build): Enynti's page says `22 minutes`; 31 same-stay kills in Castle of Mistmoore 4 put its
  spawn point at 8:50. Edit link: https://eqlwiki.com/index.php?title=Enynti&action=edit, line
  `| respawn_time      = 8:50`.
- `heal-fight`/`heal-overall` were added to `CHARACTER_AWARE_OVERLAYS` (perf-renderer) without the
  owner's explicit answer to the earlier question; tell the owner.
- The old worktrees under `.claude/worktrees/` (junctions already unlinked) were not removed: the
  bulk removal was refused by the permission check. Remove them one by one, or by the owner.
