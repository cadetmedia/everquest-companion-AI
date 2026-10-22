# meter-pet-split: what was asked for

Every request this branch has taken, newest at the bottom. Read it before changing the branch;
nothing listed here is removed or narrowed without the owner's word (RULES.md, rule 19).
The plan is `plans/2026-10-20-meter-pet-split.md`.

| Date | Asked by | The ask | Status |
| --- | --- | --- | --- |
| 2026-10-20 | Malkil (tester, Discord) | A third pet layout in the damage meter: the player and their pet on the same row, each with its own name and `dps · total`, and a total cell for the pair ("so you can keep track of both together as well as the total"). Two lines tall is fine. "The third section should be static, but the other two columns should dynamically adjust in width." | built (meter-pet-split, not yet tested in the app); the side-by-side shape was replaced by the stacked pair, row 2026-10-21 |
| 2026-10-20 | Malkil | On both the overlay and the Combat tab ("Both, if possible"). | built (meter-pet-split, not yet tested in the app) |
| 2026-10-20 | Malkil | Party members' pets too, "if it knows the pet's master". | built (meter-pet-split, not yet tested in the app): a group-mate pet pairs once the engine has bound it (/pet who leader, or a charm) |
| 2026-10-20 | owner | Options 1 (pet inside your bar) and 2 (pet its own bar) stay; this is a third choice beside them. The total cell need not be purple: any fitting colour. | built (meter-pet-split, not yet tested in the app): Preferences > Combat "Where your pet’s damage shows"; total box violet #4a4366 |
| 2026-10-20 | Malkil, relayed by owner | On the mock: a row is cut short at its share of the top row ("C is closest"). | superseded by the stacked pair (2026-10-21): every bar its own true length instead |
| 2026-10-20 | Malkil, relayed by owner | "If a player doesn't have a pet or if the pet doesn't have a master, it can be displayed on a single height line instead of a double height line." Owner: "The double height line is just to accommodate the extra text." | built (meter-pet-split, not yet tested in the app) |
| 2026-10-20 | Malkil, relayed by owner | A pet beside its owner does not say "pet" ("we already know it's a pet when it's on the same line as a player"): its own name only, so a group-mate's pet reads `Zobaner`, not `Pet (Zobaner) - Bob`. | built (meter-pet-split, not yet tested in the app) |
| 2026-10-21 | Malkil, relayed by owner | The pair stacked, not side by side: "Display master and pet on separate lines, but group them together": master's bar in one colour on line 1, pet's in another on line 2, and "a shared double height bar they occupy in a third colour", with the pair's total (dps, damage) in the fixed cell on the right. Owner, the problem it solves: a pair with almost no dps must not look bigger than the rows above it because of the width its text needs. | built (meter-pet-split, not yet tested in the app) |
| 2026-10-21 | Malkil, relayed by owner | "Even the single height bars should have the box on the right side like the double height bars do for consistent formatting." | built (meter-pet-split, not yet tested in the app) |
| 2026-10-21 | owner | Option 3 is opt-in: "this is a 3rd option, so users will have to CHOOSE this option". | built (meter-pet-split, not yet tested in the app): default stays Inside your bar; an absent key reads the old switch |
| 2026-10-21 | Malkil, relayed by owner | He liked the grouped layout; "The only thing that I would change is the total dps/damage bar is much wider than it needs to be". | building (meter-pet-split) |
| 2026-10-21 | owner | Nothing more changes on the damage meters (the Overview card included, which stays as built) until testers give feedback. | decided |
