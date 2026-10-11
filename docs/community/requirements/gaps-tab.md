# gaps-tab: what was asked for

Every request this feature has taken, newest at the bottom. Read it before changing the branch;
nothing listed here is removed or narrowed without the owner's word (RULES.md, rule 19).

| Date | Asked by | The ask | Status |
| --- | --- | --- | --- |
| 2026-10-11 | owner | A one-word (or short two-word) tab, a diagnostics or "missing from wiki" page: anything the log names (items dropped, looted, crafted, received; mobs; spells) that the app's wiki scrape has no record of. | built (engine `gaps` module; Gaps tab under Loot with Items/Mobs/Spells toggle and counts, search, table, Copy list; measured 29 items, 76 mobs, 34 spells unknown on the owner's log) |
| 2026-10-11 | owner | An audit of the scraped data as of today: what the log names that the scrape lacks, what the wiki has that ours lacks, and where ours differs from the wiki. | built (dev-time audit, zero wiki requests; `docs/community/audits/2026-10-11-data-gaps.md`) |
| 2026-10-11 | owner | Each Gaps row carries details: where it dropped (zone), who dropped it (the mob or source), and any other information the log gives about it. | built (per-row details in `gaps_details.rs`: zone; loot corpse or merchant and disposition for an item; drops, /con and killers for a mob; casters for a spell; the last three raw lines; a click opens them, Copy list includes them) |
| 2026-10-11 | owner | The details include the sale price the loot line printed, marked as NOT the real price: an item sold instantly on loot (to no vendor) sells at a discount. | built (`sales` and `paid` lists read off the raw lines, with copper totals; `free` is no price; the panel captions the sale as the discounted instant-sale price, the copy text names the list "sold on loot (discounted)") |
| 2026-10-11 | owner | From the instant-sale amount, show the real price: the game's Value (what a vendor pays, sale x 4/3) and the base price (sale x 1.4), measured on the owner's log (MEASURED.md). | built (`derivedPrices` in shared/gaps.ts: base = sale x 1.4 rounded, Value = base / 1.05 rounded; caption under the sales chips and a copy-text line; verified on the Gold Ring and Jade Earring screenshots) |
