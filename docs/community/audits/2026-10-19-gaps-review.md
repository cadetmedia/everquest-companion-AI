# Gaps tab review, 2026-10-19

Goal reviewed against: "get the wiki updated the most efficient way by helping the user have all the
correct information ahead of time". Tree: `main_community` at d52e6cdc (gaps-tab level with it).
Nothing in the repo was changed. Two page views of https://eqlwiki.com/Help:Contents were made to read
the four blueprints; no other wiki request.

Method: scouting by hand, then a review workflow (6 finders, dedup, a fact-checker and a relevance
checker per finding). 76 raw findings, 52 after merging. 21 passed both checks; none of the 21 was
refuted on the facts. The second run (27 more verifications, a critic) was stopped to save tokens;
of those 27, I confirmed the ones marked "confirmed by me" by reading the code or grepping the log,
one was refuted (the levitation message: `world.rs:86` has a pseudo-zone guard), and the rest are
marked "reported" with the finder's own evidence. Numbers are from the owner's live log
(eqlog_Drywrought_oggok.txt, 2026-10-06 onward) unless "archive" is said.

Owner rulings already in force were respected (no merchant stock list, no price domain, no pet-name
rule, no comma-title rule, item pages carry only log-filled fields, NPC pages keep the whole layout,
corpses-over-kills rates with `~`, groups filed as the group, Motes left out).

## A. Wrong facts the copied page would publish

A1. Capped faction lines lose their direction; raised factions land under `| factions` (lowered).
    `gaps_trade.rs:42-43` returns no sign for both "could not possibly get any better" and "...worse";
    `wikiPage.ts:264` files an unsigned pair as lowered. Measured: 4,688 capped-better and 3,229
    capped-worse lines; 75 of 112 Faction rows are raised factions; 51 pairs were only ever capped
    (e.g. Kerra Isle <- a rabid kobold x102, Storm Guard <- aqua goblin marauder x304). Fix (gaps-tab):
    serve the direction from `faction_of`, carry it on `KillFaction` and in `mergeGaps.ts:162-171`,
    file capped-better under `opposing_factions` as a bare bullet (the wiki uses bare bullets or
    numbers there, never "(max)"). Also have the Factions row's copied line carry the span/sign
    (`PAGE_OF.faction`, `wikiPage.ts:324`, today `* [[X]]` with no amount and no block).

A2. Zone links and categories use the log's spelling, tier suffix included. `rowZones`,
    `dropsSeen`, `npcValues.zone` and `page()` categories write `[[Befallen 4 (Refined)]]`,
    `[[The Plane of Hate - Group 4 (Refined)]]`, `[[The Ruins of Old Paineel]]` where every wiki
    page says `[[Befallen]]`, `[[Plane of Hate]]`, `[[The Hole]]` (mobs.json: Plane of Hate 50 vs
    The Plane of Hate 0; The Hole 46 vs Ruins of Old Paineel 0; Lower Guk 63; Mistmoore Castle 72;
    Permafrost 36). 77% of this log's loot was read under a non-wiki spelling; a category never
    follows a redirect. Fix (gaps-tab): a `wikiZoneName(raw)` in `shared/zones.ts` = the most
    frequent mobs.json spelling with the same `zoneKey`, applied in `rowZones` and `dropsSeen`
    (tiers merge into one block); add a Temple of Cazic-Thule alias (wiki: "Cazic Thule").

A3. Items looted as "+N" never reach the builders. The engine row is the base name
    (`gaps.rs:195 item_base_name`) but `dropsSeen` (`wikiPage.ts:131`), `mobLoot` (:164) and
    `lootPlaces` (`gapGroups.ts:41`) compare the raw loot spelling. A +N-only item copies with no
    `dropsfrom`; a mob page lists `{{:Throwing Boulder +4}}` (no such page) with the rate split per
    tier; the grouped view files the item under no mob. Measured: 2,064 +N loot lines, 199 base
    names looted only as +N, 200 mixed. Fix: `itemBaseName` on both sides in the three places and in
    the engine's drops tally (`gaps_details.rs:174`), as `gapDrops.ts:22` already does.

A4. Drop rates count loot lines, not corpses, and clamp at 100%. One corpse that prints three
    lines of one item is three "drops"; `lootLine` then prints "(Always) [Overall: ~100%]". Small on
    this log (3 lines affected, 13 move a band) but against the owner's "corpses" ruling. Fix: no
    rate when drops > kills (the `kills <= 0` shape), and count a (ts, source, item) once.

