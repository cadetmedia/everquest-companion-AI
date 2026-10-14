# faction-tab: what was asked for

Every request this feature has taken, newest at the bottom. Read it before changing the branch;
nothing listed here is removed or narrowed without the owner's word (RULES.md, rule 19). Rows
before 2026-10-10 were gathered that day from agent notes and the branch history.

| Date | Asked by | The ask | Status |
| --- | --- | --- | --- |
| 2026-09-05 | owner | A Factions tab from /outputfile faction, with live standings from the log. | built |
| 2026-09-05 | owner | The quests that move each faction, with filters (class, reward slot, wish list, coin). | built |
| 2026-09-05 | owner | Race unlocks shown as faction work. | built |
| 2026-09-05 | owner | Useful to other people too (friends' builds). | open |
| 2026-09-23 | owner | A race picker on the race-unlock hunt. | built |
| 2026-10-10 | owner | Scraper bug review: quest faction receipts the wiki words differently (`Your faction with [[X]] got better`, `standings`, a figure before `got`) and underscored faction names are read. | built (shows in quests.json once re-derived) |
| 2026-10-11 | owner | No lag (app-wide sweep): the Factions table re-derives and re-renders every row per keystroke (118 ms first keystroke, 65 ms stall at 156 rows). Memoize rows, defer the query, window before rows grow. | built (deriveRows once per dump, narrowDerived per keystroke; query deferred; FactionRow memoized; table windowed at 31 px; first keystroke 129 to 83-90 ms, no long task) |
| 2026-10-12 | owner | Each quest shows its whole faction receipt (every faction it moves, +N / -N), not only the expanded faction's. | built (raises then losses, signed; a loss no quest can win back says so on hover) |
| 2026-10-12 | owner | Mark factions as "don't care" (e.g. Riptide Goblins, Butcherblock Bandits); a quest whose only losses are on don't-care factions wears a check, and a toggle shows only those quests, to find easy faction raises with no useful loss. | built (marks per machine; click a faction on a receipt or the expanded row's toggle; "No loss I care about" switch; quests with no stated receipt drop out under it) |
| 2026-10-12 | owner | Show where a standing sits among the rungs; a legend of every rung's range at the top of the tab (indifferent, kindly, amiable, ally meant nothing). | built (legend strip of the nine rungs with ranges, equal width, captioned as classic-EQ thresholds; each row's bar is the same strip with a marker; hover names the next rung and the points to it) |
| 2026-10-13 | owner | A filter for recent faction changes: while working a faction, show only the factions the log keeps moving, e.g. in the last 30 minutes. | open |
