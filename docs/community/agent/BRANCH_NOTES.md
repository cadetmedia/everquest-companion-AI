# Agent notes: per-branch design, traps and open items

What a session needs before touching a feature branch: the design laws it must not break, the
traps it hit, and what is still open. BRANCHES.md says what each branch is for; each branch's
`requirements/<branch>.md` lists what was asked (RULES.md rule 19). Read both first.

## gear-progression-plan (PR #36) and gear-tab-improvements (PR #31)

- **Survivability dial:** dps focuses read a "Glass cannon <-> Wooden sword" slider
  (`roleWeights.ts`: `RoleContext.survivability`, `DEFENSE_SPANS`, `readsSurvivability`). Weight
  table = midpoint of every span; default 0.3 (`SURVIVABILITY_DEFAULT`, also `roleValue`'s
  fallback). Stored at `eq.plan.survivability`.
- **Chunk-stat law:** for a dps focus, attribute-sized stats (STR, DEX, STA, AGI, AC) are priced
  everywhere; chunk-sized stats (flat HP, resists, mana) are ~zero at glass and real only toward
  wooden. Pinned cases in `planOwned.test.mts` (Boots of Brawn, Withered Leather Boots, Imbued
  Granite Spaulders).
- **Base-vs-base law:** compare and gap-test base against base, never rescale bars. The compare
  card states the worn copy's tier in a frame label.
- **Quest lane:** `PlanCorpora.questSources` gives quest witnesses to rows with no dropper; a
  stated dropper always wins.
- **Ownership:** a bare loot line does not exclude a farm target; only dump-owned or melted into an
  exaltation does. The equip advisory (`planOwned.ownedUpgrades`) must apply every gate the route
  applies (`wearable`, weapon policy) except era: an owned item is owned.
- **Level cap 50** on the route (`planner/planHorizon.ts`, `LEVEL_CAP`, `LAST_BRACKET_ROOM = 4`).
- **Ranged:** STR 0, ATTACK 0, DEX 2; the blurb still names STR and ATK ("score nothing here").
  Archery buffs and item effects are not scored in any focus.
- **No stat caps modeled:** no sourced cap data exists.
- Bars come from EQUIPPED items only.
- `roleWeights.ts` is byte-identical on both branches (plan branch is home). `gearScale.ts` on
  gear-tab is a superset; compare-card files live on gear-tab, plan fold/UI on the plan branch.
- Gear toolbar row one is full at 1280px (~138px slack); a new filter goes on row two. `GearView`
  is at the 100-line function ceiling; `gear.e2e.mts` is near 400 lines.
- Zone filter: `GearFilters.zones` holds map stems; 174 corpus spellings resolve to 121 zones via
  `zoneShortNameFromCatalog`.
- Open: arrows are unvalued (DMG with no delay); two suspect rows (Oakwynd, Coldain Crossbow) top
  the RANGE slot; zone options do not respect Current era; clicking a Zone cell does not filter.

## map-improvements (PR #35)

- PR #35's title/body still describe only the August pins work; rewrite before anyone reviews it.
- Owner ruling: nothing that does not relate to EQ Legends. `portsInClient` drops a cast port
  whose spell the client lacks; item ports pass on the item.
- Zone graph: built at idle from label (`P`) records only, as the union across ALL map packs (plane
  entrances are labelled only in the default pack). Full parse 3.9 s vs labels 0.55 s. Geometry
  LRU holds 8 zones. Owner preference: precompute once, never per-open work; `refresh()` has no
  callers, so pack installs do not invalidate.
- Port destinations: Teleport to / Teleport group to / Translocate to / Evacuate to / Evacuate
  group to.
- Where to level refuses out-of-era zones, home cities (`city: true`) and locked zones
  (`minLevel`). Levels go through `sortLevel`, so "~19" counts.
- Drag ends on `buttons===0`, pointercancel and lostpointercapture.
- MUI Tooltip must wrap a DOM element (Box/Link), not a plain function component.
- Open: no e2e for Closest port / era chip / advice table; Hate and Sky lock levels unruled.
- Open (seen 2026-10-13, present on the morning build too): `maps.e2e` "the map row never moves" fails,
  the pane drops 91 px (371 to 462) when the map arrives, most likely the travel card appearing late.

## map-waypoints (bases on map-improvements)

- `/waypoint` is the game's command (`eqstr_us.txt` 8326: "Usage: /waypoint x, y, z"). Written in
  /loc order (N/S first); which number the game calls x is UNVERIFIED in game. One switch,
  `NS_FIRST` in `features/maps/waypoint.ts`, flips it.
- The owner's EQ Legends log DOES carry `Your Location is` lines (upstream comments in
  `locMarker.ts`/`mapGeometry.ts` say zero; true of the creator's logs, not this one). A live
  position source is possible later; nothing reads it yet.
- Overlay windows share localStorage with the main window (same origin, no partition): the track
  list (`eq.maps.track`) reaches the overlay through `storage` events, no IPC.