A5. `| level` merges /con levels from every instance tier. Measured tier shifts -2..+4; 2 unknown
    mobs on this log were conned only inside a tier (a giant yellow recluse "8 - 9", a hardened
    skeleton "19"). Fix: tally cons with their zone, fill level from untiered zones. OWNER CALL:
    tier-only cons -> blank, or "19 (Refined)"? (default blank).

A6. Mote fusions are filed as "crafted" and the item page gets `[[Category:Player Crafted]]`
    (confirmed by me). `world.rs:111` parses "...merged two items together to create a new item: X"
    as itemMerge; `gaps.rs merge()` files an unknown result as `crafted`; `itemPage` adds the
    category. 262 fusion lines, 0 "You have fashioned" lines on Legends, so every Player Crafted the
    builder can emit is a fusion. Fix: a `fused` kind, no category.

A7. The faction amount written is the LAST line's value (`gaps_trade.rs:93`); on 10 pairs that is a
    one-off (Gem Choppers 5 x369, 4 x1 -> page writes 4). Fix: serve the most-stated amount.

## B. Rows that send the player to the wrong place

B1. Items the wiki titles with an article count as unknown. The item fold never drops a leading
    a/an/the (mobs get it, `gaps_names.rs:55`); items.json has 161 such keys. The two biggest Items
    rows, Skeletal Finger (40) and Skeletal Toe (39), plus Dark Cauldron, Cracked Femur and Ghoul's
    Heart, are pages the wiki has; the chip says "Re-scrape", which can never clear them. Fix: an
    article-stripped key in `items_loose` (`gaps.rs:428`) and a third check in `item()` (:193).
    Effect on this log: Items 34 -> 30.

B2. Add to mob page / Edit mob page / Create page use the LOG's mob name, not the page title.
    `gapDrops.ts:148`, `gapFactions.ts:51`, `gaps.ts:334,357`, `GapsTable.tsx:133,141`. On this log
    40 of 898 Drops rows and 10 of 112 Faction rows open a non-existent page or a redirect
    ("a shadowknight" -> the editor of a new page beside "A shadowknight (Human)"); 154 mob keys
    map to 2+ pages; 367 hrefs differ from the title only by case. The Images domain already carries
    `page.page`. Fix: keep the catalog entry per key, pick by the loot zone, carry `page` on the row,
    fall back to the wiki search when several pages remain.

B3. Drops ignores `|common_loot`. `mobLookupParse.ts:228` reads only `known_loot`; 195 cached mob
    pages list loot under common_loot. 115 of 882 Drops rows (13%) are already listed there, including
    the #1 row "Rusty Weapons (an orc warrior) x52"; the chip states a false fact and Copy lines
    pastes a duplicate. Fix (wiki-scraper-fixes + local-data-refresh): read common_loot in
    `mobPage.ts:98` into `drops` (or a sibling `commonDrops` read by `gapDrops.ts`), re-derive
    mobs.json offline. OWNER CALL: app-wide drops or Gaps-only? (default app-wide).

B4. Drops files items a mob page lists under a redirect title. 141 of mobs.json's loot link texts
    are redirects to pages items.json has (`{{:A Wooden Heart}}`, `{{:Large Ringmail Cape}}`); 11 of
    898 rows on this log (Wooden Heart (a treant) x11 ...). This also corrects BRANCH_NOTES' "142
    Itempage pages the scrape misses": they are redirects, not missed pages. Fix: write an `aliases`
    map from `cache/drop-groups/pages.json` into dropGroups.json (zero requests), fold it in
    `dropsByMob`.

