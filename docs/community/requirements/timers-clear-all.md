# timers-clear-all: what was asked for

Every request this feature has taken, newest at the bottom. Read it before changing the branch;
nothing listed here is removed or narrowed without the owner's word (RULES.md, rule 19).

| Date | Asked by | The ask | Status |
| --- | --- | --- | --- |
| 2026-10-17 | owner | The Timers tab needs a Clear all, for the zone section and for the All zones section. | built (a Clear all button by the scope switch clears the clocks in scope) |
| 2026-10-17 | owner | Clear all asks first, with a count of the clocks it clears (owner chose this over one click). | built ("Clear all N clocks in <zone>?" with Cancel) |
| 2026-10-17 | owner | A respawn time typed in by hand for a mob is not lost when its clock is unwatched or cleared: watching it again brings the typed time back. Single Unwatch keeps it too. | built (`keptCustom` in the respawn prefs; every unwatch path, and a watch from the Maps tab through respawn:set, restores it) |
| 2026-10-23 | owner | Clicking a mob's name on the Timers tab opens that mob's page; clicking its zone opens the Maps tab on that zone. | built (`timerLinks.tsx`; Running and Recently killed both; a zone the app has no map for, such as Lake Nerius, stays plain text, as zone links elsewhere do) |
