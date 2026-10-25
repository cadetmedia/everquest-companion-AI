# Agent notes: measured game facts and analysis methods

Facts about EQ Legends established from real logs, dumps, in-game screens, or the wiki's own
source. Cite these instead of classic-EQ folklore. Each says how it was measured, so it can be
re-checked. "Owner's log" = the owner's character log, Aug 2026 onward (multiclass WAR/MNK/SHM,
SK, others).

## Spells

- **Proc damage scales exactly 3% per rank:** `floor(base * (1 + 0.03 * rank))`. Puma Maw over
  the whole log: rank I 154 (n=3453), IV 172 (n=196), VI 181 (n=1735). Crits corroborate (400/154 =
  472/181 = 2.6).
- **DoT ticks: 3% per rank** (overturned the shipped 6%, which was fitted on nukes only).
  `scaleSpellDamage(amount, rank, perTick)`; a DD+DoT hybrid's direct hit stays 6%. Odium 387 ->
  445 at V, 468 at VII (exact); Envenomed Bolt 422 -> 473 at IV; Plague 180 -> 199 at IV. A
  constant-level window gave noisier reads (Plague 0%/rank), so treat DoT scaling as less certain
  than procs. To settle: cast rank I and rank IV of one DoT at one mob in one session.
  Write-up: `docs/plans/spell-upgrades-and-loadout.md` §0.9.
- **The healing rank rule (3% a rank, `healAtRank`) HOLDS on a same-day step** (2026-10-11): Superior
  Healing VII to VIII, non-crit, same gear, 48 and 27 casts: median 888 to 917 (+3.3%), p90 940 to
  970, max 961 to 985. A critical heal is exactly double (1,672 vs an 834 median) and the line ends
  `(Critical)`. The cross-week reading below is what to distrust, not the rule. On the owner's log
  Superior Healing's full heal (the parenthesised number of `You healed X for N (M)`) read 612 at
  rank I for weeks, then at rank IV alone climbed from 698 (8 Sep) to 870-943 (Oct) with no rank
  change: gear, focus or level move the heal far more than rank, and the August fit (892/943/968
  at II/IV/V) was taken during that climb. Read the HIGHER of the two numbers on every cast (the
  lower is the capped landing or the pre-crit value; owner, 2026-10-11): on a steady state, IV
  (Oct 6-8, n=140, median 834, p90 890) to VII (Oct 11, n=48, median 888, p90 940) is ~6% in
  total, about 2% a rank, and the heal now rolls within a range, so compare medians, not maxima.
  Do not re-fit from history: cast two ranks of one heal in one session on one gear state, ten
  overheals each, and read the two maxima. Until then the Upgrades tab overstates heal gains.
- **Form of the Bear:** upgrading buys only mana and duration. Stats window: +1 HP regen, +5 WIS
  with Bear IV up. A base of 1 cannot move under any rate. Shipped as `MEASURED_STATIC_MAGNITUDE`
  in `src/shared/spellUpgrade.ts` plus the `magnitudeCanMove` guard. Open: whether Chloroplast and
  Harnessing of Spirit behave the same. Known defect: the Upgrades tab scales a HoT's total healed
  by the magnitude rate, crediting duration growth twice.
- **The in-game tooltip never updates damage** with rank (mana/cast/reuse do update). Use the
  Stats window or a log line, never the tooltip, for magnitude.
- **The log states stacking verdicts:** `Your Dexterity spell did not take hold. (Blocked by
  Harnessing of Spirit.)`. 40 pairs are committed as `tests/stackGroundTruth.test.mts`; matching
  by EFFECT anywhere caught 40/40, the EQEmu slot-i-to-slot-i walk almost none. Ask the owner for
  more such lines when a stacking question is open.
