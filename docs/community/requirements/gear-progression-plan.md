# gear-progression-plan: what was asked for

Every request this feature has taken, newest at the bottom. Read it before changing the branch;
nothing listed here is removed or narrowed without the owner's word (RULES.md, rule 19). Rows
before 2026-10-10 were gathered that day from agent notes and the branch history.

| Date | Asked by | The ask | Status |
| --- | --- | --- | --- |
| 2026-09-04 | owner | Scoring leans toward DPS for dps focuses, with a slider to adjust toward survivability. | built (survivability dial, default 0.3) |
| 2026-09-05 | owner | For a 1H DPS focus, spells and mana barely matter; flat HP and resists count only toward survivability. | built (chunk-stat law) |
| 2026-09-05 | owner | The Recommended route includes quest rewards, not only drops. | built (quest lane) |
| 2026-09-05 | owner | An item only counts as owned if it is in the dump or melted into an exaltation, not because it was looted once. | built |
| 2026-09-05 | owner | Show held-but-not-worn items that beat what is worn. | built (equip advisory) |
| 2026-09-26 | owner | The route stops at level 50. | built (planHorizon.ts) |
| 2026-09-26 | owner | Ranged STR and ATK score nothing (rangers fire at melee range through an AA). | built |
| 2026-09-27 | owner | The equip advisory never suggests gear the character's classes cannot wear. | built |
| 2026-10-17 | owner | Out-of-era wiki content is never offered as if it were in the game, across all wiki data, not only items (A Hatebone Drake, a `{{FearHateRevamp Era}}` mob, was listed under Achievements Where to go): every wiki record keeps its page's era banner, and every list applies the app's one era rule (recommending lists hide out-of-era entries, lookups tag them). | built (zone level profiles and the mob level join leave out-of-era mobs off while the era chip is on) |
| 2026-10-17 | owner | The log outranks the wiki banner: nothing the player's log shows they looted, killed, considered, cast or entered may be hidden or marked out of era ("I've seen it drop so it can't be out of era"); measured against the whole log before the era work merges. | built (src/shared/metInLog.ts, fed by the engine's kills, loot, consider and progression; mobs, items and zones the log met are in era; measured on the whole log 2026-10-17: 2,327 mobs, 2,260 items, 143 zones met, none out of era) |
