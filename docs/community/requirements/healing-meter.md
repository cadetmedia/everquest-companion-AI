# healing-meter: what was asked for

Every request the healing meter has taken, newest at the bottom. Read it before changing the
meter (the Combat tab's Healing view, the heal overlays, `engine/crates/fold/src/combat/healing.rs`
and the heal routing in `routing.rs`); nothing listed here is removed or narrowed without the
owner's word (RULES.md, rule 19).

| Date | Asked by | The ask | Status |
| --- | --- | --- | --- |
| 2026-10-26 | owner | Your heals on anyone other than yourself or your pet counted nowhere (about 340 `You healed <other>` lines, about 175k HP, on the 2026-10-17 log). Asked whether to count them on your healer row: "weird yeah fix the healing meter". They count on your own row (`you`), as your healing output, per spell lane, with overheal from the `(M)` form as for self-heals, and into the fight they land in. They are not healing you received. A heal you land on an engaged hostile stays enemy healing. | built (fix-heal-others, not yet tested in the app): on the 10-17 log your row gains 349 lines, 183,167 HP and 15,997 overheal across every zone stay; enemy healing, incoming healing and damage unchanged |
