# The trunk switch and the release run (2026-10-26)

The owner's 15-step list (2026-10-26). Steps 1-13 done the same day; step 14, the release, is held
by the owner ("no release today though FYI, just get all the work done"). Resume from "Next".

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

Later: "Do a final review yourself also before release after the sub agents do their final review";
"maybe we need to rerun the performance review after all changes to compare?".

How it was run: one subagent per independent area, each in its own worktree on a temporary branch
off `main_community`, told to commit there and not merge or push; the lead merged, gated the merged
trunk and removed the worktree and branch. Read-only reviewers and hunters reported findings with a
failure scenario; a separate agent fixed each area.

## Done

1-4. Branches merged and retired, trunk model written down (see git history of this file).
5. Optimization pass 1, then perf-engine (kept snapshot answers, the idle nap back-off): see
   `../audits/2026-10-20-performance-review.md`.
7. Code review of everything since `b614e946`: respawn learning (2 bugs, 5 risks), the perf pass
   (lazy overlays could drop the first toast / banner / con card), the rest (EOZ release check text,
   release skill wording). All fixed.
8. Performance re-measured (review, "Re-measured 2026-10-26") and pass 2 done (items 1, 2 short
   step, 3, 5; review, "Done 2026-10-26 (optimization pass 2)").
9. Bug pass, three read-only hunters: engine fold (DoT ticks from a dead caster merging fights,
   "My leader is" from a group member, player/pet deaths as kills), Gaps wiki text (6), log archive
   / alerts / buff timers (5). All fixed.
10. Independent review of the day's fixes: 8 TS and 5 engine findings, all fixed (one was a
    regression from step 9: catalog one-word mobs counted as player deaths).
11. EOZ compare and delta scrape: branch `delta-2026-10-26` (worktree `.claude/worktrees/delta-2026-10-26`,
    cache junctions in place), 235 wiki requests, items +4, spells +1, mobs +2; compare `--release`
    clean. NOT merged: two `plannerEraCorpus` reds from one wiki page (below).
12-13. Regression: see "Regression" below.

## Regression

On `main_community` after every merge of the day:

- Unit gate: typecheck, lint, 6,209 pass, only the 2 known reds; `cargo test --workspace` 1,110
  pass, 0 fail. Release engine rebuilt in the main clone.
- e2e (4 in parallel, then reds alone, then against `community-0.1.0-test.34`): 57/65 green, the 3
  TEST-build specs skipped. Flakes that pass alone: `engine-boots`, `engine-absent`,
  `alert-dialog-focus`. Red on test.34 too: `voice-alerts`, `maps` (known), `bosses-week` (reads the
  owner's real install, whose live log has no kills since archiving). Fixed specs: `con-card`
  (expects the 8 s default of 2026-10-23), `overview` (waits for the live label: combat is read
  once a second in a fight since pass 2).
- App check, production build, hidden, isolated userData, copies of the owner's log, archive and
  dumps with history on: every tab and all 15 overlay kinds render, no page or main errors; live
  meters exact (a 10-hit fight summed to 1442); Loot spans Aug 12 to Oct 26 through the archive.

## Next

1. **The delta merge:** done 2026-10-26 (after the owner's Robe of the Betrayed edit).
2. **The release, on the owner's word.** Before it: the community-release skill; the delta merged;
   a fresh compare + delta per RULES.md rule 10; `fix-media-devices`'s `RETIRED.md` commit pushed
   with the retired branches. Nothing is pushed yet: `main_community` and the retired branches'
   `RETIRED.md` commits are local only.
3. Performance, later passes: review items 4 (one engine connection), 6, 7, 8, item 2's M step,
   Factions renders, MUI Tooltip cost.

## Answered 2026-10-26 (after the run)

- Heals on others: counted on your own healing row (`route_heal` → `add_outgoing_heal`;
  requirements/healing-meter.md). 10-17 log: +183k HP over every stay, +170k in fights.
- Respawn cluster: the lowest agreeing cluster wins; a verdict under two minutes offers nothing for
  any name (trash shares names). requirements/gaps-tab.md.
- `{{Legends Era}}`: Robe of the Betrayed is the only page of ~22,000 cached that carries it.
- Pet heals on others: your bound pet's heal on a roster member (or a mate's creditably bound pet)
  books on the pet's row; anything less certain books nothing. 10-17 log: no line qualifies.
- Respawn words: a page whose respawn is words gets a "Check respawn" warning chip (79 of 552
  pages); Copy writes the kills' number and keeps the page's words in a wiki comment.
- Wiki traffic: the app reads the wiki only on a Gaps Copy click (requirements/wiki-traffic.md,
  wiki-usage/README.md lists the touch points). The GitHub icon pack still fetches (not the wiki).
- Delta merged after the owner's Robe of the Betrayed edit (+2 Necromancer spells in the re-read;
  the engine's per-tick rule now reads `HP` / `health` / `Increases`).
- Exaltations (Malkil via the owner): benefit filter, Current/Recommended view, locks
  (requirements/exaltation-clarity.md).

## Open questions for the owner

- **GitHub icon pack:** still fetches a missing item icon from the wiki's GitHub data pack (not
  eqlwiki.com; owner asked for it 2026-10-25). Keep or turn off?
- **Ally pets across zones:** a group mate's summoned pet now keeps its bind through a zone line
  (Gonekab +319k, Ganer +286k recovered on the 10-17 log); a charm bind still ends there.
- **Meter cadence:** combat meters now update once a second in a fight (was up to 4/s).
- From before: Raid Targets' empty roster during a character switch; `heal-fight`/`heal-overall`
  added to `CHARACTER_AWARE_OVERLAYS`; the Enynti wiki fix (`| respawn_time = 8:50`,
  https://eqlwiki.com/index.php?title=Enynti&action=edit); a glyphed guard's respawn from 5 of 34
  gaps.
