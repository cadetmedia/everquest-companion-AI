# scrape-delta-tool: what was asked for

Every request this branch has taken, newest at the bottom. Read it before changing the branch;
nothing listed here is removed or narrowed without the owner's word (RULES.md, rule 19). The
branch's earlier work is described on its BRANCHES.md row; this list starts on 2026-10-10.

| Date | Asked by | The ask | Status |
| --- | --- | --- | --- |
| 2026-10-10 | owner | Why did the delta scraper miss the wiki's 2026-09-03 rename of Healing Water, though it ran more than once since? Fix it, with every other scraper bug. | built |
| 2026-10-17 | owner | Duplication clean-up (DRY without going overboard): where whole functions or components are copies with the same behaviour, keep one (the more efficient one that loses no functionality) and use it everywhere; 1-3 identical lines are fine; nothing may change what a feature does. | reviewed (the delta modules mirror scrape-items on purpose; only the key-rule bug below changed) |
| 2026-10-17 | owner | A delta run must not delete the plain-name key of an `X (Item)` page (the full scrape files it under `X` too). | fixed (05272fb2) |
| 2026-10-18 | owner | The delta tool scrapes from the last scrape (the OLDEST stamp of the files it updates), takes `--since <date>` to re-cover a gap back to the last known-good point, refuses rather than skips when the wiki's change history does not reach that far, keeps the text it fetches, and can run slowly. | asked |
| 2026-10-18 | owner | After the full re-baseline, every future refresh is the changes-since delta only, and nothing is missed: the delta covers every wiki-derived file (today it folds items, mobs, spells and quests; respawns, Plane of Sky, bosses, classes and the era verdicts are not yet covered), keeps the text it fetches, and refuses when the wiki's change history no longer reaches the last scrape. | built (sources/deltaFollow.ts: after the folds, each other file the changes reach is refreshed by its own tool; boss portraits are hand-picked, so a changed boss page is named instead) |
| 2026-10-18 | owner | The delta tool's User-Agent names the fork (github.com/kaltinril/everquest-companion) as the contact. | asked |
| 2026-10-18 | owner | "the delta process should pull in ALL WIKI changes since the last timestamp, and correctly update our cache": every page the change feed names since the stamp reaches its cache (items, mobs, spells, quests, classes, Plane of Sky, bosses, era verdicts, redirects) and every wiki-derived file built from it. | built (File: changes read too, for bundled images; the mob cache gains new pages and drops gone ones; redirects to mobs fold into otherNames; not yet run against the wiki) |