B5. Factions fold and spelling variants: MOSTLY REFUTED by a second check. Of 93 distinct log
    faction names only 4 have no catalog match, and only 1 of those is a spelling case ("Opal
    Darkbriar" vs catalog "Opal Dark Briar"); the finder's examples (Death Fist Orcs, Split Paw Clan,
    King Ak`Anon, Faydarks Champions) exist in mobs.json in the log's spelling too. Low: an
    alphanumeric fold would still help where a single mob page carries only the run-together
    spelling (49 such catalog groups), untested per mob.

B6. A near-miss row (Teir`Dal vs Tier'Dal) still offers Copy wiki page and Create page under the
    game spelling with a full Itempage. The agreed remedy is a redirect. Fix: `wikiPageText` returns
    `#REDIRECT [[page]]` for a suggest row; buttons read Copy redirect / Create redirect. (No live
    exposure today; archive only.)

B7. One-word named mobs read as players, so the largest spell row (Specter Stun, 522 casts, cast by
    Zazamoukh and Ankhefenmut) is not NPC-only: chip "Check wiki", page without the NPC-only line and
    category. Fix: `npcOnlySpell(row, isMob)` with the catalog, but exclude names in the engine's
    players set (926 catalog mobs have one-word names; 17 of 251 one-word casters share one).

B8. "Use/Enable/Disable Ability" (the game's ability switch) listed as unknown spells: 92 archived
    casts, 2 live. Fix: a `no_spell` set beside `no_mob`.

B9. "*Guard Willia" is unknown because the loose fold keeps the game's leading asterisk (archive
    only, 63 lines). Fix: strip a leading `*` in `mob_loose`.

B10. `gapVerdictsRead.ts:37` reads a cached offline-lookup record as "has page" -> "Re-scrape" chip.
    Latent (0 such records in the four caches today); fires on a /con made while the wiki is down.
    Fix: offline -> unchecked.

B11. Confirmed by me, low frequency: a pet slain by a one-word named mob (Terror, Bzzazzt) is filed
    as an unknown mob (`gaps.rs death()` treats the killer as player-shaped); a loot line whose item
    contains " from " splits wrongly in the sold/stored forms (`world.rs:73`, 1 line).

B12. The Event Log mark (confirmed by me): `event_feed.rs:221` uses the exact `known_mob`, not the
    tab's loose rule, so pets and titled/disambiguated mobs the tab counts known are still flagged
    "missing - screenshot it" in game; and `event_feed.rs:253` reads only `destroyed`, so loot the
    game auto-sold the instant it dropped is marked "screenshot it" though the item is gone (the
    mark should say auto-sold / keep the next one).

## C. Missing support for "all the information ahead of time"

C1. Nothing tells the player what to collect per page type. 34 of 54 mob pages on this log copy
    with `| level =` blank and 53 of 54 with `| location =` blank because nobody said "/con it" and
    "/loc then hail within 10 s". Fix (keeps the one-line ruling): a per-domain capture hint in the
    Copy wiki page tooltip and a "Still needed for the page: level, location, image" line in the
    details pane from a pure `missingFields()`.

C2. No done / dismissed state. About 1,385 live rows (34 items, 54 mobs, 19 spells, 2 merchants,
    112 factions, 898 drops, 266 images) stay, chips unchanged, until an owner-run delta lands in the
    data (same evening at best, five days between the 10-13 and 10-18 data commits). Fix: a
    per-viewer `eq.gaps.done` set, Done button in the pane, hidden by default behind "show N done",
    skipped by Copy list, auto-dropped when the row leaves the snapshot.

C3. The Images domain counts only mobs killed or looted. The owner's own case, Marda, was conned
    twice and hailed once, never killed (grep), so she would never have been listed. Fix: feed the
    consider rows (and merchants) into `metMobs` in `gapImages.ts`.

C4. A hailed NPC never files a Mobs row (`gaps.rs:226` routes a hail only to locs and merchants).
    Six Oggok/Warrens NPCs the owner stood beside have no row (Grapok, Rognok, Bordag, Kujanko,
    Arakaj, Owakanji); single-word names also fall to the "/con of a one-word name is a player" rule.
    Fix: file mob-shaped hails under the con guard now. OWNER CALL: file a single-word name that
    answers the hail by `says` within 10 s (Grapok, Rognok)? (default yes).

C5. Image rows for mobs killed but never looted have no zone (`gapImages.ts metMobs`: kills carry
    none), so they fall under "Zone not seen" and vanish under Zone I'm in. Confirmed from code and
    re-measured: 29 imageless mobs killed but never looted (a giant widow, Trainer Daxgrr, Arnis
    McLish, Bunu Stoutheart ...) against 235 killed-and-looted. Fix: take the zone from the consider
    rows or the kills module's tier runs.

C6. The app already knows whether a gap item is in the player's bags or bank (`gearOwnership`,
    `computeHeldCounts`), but an Items row never says "you hold one: screenshot it now". That skips
    the trip entirely. Fix: one line in the details pane; optional "Holding it now" filter.

C7. A mob row does not link to where it stands though mobs.json has coordinates and the Maps tab
    opens a zone (`openMapZone` precedent in Gear/Plan). Fix: a Map button on the row and heading.

C8. "Check wiki: nobody has looked this name up yet" is the default for nearly every row while the
    data is a day old, and "Re-scrape" / "Fix parser" are not player actions. Fix: a "wiki data from
    <date>" caption (Gear tab precedent) and tooltips that name the data date. OWNER CALL: with fresh
    data, should the default chip read "Add to wiki"? (default: keep Check wiki, fix the tooltip).

