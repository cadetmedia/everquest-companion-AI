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
- The Map tab's viewport state lives in `MapTab`, below `MapsTabs`: MUI Tabs re-measures its
  indicator (`getBoundingClientRect`) on every render, so the tab bar must not render per frame.
- Locked overlays are click-through except the header strip, so the pin overlay's clicks work
  only unlocked. Open: per-pin capture while locked.

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

## Unassigned open items (no branch yet)

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