- **Triggered spells stack too:** Form of the Great Wolf triggers spell 40593 (SPA 475) holding run
  speed in slot 2, so it conflicts with Bih`Li. The stacking check compares everything each cast
  lands (SPA 340/374/475, chance 100, id in `limit`).
- **Open stacking question (SPA 148 block directives):** a slot-specific reading
  (`other.effects[limit-1]`) fits all 52 blocks in the log and drops 21 false Augmentation-vs-AC
  conflicts; the shipped rule searches anywhere. Test in game: cast Augmentation, then Greater
  Shielding; if it lands, switch `directiveBites` to the slot.
- **Spell icons come from the client, no network.** `spells_us.txt` field 75 (0-based) is the gem
  icon id (field 76 is a decoy that renders a wrong tile). Sheets
  `<eqRoot>/uifiles/default/Spells01..63.tga`, 256x256, 6x6 grid of 40px tiles: icon `n` is sheet
  `floor(n/36)+1`, index `n%36`. Some sheets are RLE (type 10, e.g. Spells05); sheets 1-4 are
  top-down, 6+ bottom-up. Daybreak's art: read at runtime, never committed. Served at
  `eqimg://spell/<id>` by `src/main/spellIcons.ts`.
- **Client vs wiki names:** the client writes `O`Keil's`, the wiki `O'Keils`; keys fold backtick,
  apostrophe and typographic quotes. ~125 wiki spell names have no client row (Legends renames:
  Fay Gate -> Greater Faydark Gate).

## Items and upgrades

- **Elemental damage:** a stats block can carry `DMG: 11 Fire DMG: 3`. The parser names five
  elemental keys; `repairElementalDamage` re-parses stored blocks at load (`itemsDb.ts`), because
  `items.json` is one line with two copies and a data patch would conflict on every rebuild.
- **Range: +10 flat per upgrade tier.** Mithril Champion Arrows 150 -> 220 at +7 (game), 250 at
  +10; Blessed Champion Arrows 170 -> 270 at +10. Only arrows measured; bows assumed.
- **Penalties past -10 shrink 10% of |base| per tier**, reaching 0 at +10:
  `-10 <= base < 0` -> `min(0, base + full)`; `base < -10` ->
  `min(0, base + round(|base| * effective / 10))`. Stonemelder's Band DEX/AGI -35 reads 0 at +10.
  Source: the wiki slider `scalePrimarySpreadsheetStat`.
- **When an in-game number disagrees with the app's upgrade math,** diff the live slider source
  (`https://eqlwiki.com/load.php?modules=ext.itemLevelSlider&only=scripts&debug=true`, one
  request) against `src/shared/itemUpgrade.ts` first. The slider has moved since the creator's
  2026-08-12 port (Range, penalties). Keys the port calls "unchanged" (Attack, Dmg Bon, Backstab)
  are not re-checked.
- **Instant sale on loot pays base price / 1.4**, rounded to the nearest copper (2026-10-11, the
  owner's log: 9,129 `sold it for` lines, 806 priced item+tier; sale x 1.4 lands on a round gold
  figure for 222 of 224 sales of 20g or more; the same price at every tier for all 225 items seen
  at 2+ tiers). Real price = sale x 1.4. A vendor at the owner's usual standing pays base / 1.05
  = sale x 4/3 (80 of 95 gear vendor-sale lines); the vendor side moves with CHA, faction and
  merchant, the instant side never does. `for free` is base 0. The wiki's `merchant_value` is a
  hand-typed vendor offer on 964 pages at varying CHA (median 0.745 of sale, some authors typed
  the instant price itself): not a usable denominator. Two items can share a name at two prices
  (Gold Ring: 6g from Gynok Moltor, 12g in the Karanas). The 1.05 / 1.4 pair is classic EQ's
  best / worst vendor multiplier.
- **A free sale is not a price** (owner, 2026-10-11). A worn item is bound and a vendor pays nothing
  for it, so `for free` on a vendor-sale line says nothing about the item's value; an item that EVER
  sold for coin has that price. A loot-line instant sale was never worn, so `for free` there is a
  genuine zero-value item. Any price reading takes the most frequent priced sale and shows nothing,
  never 0, for an item that only ever sold for free (`derivedPrices`, shared/gaps.ts on gaps-tab).
- **Item DB:** `src/main/data/items.json`, ~11.5k items, keys lowercased names. Use it instead of
  wiki fetches.

