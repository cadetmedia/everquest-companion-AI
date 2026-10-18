# slayer-tab: what was asked for

Every request this feature has taken, newest at the bottom. Read it before changing the branch;
nothing listed here is removed or narrowed without the owner's word (RULES.md, rule 19). Rows
before 2026-10-10 were gathered that day from agent notes and the branch history.

| Date | Asked by | The ask | Status |
| --- | --- | --- | --- |
| 2026-09-28 | owner | Where to go to finish Slayer achievements, several picked together, shaded on the map. | built |
| 2026-09-29 | owner | Redesign it for any and all achievements, grouped like the game window. | built (Achievements tab) |
| 2026-10-05 | owner | No faction hits switch, Zone I'm in filter, zone sort, Closest first = least left. | built |
| 2026-10-10 | owner | Scraper bug review: a mob whose wiki faction line is negative under an `oppfac` span, or names the faction without a link, counts as a faction hit. | built (shows in mobFactions.json once re-derived) |
| 2026-10-11 | owner | A Plane of Sky "Primary Class Unlock" achievement must not count its "will autocomplete if you confirm" or "can be bypassed with a token" lines as requirements (a Bard read 5 of 8 with six rewards). | built |
| 2026-10-11 | owner | No lag (app-wide sweep): the Achievements list mounts the whole dump (501 rows: 383 ms open, 293 ms first keystroke, 326 ms clear, 274 ms stalls). Memoize rows, window the list, defer the query. | built (rows memoized, query deferred, one flat windowed list with 25 px headings and 55 px rows, open rows measured; warm open 292 to 64 ms, first keystroke 235 to 59 ms, clear 221 to 87 ms, no long task) |
| 2026-10-12 | owner | Completed achievements must still be clickable to see which zones their mobs are in. | built (a finished Slayer kill line keeps its checkbox and zone count under its open-time id; picking it ranks its zones; the unpicked ranking stays open counters only) |
| 2026-10-12 | owner | A way to find and clear checked achievements without scrolling 100 rows. | built (Show: Checked (N) lists only rows with a checked counter, open or complete, not stored; the button reads Clear checked (N)) |
| 2026-10-17 | owner | Out-of-era wiki content is never offered as if it were in the game, across all wiki data, not only items (A Hatebone Drake, a `{{FearHateRevamp Era}}` mob, was listed under Achievements Where to go): every wiki record keeps its page's era banner, and every list applies the app's one era rule (recommending lists hide out-of-era entries, lookups tag them). | asked |
| 2026-10-17 | owner | The log outranks the wiki banner: nothing the player's log shows they looted, killed, considered, cast or entered may be hidden or marked out of era ("I've seen it drop so it can't be out of era"); measured against the whole log before the era work merges. | asked |
