# Copy wiki page for items: every fact the game gives (phase doc, 2026-10-20)

Owner ask, 2026-10-20: "any knowledge we get from the game that could go to the wiki should
[go there] right?" and, on forage: "the line in the logs says it was foraged, and we even display
that in the wiki gaps tab for the user so why can't we include the forage zone and information
automatically?" Also: "FACTION plays into SELL and PURCHASE price from vendors." Phases 1 to 4
built on `gaps-item-facts` (2026-10-21; phase 2's parser on `wiki-scraper-fixes`, its data on
`local-data-refresh`); phase 5 moved to the screenshot reader, phase 6 decided not built (owner,
2026-10-21). Rules
first: `docs/community/RULES.md`, then `agent/INDEX.md`, `agent/WIKI.md` (page conventions).
The requirement row is in `requirements/gaps-tab.md`; build on `gaps-tab`.

## Where it stands

- The item page is `itemPage()` in `src/shared/wikiPage.ts`, fed by `itemFacts()`. It writes
  `itemname`, `merchant_value`, an empty `statsblock` skeleton, `dropsfrom`, `soldby`, and the
  categories Vendor Sold, Player Crafted and the drop zones. Nothing else.
- The engine already reads the lines this plan needs: a forage files the row with kind `foraged`
  (`fold/src/modules/gaps.rs`, `forage_of`); a loot line's disposition (`depot`, `sold`, `hoard`,
  `combined`, `currency`) goes in `dispositions`; a combine files `crafted`
  (`itemReceived` via `fashioned`).
- Gap: a row has ONE zone tally for every way the item came (`Details.zones`), so the forage zone
  cannot be told from a loot or purchase zone. That is the one engine change.
- Being built by another session (rows 89-91 of the requirements): merchant offers per item with
  the player's /con standing (`gaps_offers.rs`, `shared/gapOffers.ts`); an offer heard at ally
  fills `merchant_value`. This plan does not touch prices beyond the rule below.

## What the logs hold (measured 2026-10-20)

Corpus: the archive (`companion-archive/eqlog_Drywrought_oggok_2026-08-12_to_2026-10-06_2.log.gz`,
4.0M lines; the other `.gz` is the same span, one of them is enough), the live Drywrought log
(976k lines), the testers' Malkil, Prettyboygeorge and Kaltinril logs. 2,237 item names in item
lines; 1,533 have a wiki page, 704 do not. Sample: 50 items, seeded, 4 each from forage, craft,
purchase, merchant sale and exaltation, 15 off the wiki, 15 on it; every non-chat line naming
them, templated. Cross-check against the 11,594 cached item pages (`scripts/sources/cache/items/`).

| Line | Count | What it gives a page | Today |
| --- | --- | --- | --- |
| `You have scrounged up X.` | 860 | `\|foraged` zone + `[[Category:Foraged]]` | kind only, no zone of its own |
| `You looted X from Y's corpse and stored it in your tradeskill depot` | 83 items | `[[Category:Tradeskill Ingredient]]` (the game files only tradeskill items there) | disposition kept, unused |
| `You have become better at <Tradeskill>! (N)` then, same second, `You have fashioned the items together to create something new: X.` | 612 combines, 36 of 45 items paired | `\|playercrafted` = `* [[<Tradeskill>]]` | Player Crafted category only |
| `You lacked the skills to fashion X.` | 130 | X is player-crafted (a failed combine) | not read |
| `You looted X ... and sold it for N` | 9k+ | Value estimate, faction-free (MEASURED.md) | built |
| `You receive N from M for the X(s).` (sale to a merchant) | 1,574 | a price, but faction- and CHA-dependent | not used for pages |
| `You purchased X from M for N.` | 748 | `\|soldby` vendor + zone; NOT a price (faction) | soldby built |
| `Your X (Exaltation) <message>.` | 114k | which exaltation effect fired; no page field | not used |
| `X +N cannot be moved into <Bag> because it is too big to fit.` | rare | a lower bound on Size only | not used |
| `You have fashioned ... create alternate product: X.` | rare | a by-product of a combine | misread as `alternate product: X` |

