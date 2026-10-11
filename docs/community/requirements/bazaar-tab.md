# bazaar-tab: what was asked for

Every request this feature has taken, newest at the bottom. Read it before changing the branch;
nothing listed here is removed or narrowed without the owner's word (RULES.md, rule 19). The
first rows were gathered on 2026-10-08 from the branch's commits and its BRANCHES.md row, which
record what was built but not always who asked; those say "owner" where the row does.

| Date | Asked by | The ask | Status |
| --- | --- | --- | --- |
| 2026-10-06 | owner | A tab of what trade chat asked and offered for items: per day, per item, per upgrade tier and per direction (selling, buying, trading). | built |
| 2026-10-06 | owner | Price-over-time charts; a 30-day trend on every row; medians with outliers left out. | built |
| 2026-10-06 | owner | A 7-day average and a predicted price, for asking and for offered. | built |
| 2026-10-06 | owner | The parser reads "paying 4k" after several items, a buy that opens with "paying", and a price before "for" and an item. | built |
| 2026-10-06 | owner | Every column of the list sorts by clicking its header. | built |
| 2026-10-07 | owner | The parser reads acronyms (CoF, RBB, FBSS, SSoY, BCG) where one item fits, glued item links, every tier of a listing, and numbers that count. | built |
| 2026-10-07 | Malkil | A watchlist of items to buy, to sell or only watch, with live alerts. | built, reshaped 2026-10-08 (below) |
| 2026-10-07 | Malkil | A buy alert at or under a price, or at or under a share of the item's 7-day median asking. | built (WTS box: "at or under", "% of 7-day median") |
| 2026-10-07 | Malkil | A sell alert at or over a price; a buyer naming no price still alerts. | built (WTB box: "at or over") |
| 2026-10-07 | owner | Wish-list and Popular filters; item icons on the rows. | built |
| 2026-10-07 | owner | "All tiers as one": one row per item, every tier read as +0. | built |
| 2026-10-07 | owner | Who said what: each day keeps its quotes (one per person per day, the latest 20), shown in the chart hover and an offers list. | built |
| 2026-10-07 | owner | Export the offers as CSV for Excel. | built |
| 2026-10-07 | owner | Hide No Drop / No Trade items. | built |
| 2026-10-07 | owner | A Price at slider (+0 to +10, from +4) for All tiers as one, estimates marked; an item never offered above +0 is not grown. | built |
| 2026-10-07 | owner | A days window; item names hover and open their Loot page; M for millions. | built |
| 2026-10-07 | owner | The picked item's panel folds away to give the list the screen. | built |
| 2026-10-07 | owner | Price floors All, 1P, 100P, 1K, 10K and 100K; platinum written as p. | built |
| 2026-10-08 | Malkil | WTB and WTS must not share one alert toggle. | built (two boxes) |
| 2026-10-08 | Malkil | Watching needs to make sense next to the alert controls (it had no toggle and no explanation). | built (a Watch switch; neither box = only watched) |
| 2026-10-08 | Malkil | The alert should follow the same structure as the Alerts tab. | built (the `bazaarWatch` app signal and a seeded "Bazaar watchlist match" alert) |
| 2026-10-08 | owner | Keep it very simple; an item can be watched for any reason. | built |
| 2026-10-08 | owner | WTS and WTB can both be on for the same item at the same time. | built |
| 2026-10-08 | owner | Use the existing alert framework, so its sound, voice, banner, cooldown and history apply. | built |
| 2026-10-08 | owner | Keep the price thresholds Malkil asked for (they were dropped by mistake in the simplification and restored the same evening). | built |
| 2026-10-11 | owner | Efficiency pass: the Bazaar's item facts (icon, no-trade) load in one batched call for the whole list, not one lookup per item. | built (shares item-hover-cards' `items:marks` store) |
| 2026-10-11 | owner | An "ignore outliers" rule: a price far above or below everyone else's (someone trying to fake the market price) is left out of the shown prices. | built (`BazaarQuery.ignoreOutliers`: a price more than four times above or below the item's median is left out once three prices exist; off, every price counts) |
| 2026-10-11 | owner | A toggle for ignoring outliers, with a tooltip explaining it. | built ("Ignore outliers" switch beside All tiers as one, on by default, with a tooltip saying what is left out and why) |
| 2026-10-11 | owner | A tradeskill filter: items for sale that belong to a tradeskill. | built (a Tradeskill select of the twelve names, spellings folded by `shared/tradeskills.ts`, read off the batched item marks) |
| 2026-10-11 | owner | A search by quest, to see the price of quest items. | built (a Quest box, part of a quest name in any case, suggestions from the listed items' quests; local quest sources included) |
| 2026-10-11 | owner | A second chart beside the price chart: the average price per 4-hour period of the day in the user's time zone, to see whether things sell cheaper at night when fewer people are on. | built (`shared/bazaarHours.ts` + `BazaarHoursChart.tsx`: six periods of the log's clock, which is the player's local time; mean, median, count per direction from the kept quotes; outlier switch applies; side by side with the price chart) |