- A new overlay kind touches: `OverlayKind`/`OVERLAY_KINDS` (insert before the strips so
  `conCard` stays last and no meter's dock slot moves), `OVERLAY_KIND_LABEL`/`OVERLAY_LABEL_ORDER`,
  `DEFAULT_OVERLAY_CONFIG`, `OVERLAY_MENU_ROWS` (description only, never the label),
  `OVERLAY_TITLE`, `overlay/main.tsx`, `MODULE_READING_OVERLAYS` when it reads a module, tests
  `overlayHotZone` + `overlaysAppearanceSteps` ALL_KINDS. Telemetry: list it in
  `UNREPORTED_OVERLAY_KINDS` (`shared/telemetryOverlays.ts`) rather than widen the closed enum the
  creator's Lambda validates.
- Overlays may not carry native `title` tooltips (`overlayTooltipPolicy.test.mts`).
- Owner rule (2026-10-13): zoom and pan NEVER redraw the Maps sidebar. `MapMobPane` is `memo`;
  every prop it takes must keep its identity across view changes. A callback that needs the view
  (`onCenter`, `jump`) reads it through a ref, never as a dependency. Twice a dependency on
  `view.scale`/`zoomedIn` broke the memo and cost ~180 ms per wheel step on a 290-row zone.
  Check: a CPU profile of 16 wheel steps shows no MUI (ButtonBase, Tooltip, emotion) frames.
- Overlay bundle trap: anything the overlay imports that reaches `features/mobs/mobSearch`
  (`MOB_CATALOG`, 3 MB) lands the catalog in the `conCard` chunk EVERY overlay window loads (even a
  dynamic import did). The Map pins overlay gets a slim copy over `maps:mobPlaces` instead, and
  `useZoneTrack.ts` (catalog) is kept out of `useMapTrack.ts` (overlay). Check after a build:
  `grep -c 'Sandgiant Husam' out*/renderer/assets/conCard-*.js` must be 0.
- Owner ruling (2026-10-13): the app may READ the game's `UI_<char>_<server>*.ini` at runtime for the
  Map pins overlay's optional Follow map (`[MapViewWnd] Show=`, re-saved by EQ on every M press).
  Zoom and pan are never saved anywhere (measured). Read-only; nothing else in that file is used.
- The Map tab's viewport state lives in `MapTab`, below `MapsTabs`: MUI Tabs re-measures its
  indicator (`getBoundingClientRect`) on every render, so the tab bar must not render per frame.
- Locked overlays are click-through except the header strip, so the pin overlay's clicks work
  only unlocked. Open: per-pin capture while locked.
- Auto-hide never hides the overlay while unlocked (2026-10-14): a hidden window draws no chip,
  so unlocked is the way back. Pinned and hidden, the Overlay menu's reset is. A new localStorage
  key the overlay keeps must start with `eq.maps.overlay` (`tests/mapPinsReset.test.mts` checks).

## bazaar-tab

- Owner ruling (2026-10-13): a wrong count is worse than a missing one. An offer the reader has to
  guess at is listed (line, speaker, time, direction) but never counted: `Offer::sure` false, no
  price, no day count, no median, no alert. A new parse rule that guesses marks its offers unsure
  rather than widening what is counted. The guess rules live in `bazaar_words.rs::mark_guesses`.
- Measure a rule change on the owner's trade lines: `BAZAAR_CORPUS=<lines> BAZAAR_DUMP=1 cargo
  test -p fold bazaar_corpus -- --ignored --nocapture` on the old and new trees, then diff the
  DUMP lines; the summary line reports `priced` and `counted`.

## exaltation-clarity (bases on character-slot-sockets)

- Socket rules and the per-weapon proc exception: MEASURED.md, Exaltations.
- Board optimizer (`socketOptimize.ts`): maximum bipartite matching over one claim per family ->
  worn sockets; objective = most distinct families at highest owned tiers. Stable matching:
  edges ordered current seat -> empty -> occupied; incumbents win ties only when their own best
  donors can keep a seat. Never invent cross-family values: a contested seat is named "your call".
- `socketRecommend.forceKey(family, seat)`: family per body, `family@cellId` for Proc seats.
- Chip and panel advice come from one computation (`useSocketAdvice`), so they cannot diverge.
- Windows case trap: `ExaltationAudit.tsx` vs `exaltationAudit.ts` -> TS1261; the panel is
  `ExaltationAuditPanel.tsx`.
- Open: persist the owned tri-state; e2e for red cards; is un-socketing lossy.

## spell-upgrades

- All Spells views sit behind `UNRELEASED`. Graduation order: widen `TELEMETRY_VIEWS` and deploy
  the ingest Lambda FIRST (a client reporting an unknown view 400s the whole batch), then the
  `KNOWN_VIEWS` splice. Deploy is the owner's call. `tests/e2e/spells-gate.e2e.mts` guards it.
- Two copies of the spell load pipeline: `buildLevelUnlocks` (levelUnlocks.ts) runs its own pass
  over spells.json, separate from `loadSpellDb`. A new load pass goes in both.
- `spells_us.txt` is parsed into a versioned disk cache (`SPELL_RESIST_CACHE_VERSION`,
  `resist/spellTable.ts`). A change to the key rule or row shape needs a version bump.
- Same-name pairs with different messages are two spells; a classic row folds only when a noted
  row prints the same three messages (Healing Water regression, test.11/12).
- Page preference runs AFTER corrections.
- Group buff set: a group-mate contributes only spells whose `target_type` reaches another player;
  mates are read at YOUR level. Party colours are stored as slots (8), paint in `partyPaint.ts`.
- When gear-progression-plan merges: pass `roleWeights` into `buildLoadout` and delete
  `DEFAULT_STAT_WEIGHTS`.
- Rust `spells_us.rs` twin is not parity-gated; deferred.
- Open: SPA 148 slot reading (MEASURED.md); SPA 475 rows in the same slot contest each other.
- `LevelUnlockData.general` holds the General AAs with no class key; the fold appends them classless
  (`UnlockRow.general`) after the class rows, and a name a class row shows wins.
- Archetype AAs are not listed: `classes.json` `aas` has `group: 'archetype'` and no classes. Add them
  only once the data states an archetype or classes.

## faction-tab, slayer-tab (Achievements), unlocks-tab

- faction-tab: live standings = dump + log receipts since the dump's mtime (32 MB tail read).
  Cap lines PIN the value. Quest faction receipts come from the committed quest cache (zero
  requests). Wiki quest pages quote receipts inconsistently, so home-zone quests with no stated
  receipt are shown separately with a neutral marker.
- Class filter is inclusive on ambiguity (wiki class tokens are prose).
- Graduating faction-tab: delete the UNRELEASED gate + `unreleasedFactions.tsx`, add `factions`
  to `TELEMETRY_VIEWS` (Lambda first), give `loadFactionsNow` its perf seam.
- slayer-tab: the tab is Achievements, view id stays `slayer`; NavDrawer.tsx untouched so the
  sidebar-groups rerere replays. `achievements:book` is read on demand and never stored. Mob race
  from the wiki `|race` field (`scripts/gen-mob-races.mts`), mob factions likewise
  (`gen-mob-factions.mts`). Open: `Obtain <Item>` lines link nowhere; picks are per machine, not
  per character.
- unlocks-tab: its first commit merges faction-tab onto slayer-tab (needs both). The App-root
  provider wraps `<ViewContentMemo>` at App's ROOT; wrapping the view subtree re-indented lines
  other branches edit. Deity constants are spelled locally (the shared ones live on
  exaltation-clarity).

## roster-who-classes

- `roster_who.rs` reads `/who` rows from `unknown` events via `ev.raw()` and joins them to
  published roster members (`classes`, `level`, `classesTs`). A row never admits anybody to the
  roster. Chosen over a new parser `Kind` (~30 files incl. parity). Only works if the player types
  `/who` on the group.

## fix-ds-ever-struck (PR #61), fix-roster-overrides-ever-struck

- `ever_struck` permanently refuses a caster's pet claims. Path 1: damage-shield ticks wrote it
  (fixed, PR #61). Path 2: a riposte against a groupmate wrote it; a LIVE roster member now passes
  the `ever_struck` refusal only (charm broadcast stays absolute). Path 2 should go to upstream
  #60 as a second path + PR.

## log-archive (upstream #37)

- Plan and measurements: `docs/plans/log-archive/`. Laws: never write to the game log; a fold is
  never seeded with what it re-derives; combat history is lossless.
- The switch ("Summarize and archive log") is the only control: switch on = archive a log over
  100 MB, one archive per app run (the engine holds archived lines until relaunch).
- The fold ignores `PollStats.restarted`: only truncate-to-empty or whole-file move is clean.
- Log discovery is `/^eqlog_.+\.txt$/i`, non-recursive: an archive must not match it.
- `tests/e2e/log-archive-trial.mts` (not in the suite) runs the whole flow on a log copy.
- Open: a missing middle ledger can read "complete"; kills before the fresh log's first zone line
  file under unknown zone.

## sidebar-groups

- One `GROUPS` table in `NavDrawer.tsx`. A branch that adds a tab places it in a group at its
  merge into `main_community`. Maps under Research was an agent's choice; the owner never placed
  it.

## test-neutering (identity)

- The community build is a continuation, not a test of the official app. Nothing points a user at
  the official app by default; the original is credited, clearly labelled "no longer updated".
- Open: sweep remaining links to the creator's repo; What's new entries for every test build
  (`communityReleaseNotes.ts` proposed, separate from the creator's `releaseNotes.ts`); notes for
  test.1-12 are under tag `archive/local_all_changes_testing-2026-09-15`, test.6/7 as
  `local test:` commits.

## installer-size, deps-refresh

- installer-size sits on top of deps-refresh (lockfile rewrites cannot text-merge). Remake on the
  new tip if deps-refresh moves: move the packages, `npm install --package-lock-only` on Node 24,
  diff must be only dev flags.
- Measured, left out: en-US-only locales changes formatting for other locales; `compression:
  maximum` is byte-identical.
- typescript-eslint >8.65 and onnxruntime-node 1.29 are pinned back on
  `community/pr-70-npm-minor-patch` (ADOPTIONS.md).

## gaps-tab

- The tab is UNRELEASED-gated (`unreleasedGaps.tsx`): dev builds only.
- Review and decisions: `audits/2026-10-19-gaps-review.md`. Laws from it (owner, 2026-10-19):
  instance tiers are one place and one item (`+N` folds to the base everywhere; zones are written
  as the wiki spells them, `shared/gapWikiZone.ts`); a rate is corpses over kills, no rate when
  drops exceed kills; a capped "better" faction line is a raise; `* None` only where the log
  proves none (credited kills, no faction line).
- One-word NPCs (`gaps_players.rs`): a hailed or conned one-word name files a Mobs row unless the
  log showed a player (chat, tells, group joins, `/who`); it is "may be a player" until an answered
  hail or a revisit in the same zone 10+ min later; "Mark as player" is a per-viewer list
  (`eq.gaps.players`). Measured: no catalog NPC sends tells on Legends (77 tellers, 0 in the catalog).
- Loot fields: `mobs.json commonDrops` is the page's `|common_loot`; Drops counts both fields and
  dropGroups.json `aliases` (redirect titles); Copy wiki page files a name under common_loot when the
  wiki does on 3+ pages and more often than under known_loot (`commonLootNames`).
- Spell pages fill from the install's spells_us.txt / spells_us_str.txt (`src/main/gapSpellFacts.ts`,
  owner 2026-10-19). Level 254 (AA rows) and 255 mean no scroll; the other-person message is joined to
  "Someone" as it stands (`'s skin` or ` staggers`).
- Rows: Done marks are per viewer (`eq.gaps.done`, dropped when the row leaves the snapshot); a
  faction, drop or image chip opens the catalog page title picked by zone (`shared/gapMobPage.ts`).
- Held now (C6, `shared/gapHeld.ts`): the last `/outputfile inventory` export through
  `useGearOwnership`, plus kept loot since (`computeHeldCountsAfter`), less destroys since; no
  export, no claim (a loot line cannot tell a copy held from one sold). Items domain only.
- Soldby (D1): `{{ItemWhereTable|` rows laid out byte-for-byte as the 1,247 cached pages write them
  (`{{ItemWhereRow   | ` prefix, zone cell 34 wide, vendor 30, empty third cell 15, `(ns, ew)`, an
  unknown loc `|  }}`); a vendor's loc only when its catalog page states one point (the wiki's row
  matched a multi-point page's first point 113 of 426 times). `vendorFinder` in `gapMobPage.ts`.
- Owner answers to the review leftovers (2026-10-19): C7 map link dropped (an unknown mob has no
  location); E4 turn-ins not built (an offer is not an acceptance). The row's work buttons also sit
  on each row as icons (`GapRowButtons.tsx`).
- Copy wiki page (`shared/wikiPage.ts`): a page holds only fields the log fills, no placeholders, no
  blueprint option lists (owner, 2026-10-18: "each item page has FAR less than that"); `statsblock`
  stays open for the player's screenshot. Blueprints:
  https://eqlwiki.com/Help:Contents#Item_Page_Blueprint, #NPC_Page_Blueprint,
  #Merchant_Page_Blueprint, #Spell_Page_Blueprint. Model output on real cached pages (Fire Beetle
  Eye), not on the blueprint.
