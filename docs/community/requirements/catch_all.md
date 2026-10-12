# catch_all: what was asked for

Every request this branch has taken, newest at the bottom. Read it before changing the branch;
nothing listed here is removed or narrowed without the owner's word (RULES.md, rule 19). The
branch's earlier fixes are listed on its BRANCHES.md row; this list starts on 2026-10-10.

| Date | Asked by | The ask | Status |
| --- | --- | --- | --- |
| 2026-10-10 | owner | Running an older installer over a newer install asks first ("are you sure you want to replace the newer version?") instead of silently rolling the app back. | built (customInit, build/installer.nsh) |
| 2026-10-10 | owner | Scraper bug review: a weapon's `Bane DMG` line no longer overwrites its DMG (Greenmist read 6 for 18). | built (fix 35) |
| 2026-10-11 | owner | No lag or choppy freezes anywhere in the app: find every surface that behaves like the Bazaar search did and fix it the same way (measure in a real renderer first; memoized rows, windowed lists). Fixes land on the branch that owns each surface. | built (a renderer sweep of every tab on 2026-10-11; Achievements on slayer-tab, Factions on faction-tab, Gaps on gaps-tab, Gear on gear-tab-improvements, Spellbook on spell-upgrades, the Sky tab and the Leveling search here as 39 and 40; the rest measured under the line) |
| 2026-10-11 | owner | No lag (app-wide sweep, creator surfaces): the Plane of Sky tab's open carries a 92 to 137 ms stall and a clear 166 ms at 40 rows (facet rebuild / page reset); the Leveling best-spells search is synchronous (105 ms echo). | built (fixes 39 and 40: the Sky page mounts its first screen then the rest in a transition, no task over 60 ms; the Leveling search deferred; the Sky clear stays at one 55 ms commit) |