No log has a fishing line, a lore message, a Lore-item refusal, charges, a click effect named by
item, or item flags (No Trade, Temporary). The Lore tab text never reaches the log.

Cross-check, log against the cached pages:

- **Forage:** 35 items foraged; 5 have no page (Gray Wolf Skull, Sickly Maiden's Hair, Tuft of
  Black Bear / Gray Wolf / Grizzly Bear Fur); of the 30 with a page, 8 lack a zone the log
  foraged them in, 4 have an empty `|foraged` (Bottle of Kalish, Fresh Fish, Rusty Dagger, Tattered
  Cloth Sandal, all Kedge Keep), 6 lack `[[Category:Foraged]]`. Pages that say "most zones" or
  `Various` count as covered.
- **Depot:** 83 depot items, all with pages; 34 lack `[[Category:Tradeskill Ingredient]]` (Bone
  Chips, Phosphorous Powder, Lizard Meat, Diamond, Black Pearl, Froglok Leg, ...).
- **Crafted:** 44 of 45 on the wiki, `|playercrafted` filled on 42 (Staff of the Wheel and Star of
  Eyes empty).
- **Wiki-wide:** 466 item pages carry `{{Item Lore Missing}}`, 813 `{{Item Lore|...}}`.

## Faction and prices (owner reminder)

- A merchant's buy price and sell price move with faction and Charisma. Only the instant sale on
  loot is fixed (MEASURED.md), which is why `derivedPrices` uses it.
- A merchant sale or purchase line fills a page's price only at ally, the standing the wiki's
  `merchant_value` assumes, with the player's /con of that merchant on record. That is the rule
  `gapOffers.ts` already applies to offers; a sale line follows it, never a looser one.
- `|soldby` rows (`{{ItemWhereRow | zone | vendor | | (loc) }}`) carry no price (the third cell
  is blank on the pages measured), so a purchase gives the vendor and zone and nothing else.

## Phases