- Drop rates go on the MOB's page, per `known_loot` item and per group line, as the wiki's own
  spans: `<span class='drare'>(Rare)</span> <span class='ddb'>[Overall: ~12.5%]</span>` (owner,
  2026-10-18: the drare word from the bands the wiki's 9,806 lines use); never the wiki's
  `[1] 4x 55% (20%)` (loot tables, not in any log). A group line's rate is the corpses that dropped
  ANY member over the mob's kills; no kills or more drops than kills leaves it off.
- Corpse coin (`gaps_coin.rs`, `mobCoin`): Legends pays at the kill, `You receive ... from the
  corpse.` in the kill's second (5,576 of 5,689 lines claimed by a death within 2.5 s); a page gets
  the wiki's `MONEY DROPS` block (min - max per coin, the 406 cached blocks' colors and words).
  Never "NO MONEY DROPS" or "no loot": the game prints nothing for a coinless kill or an empty
  corpse, and rare payers are real (a basilisk paid on 2 of 103 kills), so no count proves none.
  `mergeGaps` joins it per mob (log-archive).
- Zones the wiki titles differently: `ZONE_ALIASES` in `shared/gapWikiZone.ts`; Temple of
  Cazic-Thule links `[[Cazic Thule (Zone)|Cazic Thule]]` (plain `Cazic Thule` is the god's
  disambiguation page) and files `[[Category:Cazic Thule]]`. The owner is asking the wiki's editors.
