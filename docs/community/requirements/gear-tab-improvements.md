# gear-tab-improvements: what was asked for

Every request this feature has taken, newest at the bottom. Read it before changing the branch;
nothing listed here is removed or narrowed without the owner's word (RULES.md, rule 19). Rows
before 2026-10-10 were gathered that day from agent notes and the branch history.

| Date | Asked by | The ask | Status |
| --- | --- | --- | --- |
| 2026-09-05 | owner | The compare card compares base against base and says what tier the worn copy is. | built |
| 2026-09-13 | owner | The item screen gets the same +0 to +10 upgrade simulation as the Gear tab. | built |
| 2026-09-14 | owner | A Sky quest chip opens Plane of Sky > Quests with filters cleared; the reward item is linked beside it. | built |
| 2026-09-26 | owner | A zone filter on the Gear search page. | built (Zones picker) |
| 2026-10-11 | owner | Wherever an item shows a related quest (the drill-down's quest chip), the quest name links to its wiki page. | built (an eqlwiki.com link for a non-Sky use; a Sky use keeps opening the Sky tab) |
| 2026-10-11 | owner | No lag (app-wide sweep): the Gear tab's warm open blocks 116 ms (scale, filter and sort of 6,899 items on first paint). Cache the first derivation or defer the first paint. | built (derivation kept across tab switches in `lib/kept.ts`; the screenful mounts in a transition; warm open stall 103-116 ms to none) |
| 2026-10-28 | owner | Check the upgrade maths against the wiki's own item tier formulas (`Maergoth/EQLWiki` ItemLevelSlider rules rev 4), "but don't bow to their math as fact": a disagreement is settled by our own data. | built: three rules fixed on game windows (Bloodsoaked Gauntlets +1, Pyrosilk Robe +5, Windstriker +10): a primary stat over 10 is `floor(base + base * effective / 10)` with no inner rounding; AC, HP, Mana and End qualify the synthetic SV Void; a RANGE-slot bow gains Accuracy. Weight at whole tiers is exact decimal arithmetic since the same day (owner: "do it"): Windstriker +10 reads 0.4 from its page's 4.0 where the old float artifact said 0.5; every other screenshot at a tier where the two differ is at +0. Open: whether the regens qualify Void (no window yet). |
