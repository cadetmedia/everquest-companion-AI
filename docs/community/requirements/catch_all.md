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
| 2026-10-12 | owner | Expanding then collapsing an achievement crashed the app (Maximum update depth exceeded, from the windowing hook). | built (fix 41) |
| 2026-10-13 | owner (found in QA) | The 2026-10-13 game patch inserted a column into spells_us.txt between fields 52 and 75: icon 75->76, resist adjustment 78->79, effect slots 172->173, and every later field the TS parser (spellsUsParse.ts) and the engine's Rust twins read is one off, so resist estimates, debuff and stacking reads are wrong on a patched client. Read both layouts (detect from the file). Three live-client tests are temporarily known reds until this lands; file upstream too (rule 20, owner's go). | open |
| 2026-10-16 | owner (bug hunt, 2026-10-16) | A resist ledger the engine could not read cleanly at attach (locked, torn, unparseable, newer version) was written over a minute later with only the folded character's buckets, losing every other character's. | built (fix 43: the engine writes the ledger only when it read cleanly, was missing, or was an older version it already discards) |
| 2026-10-16 | owner (bug hunt, 2026-10-16) | Re-saving an alert from the editor kept only the first `where` key, so a suggested "Root Rk. II resisted" became "any of your spells resisted". | built (fix 44: the keys the editor does not edit are kept and shown; changing the kind or trigger type, or clearing both boxes, drops them) |
| 2026-10-16 | owner (bug hunt, 2026-10-16) | Changing the default sound pack left alerts that fall back to it playing the old pack's cached sound. | built (fix 45) |
| 2026-10-16 | owner (bug hunt, 2026-10-16) | A module snapshot fetch that threw left the module stuck until a world change. | built (fix 46) |
| 2026-10-16 | owner (bug hunt, 2026-10-16) | Zoom and pan on a live fight's timeline snapped back to the whole encounter about once a second. | built (fix 47: re-fit only when the encounter changes) |
| 2026-10-16 | owner (bug hunt, 2026-10-16) | A stale voice rate or volume save reply could rewind the slider and be stored. | built (fix 48: only the newest write's reply is adopted) |
| 2026-10-16 | owner (bug hunt, 2026-10-16) | The toast, alert banner and con card switches in Preferences showed a stale state after the overlay was toggled from the title bar. | built (fix 49) |
| 2026-10-17 | owner | Duplication clean-up (DRY without going overboard): where whole functions or components are copies with the same behaviour, keep one (the more efficient one that loses no functionality) and use it everywhere; 1-3 identical lines are fine; nothing may change what a feature does. | asked |