- `PLAYER_LEVEL_CAP = 50` (`gaps_players.rs`): a con above it makes a one-word name an NPC for good.
  Raise it when an expansion opens levels.
- Hide uncertain (`uncertainGap`, `eq.gaps.hideUncertain`, off by default): only "may be a player"
  rows; a near miss, a faction with no direction, an unpicked drop page and a cache verdict are real
  gaps with an unsure detail and stay.
- Not from the log: stats, slot, icon id, quest rewards, foraging, normal merchant sale price
  (Gaps keeps only the sale-on-loot), a merchant's stock. A merchant page needs a purchase
  tracker (asked, not built).
- The sale-on-loot note shows only the vendor value (= the game's Value line); the derived base
  price is not shown (owner read it as a wrong Value).
- Group by zone, then mob (`shared/gapGroups.ts`): an item under every (zone, mob) the loot ledger
  saw drop it; index the ledger once (a per-row scan over 500 rows is the lag shape).
- Event log `unknown` flag (`event_feed.rs`): an unknown pickup is admitted, a player-shaped con is
  never flagged, and the overlay never looks up an unknown item (that lookup asks the wiki).
- Merchants and Factions domains: the engine's `gaps_trade.rs` reads price quotes (`X told you,
  'That'll be ...'`, kind `unknown`), purchases and vendor sales, and pairs each death with the
  faction lines printed in the 2.5 s before it (`killFactions`); `shared/gapFactions.ts` checks the
  pairs against mobs.json `factions` (both page lists; spelling folded: case, a trailing period, a
  leading "the"). mobs.json `merchant` and `factions` come from `mobPage.ts` (wiki-scraper-fixes).
- Drops missing from a mob (`shared/gapDrops.ts`): mob pages link groups (`[[Rusty Weapons]]`) instead
  of their items; `scrape-drop-groups.ts` reads the 265 non-item drop-list pages and keeps the
  members written as a `{{Gear Set|...}}`, bullets, `<li>` items or table cells (spell, item and mob
  pages are no group): 52 groups on 2026-10-18. An item in a group is filed as the group (owner's
  rule). Data and page cache live on gaps-tab, the reader.
- Images domain (`shared/gapImages.ts`): a met mob (kills ledger or a loot source) whose every page
  is `noImage` in mobs.json. `noImage` is written by `scrape-wiki-files.ts` (wiki-scraper-fixes)
  against the cached file list (local-data-refresh); a re-parse of a mob page drops it, so the delta
  re-marks after every fold. 6,364 of 7,954 pages name a file nobody uploaded: only met mobs show.
- Drops reads both sides of the wiki's tie: the mob page (mobs.json) in the renderer and the item
  page's dropsfrom from main (`gaps:itemMobs`, `src/main/gapItemMobs.ts`; items.json is main-only).
  The server-wide rule waits for main's answer, so a half answer never hides a real gap. Measured
  2026-10-18 on the live log, 1,038 rows: 209 Motes and Treasures, 193 with the item page naming
  the mob, 98 on mob pages listing no drops, 538 the wiki has nowhere. Tier instances add loot the
  wiki's mob pages do not cover (Befallen 4 Refined), so many rows come from them.
- Found by that fetch: 142 of those pages are full `{{Itempage}}` pages that items.json lacks (e.g.
  A Shining Stone, A Piece of Rat Fur): the item scrape misses them; not yet looked into.
- The wiki's Help page (Editing Standards > AI Generated Content): "All graphics and readable page
  text should be crafted by real human contributors". Told the owner about Copy wiki page.
- No generated merchant item list (owner, decided): vendor stock and player resells cannot be told
  apart, and quoted prices carry the player's faction and Charisma.
- `event_feed.rs` is 431 code lines: red on this branch alone against the old 400 bar, green on
  `main_community` (catch_all's 440). The npm gate does not run the size check on the real tree.
- "I have it" (`eq.gaps.heldOnly`, off by default): Items only; filters through `useHeldOnly` before
  Hide uncertain; on gaps-overlay that lives in `useGapsList`, so the overlay follows it. No
  export, no Items row.
- Days back (gaps-all-characters) chooses rows only: `ownSince` cuts the engine rows, the join cuts
  each character's rows, loot and kills stay whole, and `useGapsData` `inWindow` applies `gapsSince`
  to the derived list (drops, factions, images) once built. Counts and drop rates read the whole
  log; an archive that ended before the window is still left out whole. One memo slot per copy
  (`lastShown`, `lastShownOnly` on gaps-overlay): a fresh array misses `snapOf` and a Gaps visit
  costs 400-500 ms again. Held is never cut.
- All characters "Seen by": engine forage rows are noted under `item|name`, the Items row they become.
- Forage update rows (`shared/gapForage.ts`): the engine files a KNOWN item's forage under domain
  `forage` (served after the four, no total); `withForageRows` always removes those rows, and an
  Items row with `forageUpdate` stands in for each page that lacks something. Zones compare by
  place through the zone table, never by spelling (`Northern Karana` = `Northern Plains of Karana`).
- items.json `foraged`, `foragedNote`, `foragedCategory` exist only on local-data-refresh:
  `main/gapItemForage.ts` declares them locally so gaps-item-facts builds without them.
- `itemLookupParse.ts` is 421 code lines: red on wiki-scraper-fixes alone against its old 400 bar,
  green on `main_community` (catch_all's 440).
- Job rule: `shared/gapJob.ts gapJob` is the one classification. Faction, drop and image rows are
  updates; a merchant is an update when `isMob`; a `forageUpdate` row is an update; a faction row
  with `noPage` stays an update (the mob's own row is the new page).
- Held picker places: `gapHeld.ts SIDE_OF`; `HeldPart.place`; `heldCaption` takes `{ index, where }`;
  stored values `1` (Anywhere), `0`, `bags`, `bank`.
- Drops (2026-10-21, reversed the same day): an item in a group is always filed as the group. A page
  listing members one by one gets `replaces {lines, rate}` on that group's row only when it lacks a
  looted member, as an optional cleanup; never a row of its own (no edits for formatting alone).
  `CatalogMob.dropRates` (parallel to `drops`) is read when present; no data carries it yet.
- Images: named and filed after the log's spelling of the mob met (`npc_a_cave_bat.png` for met
  `a cave bat`, though the page A cave bat says `|name = a giant cave bat`); never after the page's
  `|name`. When two spellings reach one page, the one that is its title or `|name` names the row.
  `pageImage` when the page's imagefilename differs; qualified titles keep the page's file. Row
  names equal the con title, so a Done mark also quiets the Event log tag. `imageAction` sits below `factionAction`, as on
  gaps-item-facts; merging gaps-tab into main_community replays a rerere resolution in `gaps.ts`.
- Common forage: `gapForage.ts COMMON_FORAGE`; 6 -> 2 rows on the owner's logs.
- Saved Gaps files carry `rows` (SAVED_ROWS). Raise it whenever the engine serves a new kind of row
  an older save cannot hold.
- gaps-item-facts alone: `gaps.ts` is 404 code lines against its old 400 bar; green merged.
- The app has only a dark theme: the job tags use palette `secondary` (New page) and `primary`
  (Update page).
- Merging gaps-item-facts forward conflicts in `gapDerive.ts` (keep `only`, always run
  `withForageRows`, add `met.itemForage` to `keyOf`), `wikiPage.ts` (`row.forageUpdate ?
  forageAddText(...) : itemPage(...)`; NEEDED_OF `[]` for a forage row) and `useGapsData.ts` (forage
  names from the snapshot the derivation receives, the joined one under All characters).

## screenshot-to-wiki

- Plan and measurements: `plans/2026-10-20-screenshot-to-wiki.md`. Off `gaps-tab`, recipe after
  `gaps-overlay`. Main: `src/main/shot/` (Electron-free) and `src/main/ipc/shotIpc.ts`; the window
  to wiki mapping `src/shared/itemWindow.ts`; UI `features/gaps/ShotPanel.tsx`, kept readings in
  `itemShotsStore.ts` (`eq.gaps.itemShots`); `wikiPage.ts itemPage(f, shot)`.
- Game art is never committed or shipped: the icon index is built from the player's
  `uifiles/default/dragitem*.dds` and cached as `userData/item-icon-index.bin` (fingerprint: sheet
  count, bytes, newest mtime). Tests use synthetic sheets; the real-icon tests skip without an
  install (`EQ_ROOT`).
- Icon id = 500 + (sheet-1)*36 + col*6 + row (column-major). Sheets are DXT5, one DXT3 (323), two
  A8R8G8B8 (9, 302).
- The background view with the LOWEST best score wins, never the widest margin: by margin a
  meaningless near-tie on the raw sky beat the real answer (Malkil's sky shot).
- OCR: TSV output, never `blocks` (the tree of a big window overflows the worker message, "Too many
  properties to enumerate"). Scale by area, ~3 MP: 1x read `DMG: 90` as `920` on Malkil's window.
  Input as an 8-bit gray PNG (`grayPng`, node zlib): BMP went through tesseract's JS decoder, slow.
- Never guess a number. Two measured repairs only: Weight's one decimal (lost on 3 windows of 3), and
  DMG against the window's own Ratio and Delay (the player is told in `checks`).
- Locate the icon from the `Class:` and `Race:` WORDS (`OcrLine.lead`), not the line box: OCR reads
  the icon beside the text as junk (`| Class`, `8 Quest`) and stretches the box over it.
- Packaging: `electron-builder.yml` keeps the three FULL tesseract cores (`tesseract-core{-relaxedsimd,
  -simd,}.js` + `.wasm`) and `4.0.0_best_int`, and drops the `-lstm` cores, `*.wasm.js`, `dist/`,
  `zlibjs` (browser only) and `4.0.0`. TRAP (2026-10-21): tesseract.js 7.0.0 under Node always
  loads the full core (`getCore(lstmOnly)` gets a boolean its OEM test never matches); the first
  dist kept the `-lstm` ones and the packed app could not find its core. Dev and `npm test` never
  show it (every core is in node_modules). After any change to these lines or a tesseract bump,
  run OCR inside the packed asar: `ELECTRON_RUN_AS_NODE=1 "<win-unpacked>/EQ Legends Companion
  TEST.exe" <script>` that `require`s `resources/app.asar/node_modules/tesseract.js` and
  recognizes a small PNG (2026-10-21: 161 ms, installer 139.5 MB).
- `tests/shotScreenshots.test.mts` runs the real OCR (~12 s with the icon checks).
- What a paste keeps is pure and tested (`shared/itemShotKeep.ts`, `shared/mobPicture.ts`): a paste
  with nothing usable keeps nothing; another item's window waits for Use it anyway; a window paste
  replaces every window field, a Lore paste only the lore. Merge against `itemShotNow()` (the
  store now), never a render's copy, and ignore pastes while one is being read.
- Nothing in `shotPicture.ts` throws to the renderer (a failed write answers `{ status: 'error' }`,
  `pictureFiles.ts`), and every renderer call has a `.catch`/`.finally` that clears the spinner
  (review, 2026-10-21). Async answers in `MobPicture.tsx` go through `latestOnly` tickets; the
  nameplate check takes the save's `checkId` (main keeps that one decoded picture), never the bytes.
- Main writes only `.png` (`pictureFileName`), and deletes only files this run saved.
- `.npmrc` audit note is stale (review, 2026-10-21): tesseract.js brings
  `opencollective-postinstall` (`hasInstallScript`), suppressed by `ignore-scripts` and harmless
  (a donation banner), so the file's "SIX" install-time hooks are now seven. `.npmrc` is the
  creator's file: left as it is, recorded here.
- The icon box is placed from the `Class`/`Race` word itself (`ocr.ts` `LABEL_WORD`): OCR junk off
  the icon can be a real-looking word (`By`).
- Auto-find anchor: the selected tab's yellow label, `max(r,g)>=100 && b*3<r && g>=0.6r`; its height
  sets the scale. Each yellow word's own text is OCR'd first (a crop, ~10 ms) and only `Description`
  / `Lore` (`isTabWord`) gets the full read: by shape alone, chat titles, map buttons and gauges
  outranked the tabs (owner's screenshots 2026-10-22: tabs 10th-11th of 24). Up to 60 words, 10
  windows. Sides (`sideCol`): the NEAREST column whose step holds on 80% of rows 3-16 label heights
  under the label, at least 0.6 of the steadiest in reach; never the strongest (a neighbour window's
  frame, 97, beats the own, 85) and not 3-10 heights (the icon fills most of it). The bottom is the
  first edge below which the sides stop. A spell window has no yellow tab: no anchor for it yet.
- Name line: a 1-2 character first token is dropped when the rest equals the title bar
  (`iconJunkDropped`: `S Halfling Blood`; `5 Dose Potion of Cold` keeps its 5).
- Capture triggers: no `globalShortcut` (a test sweeps the source). Macro `/echo eqc capture`: main
  adds an alert definition of its own, `eqc-shot-capture`, to `alerts.define`
  (`dataServer/ownFires.ts`, `withOwnDefs` at the engine host's send site) and takes its fire in
  `noteFire` before any sound. Line rule and gate in `shared/shotTrigger.ts`. Overlay:
  `SHOT_CAPTURE_ACTION` with `OverlayHeaderAction.whileLocked`.
- `/echo` is not yet seen in any of the owner's logs; the bare-text line format is assumed. First
  live test: check the line appears.
- `readCapture` returns `windows[]`, every window found.
- Spell window: Reuse is never written (whole seconds on the window); a bracketed value is the
  modified one and never written.
- Capture trigger (rebuilt 2026-10-21): the player's own `You tell eqc…:<n>, 'eqc capture'`; a second
  watch of the app's own (`eqc-shot-channels`) keeps the latest `Channels:` line; IPC `shotChannels`.
  `/echo` does not exist in the game; `/tell <self>` logs no text.
- Nameplate check (`shot/nameplate.ts`): the picture as it stands, then near-white, then bright text.
- Spell rank read against the row's name (`rankAfter`); `Resist: X -N` writes X.
- A filled exaltation slot keeps its kind of effect off the page (no catalog at read time).
- Review fixes (2026-10-21): the Class line = line start plus a colon or a code, a window needs
  Class/Race codes, a Lore's prose may say "class"; Range +10 per tier is inverted in
  `itemDelevel.ts` by key (catch_all's `scaleRange` is not on this branch); a classic numeral spell
  (Clarity II) is told from an upgraded rank by the install's spells_us (upgraded ranks are not rows
  there); the name check allows two OCR slips but never a digit change and never when another known
  name is as near, and a capture files at once only on an exact name; forage update rows take no
  shot (`isItemShotRow`); capture takes only a window titled exactly `EverQuest Legends` or
  `EverQuest` (the owner's client: "EverQuest Legends"), the thumbnail is at most 16 MP from the
  largest display, and an OCR read times out at 60 s and restarts the worker.
- Ready (`shared/gapReady.ts openNeeds`): a row's `stillNeeded`, less a mob picture saved from the tab
  (`eq.gaps.mobPictures`, keyed by `pictureFile`); an Images row needs its picture; a redirect needs
  nothing; `stillNeeded` asks for the Lore tab when a kept window showed one. `useGapReady` (inside
  `useGapsList`) reads every page input once; readiness is read only under Show: Ready, so a kept
  shot never re-filters the other choices; it never reads the loot ledger.
- Capture results (2026-10-21): the bar is one line of instructions plus a status mark
  (`IPC.onShotCapturing` drives the spinner); a reading's checks live on its row
  (`setCapturedRead` / `useCapturedRead`, in memory); `unplaced()` drops junk under 4 letters.
- Every failed paste goes through `shotProblem` / `spellProblem`; every name check through
  `otherItemNote` (an unread name asks, never passes).
- Spell icon = spells_us field 76; description id = field 86 into dbstr type 6; colour tags dropped,
  `<BR>` to `<br>`.
- D3: Weight's ceiling is many-to-one, so most +N items over 0.1 weight get the warning, not a guess.
- Fixtures: every game screenshot the owner or a tester sends (item, Lore tab, spell window, mob
  picture) is committed to `tests/fixtures/shots/` on this branch with a test (owner, 2026-10-21:
  "they should be saved into the repo for test images for unit/regression testing"). Screenshots of
  the app itself are not fixtures. An image sent while the agent is mid-reply is not written to the
  session's `images` folder (Claude Code in VS Code): describe it to the agent and ask the owner to
  re-send it after the reply, or to save the snip as a file and give its path.
- Not built: the glyph-exact reader (D2); tesseract reads every fixture.
- Picture root = live autoDir, else live lastDir, through `pictureRoot` (a kind's folder stands for
  its parent; `lastDir` is saved as the root). Mob -> `<root>/npc`; item/lore ->
  `<root>/item/item_<n>[_lore].png`; spell -> `<root>/spell/spell_<n>.png` (`keptPictureFile`). Item
  and spell copies are overwritten with no prompt; `IPC.shotKeepPicture` answers `off` with no folder.
- Held = `heldPicture`: the folder listing (`<root>/npc`, then `<root>`, any case) wins; a saved-store
  entry whose path is in a listed folder but missing from it is not held. Main lists via
  `IPC.shotFolderPictures`; `folderPicturesStore` re-reads on mount, focus, after save/delete/folder
  change, and the overlay every 30 s. The player's files are never moved, renamed or deleted.
- A capture's `Captured.png` is that window's crop (`windowPng`) and rides `CapturedRead.png`, so "Use it
  anyway" keeps it too. Pictures are written after the reading is kept and never block it.
- Overlay code imported by tests uses relative `shared/` imports, not `@shared` (`feedGapTags.ts`).
- `shotIpc.ts catalogNames` includes each item's `otherNames` (wiki redirects).

## Page notices (cross-branch)

- `src/shared/pageNotices.ts` reads `{{DNE}}` and `{{delete[|reason]}}` (comments and nowiki skipped) into
  `notices: ["DNE" | "delete" | "delete: <reason>"]`; byte-identical on wiki-scraper-fixes and
  scrape-delta-tool. Written by `mobPage.ts`, scrape-items and the delta's `deltaItems` (an edit that
  removes the notice drops the field). Spells need none.
- Notices domain (gaps-tab), engine-filed: `gaps_notices.rs` (child of `gaps.rs`); `GapIndex.item_notices`
  / `mob_notices` from `gap_index.rs`, the mobs off the corpus's `MobIndex` (never `MOBS_JSON` directly:
  catch_all embeds that text once, in the fold crate). Row key `<item|mob>:<page lowercased>`; serves
  `page`, `notices`, `subject`. Renderer: `gapNotices.ts noticeAction`, `wikiPage.ts noticeProof` (Copy
  proof), `gapJob` treats `notice` as an update; `GapRowButtons.editorOf` opens the page's editor.
- The forage test (gaps-item-facts) checks its four totals by name, so a new domain does not break it.

## Wiki redirects (cross-branch)

- A redirect is a fact about the wiki, not about mobs: it applies to every catalog (owner, 2026-10-22,
  after the 2026-10-18 ask was built for mobs only). The cached list
  (`scripts/sources/cache/redirects/redirects.json`) becomes the `otherNames` of the record whose page
  it lands on: mobs.json, items.json (every key of the page), spells.json; and every redirect to an
  item page is a dropGroups.json alias. Target matched case-insensitively; a name with a record of its
  own is never another's.
- Writers (`scripts/sources/mobRedirects.ts`): scrape-mob-redirects (`--offline` re-applies the cache to
  all four files), scrape-mobs, scrape-items, scrape-spells and scrape-drop-groups apply the cache on
  write; the delta (scrape-delta-tool) folds the cache first, then applies it to items, spells and the
  drop aliases (written only when a name changed).
- Readers, each filling only FREE keys: engine `knowledge::gap_index` (Gaps item check, near-miss
  candidates, event-feed offers), `knowledge::Corpus::item_db_key` (item answers), `gaps_keys::spell_keys`
  (Gaps spell check, its own light parse of spells.json); app `itemsDb.buildItemDbIndex` (itemLookup,
  character sheet), `itemOtherNames.itemsByAnyName` (gapItemMobs, gapItemForage, mobDropEra,
  wornFocusIndex); `gapDrops.filedAs` reads a looted name through the aliases; `shotIpc` catalog names.
- Safeguard (gaps-tab): `GapIndex.item_redirects` / `mob_redirects` (spells from spells.json otherNames) kept apart
  from own keys; `ItemIndex::with_redirects`, `MobNames::with_redirects`, `spell_via_redirect` name the target only
  when the name has no record of its own and the redirect is more than a respelling (`gaps_keys::same_name`).
  `gaps_redirects.rs` files it with `viaRedirect`; `gapRedirects.ts`; uncertain, an update, nothing needed. `known()`
  still counts redirects (event feed and the rest unchanged). A wrong redirect is fixed on the wiki; the next delta
  drops it from the cache (Halfling Blood, 2026-10-22).
- Not read: walks over every item (planner indexes, zone ports, clickies) keep the file's own map, so no
  page is visited twice; Spells search leaves the redirect shorthand (`DT`, `Dmf`) out.

## Unassigned open items (no branch yet)

- A chest-only item's Dropped by column still says "You have not looted this yet." while Times
  looted counts the payouts (catch_all (68) notes them on the Distinct mobs card). The line is in
  `ItemDroppedBy.tsx` on gear-tab-improvements; the dialog that knows the chest count is catch_all's.
  A small two-branch change: an optional empty-state prop there, passed from the dialog here.

- The Recommended tab ignores layer-3 era derivations on purpose (`progressionPlan.ts`
  `eraLegal`).
- The Exaltations browser has no deity gate; the bagged-gem `where` label is unclear.
- Spell page ladder base carries no magnitudes.
- `INVULNERABLE` miss form, outgoing damage-shield absorbs, environmental non-melee hits: no fold
  arm.
- Rust ProcBuff duration floor 0 vs measured growth (the creator's deliberate floor).
- `tests/e2e/sky-inventory-autoload.e2e.mts` was red on `main_community` independent of any
  branch (2026-09-25, geometry "counts top was 280, now 336"); unknown on plain main.
- Buff tracker, by design (tell testers): two same-named mobs debuffed in different seconds merge
  into one row; a 30-minute quiet with no login line wipes every row; zone lines clear all
  debuffs.
- Group-inviter roster: after "You have joined the group", the inviter is not credited until a
  group-chat line (owner: leave for now).

## zone-history

- Built on map-improvements + coin-and-deaths (its first two commits merge them).
- `zoneHistory.ts` rates are per ACTIVE hour; the Leveling table's new columns follow its rate
  basis like its other rates, and every rate sort orders by the active-hour value.
- `tests/e2e/maps.e2e.mts` "the map row never moves or resizes" fails on this branch with or
  without its Maps change (measured 2026-10-13): a red of the base, not of the new tab.

## sky-quest-overlay (bases on fix-sky-turnin-undo + item-hover-cards)

- Data path: AppCelebrations' always-mounted `useProgress` -> `useSkyOverlayFeed` -> localStorage
  `eq.skyOverlay.rows` (written only on change) -> the overlay's `storage` listener. No IPC. The
  key is the main window's data, defined in `src/shared/`, so `tests/mapPinsReset.test.mts` (which
  scans keys defined in `overlay/`) does not see it and an overlay reset must not clear it.
- "Favorites" here means quest stars (`eq.questFavorites`). The Quests tab's "Favorites only" also
  shows quests that merely need a starred ITEM; the overlay does not list those (2026-10-16
  reading of the ask, not an owner ruling yet).
- Item icons: the feed asks `items:marks` (committed DB only) and puts `iconId` in the payload. Never
  `lookupItem` from the overlay: it falls back to the wiki on a DB miss.
- "Count items from" is a per-window store (`useCountSource.ts`); a new `useProgress` reader
  follows the tab's pick with nothing extra.
- Merge with `map-waypoints`: `OverlayKind`/`OVERLAY_KINDS`, `OVERLAY_KIND_LABEL`/
  `OVERLAY_LABEL_ORDER`, `OVERLAY_TITLE`, `DEFAULT_OVERLAY_CONFIG`, `OVERLAY_MENU_ROWS`,
  `overlay/main.tsx`, `UNREPORTED_OVERLAY_KINDS` and the hot-zone / appearance test lists each
  conflict on one line: take both, `mapPins` first. In `TitleBar.tsx` keep main_community's
  `OverlayResetDialog` import where this branch has none.
- Branch-alone reds (2026-10-16): `resistBaseline.test.mts` Nagafen and Zol Ghoul Knight, red on the
  untouched base too (the base carries main's data, not local-data-refresh's).
- e2e: `tests/e2e/sky-quest-overlay.e2e.mts` (window opens, a searched quest starred by the Quests
  tab checkbox reaches the overlay, the second click unstars). Open: the Ready tab checkbox has no e2e.