C9. Group by zone splits one place into up to eight headings, one per instance tier (`gapGroups.ts
    addTo` keys by the raw zone). The owner accepted tier folding for Zone I'm in. Fix: key by
    `zoneKey`, show the tier on the row.

C10. Rates and denominators across tiers: a drop seen only at +4 is rated over kills at every tier,
    and the line never says it was tier-only (240 of 898 rows were +4-only). OWNER CALL: keep the line
    with `<!-- seen at +4 only -->` and a tier-kill denominator, or omit tier-only drops from the base
    page? (default keep with the comment).

C11. Copy list in the grouped view copies the flat TSV, not the zone-then-mob plan.

C12. Drop and faction rows keep only the LAST zone they were seen in (`gapDrops.ts m.zone = e.zone
    ?? m.zone`), so Zone I'm in hides them in another place they dropped. Reported.

## D. Markup shape differences (the paste works, but the page reads unlike its neighbours)

D1. `|soldby` is written as bullets; 1,243 of 1,278 real pages with soldby use `{{ItemWhereTable|`
    + `{{ItemWhereRow | [[Zone]] | [[Vendor]] | | (x, y) }}` (zone filled 100%, loc 99.9%). The
    zone is in the row's tally; a vendor who is a mobs.json merchant has a loc in app data.
D2. A group drop row copies `<li> [[Group]] </li>` without the rate the wiki puts on group lines.
D3. A new mob page lists group members one by one. The wiki does both (members more often), so this
    is only an inconsistency with the Drops rule; low.
D4. Blank NPC fields where the blueprint and real pages (50:1) write `* None`. OWNER CALL: blank
    means unknown and `* None` means known-none; keep blank unless the log can prove none (default
    blank).
D5. Polish: `| level = 11 - 13` (wiki writes `11-13` 983:281); `[Overall: ~20%]` (wiki writes one
    decimal 9,572:280); a con-only mob keeps the con line's sentence case in `| name` ("A scout
    from zanivar"; the wiki's `|name` keeps the lowercase in-game article); a /loc while trading
    never places a merchant (only a con or hail pairs).

## E. Facts the log holds that the pages could carry (opportunities, not defects)

E1. Forage: 466 "You have scrounged up X." lines are parsed by nothing; 4 foraged items the wiki
    lacks never reach Gaps, and `|foraged = [[Zone]]` + `[[Category:Foraged]]` are deterministic
    from the line and the fold's zone. The "Not from the log: foraging" note in the requirements
    status and BRANCH_NOTES is wrong. Fix: an `itemReceived via foraged` arm in `acquire.rs`, a
    `foraged` kind, `|foraged` in `itemPage`.
E2. Specials (confirmed by a second check): Legends prints `(Rampage)` / `(Flurry)` on the mob's
    own attack lines, `eqlog/src/taxonomy.rs parse_modifiers` already extracts them, and no gaps
    module tallies them. On this log 273 such lines by 9 mobs (Lord of Ire flurried 79 times, Maestro
    of Rancor rampaged 62); all 9 have a wiki page and all 9 pages' `| special` lack the word. A per-mob
    specials tally in gaps_details.rs would fill `special` on a new page and could later back a
    "special missing from the page" check.
E3. Corpse coin: 97.4% of 5,689 "You receive N from the corpse" lines sit in the kill's second, the
    same 2.5 s rule the factions use; the mob page's money line ("* 1 to 3 platinum" / "NO MONEY
    DROPS") is never offered. Reported.
E4. Turn-ins: 242 "You offered N X to NPC." lines are parsed but never reach an item's row; "handed
    to [[NPC]]" is the player's only key to the quest page. Reported.
E5. Spell pages: the game's spells_us.txt and spells_us_str.txt beside the install state every Spell
    Page Blueprint field for 23 of the 24 unknown spells cast here; main already reads spells_us.txt
    at runtime (appSpellDb.ts, conCard.ts, spellDetail.ts), so the precedent exists. OWNER CALL: the
    2026-10-10 ruling kept game files out of the data pipeline; this is a runtime page fill, not a
    scrape. (default: not until ruled).
E6. Not allowed by the zero-guess law, measured and left out: respawn_time (death-to-death floors
    at 60 s for every trash name; the respawn module estimates carry the fight), HP and damage per
    hit (no per-mob tally; tier hits exceed wiki ranges), race, item `|effect` (all 17,610
    itemActivate lines are Exaltation worn procs), class/level at first cast (/who shows all classes),
    summons/enrage/immune (0 Legends lines).