## Exaltations (socketing)

- Gems carry their donor item's effect per socket kind. Dump child index: 7 Focus, 8 Click,
  9 Worn, 10 Proc, 2 Ornamentation (`SOCKET_TYPE_OF_INDEX`, `shared/planner/inventorySlots.ts`).
- The donor's SLOT must match the host's (belt gem -> belt). Donor CLASSES must overlap the
  host's, and socketing re-restricts the host to the donor's classes.
- Same-name effects do not stack: one per family, highest tier (roman numeral) applies.
  Exception: PROCS are per weapon; the same proc in Primary and Secondary both fire.
- Unknown: whether un-socketing is lossy. Never claim it either way.

## Stats, combat, procs

- DEX = proc rate + weapon/rogue skill-up speed + bow average hit only; melee hit/damage is
  STR/ATK. AGI below 75 is a large AC penalty. (eqlwiki Statistics page.)
- Measured proc rate: ~1.3% per swing, ~0.81 procs/min both hands (dual-wield WAR), below the Live
  formula the wiki carries unverified.
- Ranged characters get an AA to fire at melee range; the planner scores Ranged STR and ATK at 0
  (owner ruling 2026-09-26).
- Melee verbs: `slash` = 2H swing, `cleave` = extra 2H hits, `punch`/`claw` = H2H, `reave` = SK
  auto-special, `kick` and `strike` = the monk special lines, `bash` = WAR bash.
- Specials auto-fire. `You will now use X instead of Y while attacking` prints only on a manual
  change, and the choice can revert silently; `You have become better at <special>!` shows which
  one is firing.
- Slotting a low-level class lowers the DISPLAYED level and everything scaled from it.

## Progression and world

- **A respawn estimate is death-to-death, so it carries the fight** (2026-10-11, owner: timers 1 to
  1.5 min long). `respawn.rs record_death` takes the MINIMUM gap between two counted deaths of a name
  in one zone stay (not a median), raised to the wiki floor under the exact lowercased name. Lower
  Guk 4 (Refined): Hoptor Thaggelum respawns in exactly 570 s (death to first sighting, 569-571 s
  over seven cycles; the wiki says 9 min, and its floor sits under `the ghoul lord`, a key his name
  never matches), yet the estimate read 634 s because the group's fights ran 60-90 s; a reanimated
  hand and the ghoul arch magus read the same way. The archive refold and merge changed none of
  it (the respawn code is byte-identical to test.20). Fix to make: measure death to first sighting.

- **Death:** no XP loss. `Slain by <groupmate/pet>` means you were charmed
  (`You lose control of yourself!`).
- **Multiclass XP:** every active class gets the full amount; displayed level = lowest active
  class.
- **Personal-instance charges:** max 2, regen 1/hour. Loot/XP scale by difficulty tier (D0-D4)
  and solo vs group.
- **Instance tier is in the log:** `You have entered <Zone> <N> (<Word>).` with 1 Awakened,
  2 Adaptive, 3 Fused, 4 Refined. A `- Group` variant is the short 4-kill mission. Dungeon Crawl
  completion prints `You have completed the Dungeon Crawl and earned reward loot!`; its loot reads
  `... from Reward Chest`.
- **Motes:** grade order Infinitesimal < Minor < Lesser < Major < Greater (< Superior). Yellow/red
  cons drop ~7-10 per 100 kills vs blue 4.2, green 3.1. Player level caps grade (~1 tier per 5
  levels). Party XP lines carry the percent: `You gain party experience! (0.718%)`.
- **Con colours** (`src/shared/conColor.ts`) were measured by pairing each con with the HIGHEST
  "Welcome to level" so far (multiclass; the last ding is noise).
- **Faction:** the log prints numeric receipts (`has been adjusted by N`) and cap lines
  (`could not possibly get any better/worse`), no classic better/worse wording.
  `/outputfile faction` (singular) writes `<Char>_<server>-<CLASS>-Factions.txt` in the install
  root: TSV `ID/Name/StandingValue/PointsToMax`, standings clamped +/-2000. The con-rung floors in
  `factionTiers.ts` are classic community values, not measured.
