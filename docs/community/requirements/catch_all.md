# catch_all: what was asked for

Every request this branch has taken, newest at the bottom. Read it before changing the branch;
nothing listed here is removed or narrowed without the owner's word (RULES.md, rule 19). The
branch's earlier fixes are listed on its BRANCHES.md row; this list starts on 2026-10-10.

| Date | Asked by | The ask | Status |
| --- | --- | --- | --- |
| 2026-10-10 | owner | Running an older installer over a newer install asks first ("are you sure you want to replace the newer version?") instead of silently rolling the app back. | built (customInit, build/installer.nsh) |
| 2026-10-10 | owner | Scraper bug review: a weapon's `Bane DMG` line no longer overwrites its DMG (Greenmist read 6 for 18). | built (fix 35) |
| 2026-10-11 | owner | No lag or choppy freezes anywhere in the app: find every surface that behaves like the Bazaar search did and fix it the same way (measure in a real renderer first; memoized rows, windowed lists). Fixes land on the branch that owns each surface. | asked |