## F. Measured and fine (no change needed)

- The 2.5 s faction pairing is sound on this log: 0 deaths claim a repeated faction; all 761
  unclaimed faction lines are more than 10 s from any death (580 beside turn-in context).
- The merchant domain's exact-name check is harmless here: 11 rows, all absent from the 7,967-page
  mob cache under any fold; 0 merchants reachable only through a disambiguated title.
- The 500-row engine cap is never approached (largest engine domain 104 rows).
- NPC-only spell pages: the builder's `| classes = This spell is cast by NPCs only.` and
  `[[Category:NPC Only Spells]]` match 321 and 311 of the 354 cached NPC-only pages; `{{Spellpage|`
  is what 347 of them use.
- `npc_<name>.png` matches 6,207 of 7,355 real image names; `merchant_value` "2s 7c", Vendor Sold /
  Player Crafted / zone categories, and the drare/ddb loot line all match the wiki.
- The 97 spell-cache titles outside spells.json are mob/item pages embedding Spellpage, 2 {{Delete}}
  pages and 62 alias pages: no missed spells.
- tests/wikiPage.test.mts passes 6/6; it pins none of the A-section cases, so each fix needs a test.

## G. Owner decisions (2026-10-19)

1. Instance tiers are one place and do not change a mob's level (the -2..+4 shifts measured above
   cannot be told from ordinary spawn-level variety; the owner cons a mob only now and then). A5 and
   C10 are dropped: `| level` keeps every con, a rate keeps every kill, no tier comments.
2. A "+N" item is the same item as its base, everywhere (A3).
3. Read `|common_loot` as well as `|known_loot`, into the cache and the drops (B3), and learn which
   field the wiki uses for what, so Copy wiki page puts each drop in the right field.
4. Hails and cons file unknown NPCs. A players list (chat senders, tells, group, `/who`, pets that
   speak) is subtracted from the candidates; a name conned or hailed repeatedly in one zone leans NPC;
   a doubtful name carries "may be a player" with a "mark as player" action, kept permanently (C4).
5. A Done button on a row, with "show done" to bring rows back (C2).
6. `* None` where the log proves none (factions after credited kills with no faction lines); blank
   otherwise.
7. Spell pages may be filled from the game's spells_us.txt / spells_us_str.txt (owner: "as long as
   this doesn't cause issues with any sort of EQL scanner"). Reading files at rest is what the app
   already does with spells_us.txt for resists and spell details; nothing touches the game process.
8. "Check wiki" stays the default chip; the data date goes in its tooltip and in one caption.

## H. Order of work

1. A1, A2, A3, A4, A6, A7 (wrong facts in the paste).
2. B1-B4, B6-B12 (rows that misdirect; B3 on wiki-scraper-fixes + a data re-derive).
3. C1-C9, C11, C12, D1, D2, D5, decision 6.
4. E1-E5.

Every change needs its requirements row first (rule 19); gaps-tab's recipe line is unchanged.

## Status (end of 2026-10-19)

- Built and merged into `main_community` (local only, NOT PUSHED): the eight decisions and the A, B
  and most C findings, on gaps-tab, wiki-scraper-fixes, scrape-delta-tool, log-archive,
  local-data-refresh and main_community_rules. Gate green on the merged tree (typecheck, lint, unit
  suite with only the known reds, `cargo test --workspace`, rust factoring); release engine rebuilt.
- Waiting on the owner: test in the dev app (restart it first), then push every branch above to
  `origin`.
- Owner decision pending: the redirect cache's first real run (`scrape-mob-redirects.ts`, about 19
  requests); default, with the next delta.
- 2026-10-25: the Temple of Cazic-Thule alias and the "X from Y" loot split are built (catch_all 2026-10-23 and 2026-10-19); the owner approved building the rest of this list ("Yes, add them. Just make sure that if a user changes the values it doesn't break anything").
- Status 2026-10-25: C6, D1, D2 and E3 were built 2026-10-19 (the line below was stale); C7 built 2026-10-25; E4 built 2026-10-22, tightened 2026-10-25 to completed trades.
- Was "Not built (open)": C6 held items in the details, C7 map link, D1 soldby as an ItemWhereTable, D2 the
  rate on a group drop line, E3 corpse coin, E4 turn-ins, a Temple of Cazic-Thule zone alias, the loot
  regex splitting an item named "X from Y" (creator's parser, catch_all).