- **Slayer counters** count by model race (a Ghost Dwarf counts as a Dwarf); `I'm a People
  Person!` counts only the true race; the Clockwork counter counts kills whose NAME says clockwork.
- **Log rotation:** the game opens the log by path per write. Moving the live log while EQ runs
  works; the game creates a fresh file on the next line.

## /outputfile dumps

- **Inventory:** the bank is always in it. Hoard and Personal Depot appear only after that window
  was opened this session (`inventorySource.storagesCovered` records which). The Currency tab
  (Wind Runes, motes) is never in it, so the "rebaseline" count source reads held currency as 0.
- Location `Equipment` is the Storage > Equipment TAB, not worn gear (worn gear is named slots
  and their `-SlotN` sockets). `Augmentation` = Storage > Exaltations; `Activated` = Activated
  Items; these rows have an empty Count. The Equipment tab is listed incompletely (62 of 68 rows
  once).
- **Achievements:** the dump holds what the window shows, following its Show/Complete checkboxes.
  `General: Keys` and `EverQuest: Keys` are printed twice.

## Analysis methods

- **Parity replay** (offline fold of a log): `cd engine && cargo build --release -p parity`, then
  `engine/target/release/parity.exe <log> [--snapshots]`. The file name must be
  `eqlog_<Char>_<server>.<tag>.txt` (an extra dot segment) or parity refuses. Each snapshot is one
  giant JSON line, so count with `grep -o <token> | wc -l`, never `grep -c`. Bisect a poison line
  by slicing the log (`awk '/^\[Sat Aug 15/,0'`) and replaying.
- **Unknown-line audit:** parity's NDJSON, bucket `kind:"unknown"` by template (digits -> N, chat
  collapsed) and by last four words, with per-week histograms; a format change shows as one kind
  dying while an unknown family is born. An audit of unknowns misses MIS-parses: replay and
  eyeball the fields too.
- **Rate fits from the log:** bucket by the rank printed in the cast/tick line, take the MODE per
  bucket (means are dragged by crits and partial resists), compare inside one level and one day.
  Tick magnitude is immune to death/dispel/recast; tick COUNT is censored downward, so use the
  mode. Cast time, reuse and mana are not measurable from the log (stance changes and AAs
  confound them).
- **Log segmentation:** split on `You have entered`, then count per segment (slain lines, party XP
  % sum, motes by grade, `+N` gear loots, crawl flag, dings). Level-up lines do not name the class:
  split into monotonic ladders and identify each by class-spell evidence.

## Known log gaps (not built)

- The spell DB is wiki-only: `spells_us_str.txt` (landing/wear-off text per id) is read by
  nothing; ~36k unknown lines are landings it names (all Legends-only 74xxx spells). Touches the
  creator's parse-purity law; a design conversation. Related to upstream #56.
- Unclaimed families: `Your <item> (Exaltation) flickers with a pale light.`, `<mob> tries to
  cast a spell on you, but you are protected.`, outgoing damage-shield absorbs (uncounted by the
  owner's 2026-10-25 rule: no damage passed). Claimed 2026-10-25: `You were hit by non-melee`
  (catch_all 71, the Environment row). Unclaimed and to count: `You have taken N damage from <Spell>
  by <mob>.` (3,618 lines, 361,188 damage).
- Ally pet binds drop on every zone line by design (`ally.rs zone()`).
- The engine has no checkpoint: it replays the whole log from byte 0 every start (the creator
  built one, JOS-208, and removed it, JOS-230).

## /loc is in the log (EQ Legends, 2026-10-18)

- `Your Location is -790.65, 173.39, -12.01` IS written to the log file on EQ Legends (6 lines in the
  owner's live log on 2026-10-18), against `features/maps/locMarker.ts`'s header, which measured zero on
  the creator's log. Order is /loc's (y, x, z), the same order the wiki's `|location` uses.
- The faction line on Legends is `Your faction standing with X has been adjusted by -20.` (or `could not
  possibly get any better/worse.`), printed just before the kill's death line, same second.