1. **Forage zone (the owner's ask).**
   - Engine: a `forageZones` tally on `Details`, written only by the forage line, with the zone
     at that line (the pseudo-zone `an area where levitation effects do not function` is already
     skipped by the parser). Protocol: field in `messages.schema.json`, `npm run gen:protocol`
     (needs cargo), fixtures and the harness `mod.rs`, one commit.
   - Page: `|foraged =` then a blank line and `* [[Zone]]` per zone, wiki spelling via
     `gapWikiZone.ts` (tiers folded), after `dropsfrom`; `[[Category:Foraged]]` plus each zone's
     category. Matches 137 pages (`agent/WIKI.md`, Foraged items).
   - Merge rule for saved and archived snapshots (`mergeGaps.ts`): sum the new tally like `zones`.
   - Test: Gray Wolf Skull foraged in Qeynos Hills writes the field and both categories.
2. **Forage on pages that exist (built 2026-10-21).** Owner: "include the forage info and do a
   reparse of local cache. if we can prove it was foraged lets make sure the item copy wiki code
   gets that information".
   - Parser (`wiki-scraper-fixes`, `itemLookupParse.ts parseForaged`): `foraged` (the zones the
     field links, a piped link's label), `foragedNote` (lines naming no zone: `Various`, `?`),
     `foragedCategory` (`[[Category:Foraged]]`).
   - Data (`local-data-refresh`): `items.json` re-parsed offline from the item cache, zero
     requests; a record took the fields only where the re-parse reproduced the rest exactly (all
     11,556 did). 141 pages gain them (foraged 135, category 135, note 6); 8,867,024 to 8,877,257
     bytes.
   - Engine: a KNOWN item's forage is a `forage` row (engine-only domain, no total of its own), so
     the archive merge keeps it like any row. Main answers each page's fields (`gaps:itemForage`,
     `main/gapItemForage.ts`). `shared/gapForage.ts` turns a proof row whose page lacks a zone or
     the category into an Items row, chip Add to item page; its copy is the lines to add: the
     missing `* [[Zone]]` bullets (with `|foraged = ` when the page lists nothing), then
     `[[Category:Foraged]]` if missing and each new zone's category. A `Various` or "most zones"
     note covers every zone. Zones are spelled by the same namer and `wikiZoneLink` as the new-page
     copy; a place is compared through the zone table (`Northern Karana` on item pages is the
     catalog's `Northern Plains of Karana`).
   - Measured on Drywrought (archive and live log, 2026-10-21): 25 known items foraged, 6 rows:
     Pod of Water, Roots, Rabbit Meat, Fishing Grubs lack 18 to 24 zones each (pages list some;
     the log foraged them nearly everywhere); Berries and Tuft of Polar Bear Fur lack only the
     category. The 2026-10-20 "8 + 6" counted the testers' logs too and compared spellings raw.
3. **Tradeskill Ingredient.** The copy adds `[[Category:Tradeskill Ingredient]]` when the row's
   dispositions hold `depot`, or the inventory export has the item under `Personal-Depot`
   (Gray Wolf Skull is there). An existing page missing it is an update row like phase 2 (34).
4. **Player crafted with its tradeskill.** Engine: pair the tradeskill skill-up line with the
   success line of the same second (the skill-up comes first) and keep the skill on the row; read
   `You lacked the skills to fashion X.` as crafted too; strip `alternate product: `. Page:
   `|playercrafted =` `* [[Jewelry Making]]` (trivial, container and ingredients left for the
   player; a skill-up stops at trivial, so the log cannot state it). Without a skill-up, the
   field stays out and only the category is written, as now.
5. **Lore and flags: not from the log (owner, 2026-10-21: "lore flags we can't gather here, we'll
   have to wait for the other agent that's building an image ocr tool").** They come from the item
   window's screenshot, `plans/2026-10-20-screenshot-to-wiki.md`. Kept for that work: Today the statsblock skeleton is
   Size/WT, Class, Race. Candidates: an empty first flags line, and `|notes = {{Item Lore Missing}}`
   (the wiki's own marker for unknown lore, 466 pages) so a page made from the copy is listed with
   the others that need a Lore screenshot.
6. **Inventory export facts (`<Char>_<server>-Inventory.txt`): decided, not built (owner,
   2026-10-21).** An item fits several slots (Primary and Secondary, or Primary, Secondary and
   Range; Waist and Back), Ammo, Any, or sits in a bag slot, so one worn location cannot state its
   `Slot:` line; Slot comes from the item window screenshot (`screenshot-to-wiki`). Measured for
   the record: the export gives the worn location (`Chest`, `Ear`, `Primary`) and a container's
   slot count (`Slots` 10 on the satchels, 4 on Zimbittle's Pouch; 11 on every non-bag item,
   meaning unknown); its `ID` column is the item id, not the icon (Ruined Robe 8721 vs
   `lucy_img_ID` 1126).

Built in the order 1, 3, 4, then 2 (it needed the re-parse).

## Not worth building (measured)

- Exaltation messages: five texts (`feels alive with power`, `flickers with a pale light`,
  `shimmers briefly`, `sparkles`, `pulses with light as your vision sharpens`); 4 item pages
  mention Exaltation at all; no field for it.
- `too big to fit`: a size lower bound against one bag; the statsblock wants the size itself.
- Turn-ins (`You offered N X to Y`): owner ruling E4, 2026-10-19, an offer is not an accepted one.
- Chat mentions of an item: a player's words, not the game's.

## Open questions for the owner

- Phase 5 is decided: lore and flags wait for the screenshot reader. What it needs from here: lore
  goes in `|notes = {{Item Lore|...}}`; the flag line's two styles are in `agent/WIKI.md`.
- Phase 6 is decided: not built (above).
