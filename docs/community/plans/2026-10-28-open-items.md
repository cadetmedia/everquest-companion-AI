# Open items after the 2026-10-27 sweep

State at 2026-10-28 evening: the 2026-10-27 work and the 2026-10-28 wiki delta are pushed and
tagged `community-0.1.0-test.36` (owner: "get a release out"). Nothing checked in the running app
yet.

## Waiting on the owner

- Fork #4: test.36 ships the buff fix; close with a comment once the release is published.
- Maps: the travel card now floats over the map's top-left corner. OK there?
- Map pins overlay: Slayer area labels always on, or hover-only like point names?
- Font reader: ~0.5-1 s slower per paste at 1.5x UI scale. Accept, or stop waiting once OCR ends?
- Font reader on spell windows: measure on the spell fixtures first, then decide.
- Tradeskill Ingredient rows bump `SAVED_ROWS` to 3: saved characters read "needs refresh" until
  logged in once (as the forage rows did). Accept?
- Spell-name corrections (audit 2026-10-11 §4): not made; `spells_us.txt` contradicts two of three.
  Re-measure on a full log, or drop.
- Cracked Darkwood Shield: the one item page missing from items.json. Fetch in the next top-up?
- Fork #2: the owner's OCR-the-Currencies-tab idea is ledgered as an idea; ruling "leave it" stands.
  The reporter's 2026-10-28 suggestion (ignore runes in the export, loot adds, turn-ins remove) is
  mostly what "Both (higher of the two)", the default, already does; the gaps are in the ISSUES.md
  row. Owner to say whether any gap is worth closing.
- Drake Lava Powder: in the wiki's pack, never listed by our scrape (`eoz-compare --release`
  "look by hand", 2026-10-28). Check its page's categories before the next delta.
- Wiki edits for the owner: Enynti `| respawn_time = 8:50`, restore Sulgar, Clockwork Merchant `|name`.
- Unconfirmed changes: meters update 1/s in a fight; `heal-*` overlays character-aware; a charm
  bind still ends at the zone line.
- The `UNRELEASED` gate: ruled 2026-10-28, always open ("no reason to hide them ever just always
  show the tabs"). Both halves are pinned true. Left: remove the gate's ~128 call sites (48 files)
  as cleanup; no player-visible change.

## Candidate work (owner to pick)

- Count-pinned census tests (owner, 2026-10-28: "having random count tests is a bit dumb it forces us
  to update the test every time because counts change"): replace exact corpus counts with
  property checks or floors so a wiki delta stops turning tests red. Not urgent; a future change.

- From the competitor scan 2026-10-27 (EQBuddy, eqltools, Loadout Legends, SEQO, eql-log-reader,
  eql-tooltip): death recap (easy), friends online from `/who` (easy), item lookup hotkey via the
  existing OCR (moderate), AA planner (data only), phone/tablet second screen (moderate, EQBuddy's
  edge), leaderboards/profiles (needs a backend; skip for now).
- From EQL-EOZ (the wiki owner's own Electron companion, `Maergoth/EQL-EOZ`, v1.0.9 2026-10-27,
  several releases a day), scanned 2026-10-28. Read as data; nothing of it is run.
  - No network, cheap: heading arrow on the 2D map marker (last two logged positions); "crawl
    mode" (dim mobs you killed on the map and loot list until you re-zone); melee swing timer;
    overlay polish (drag a docked overlay to detach, a hotkey to recover overlays, any installed
    font); character sheet as a PNG (copy/save).
  - No network, moderate: item links seen in chat checked against the pack's `wikiEntities.titles`
    (all 26,607 page titles) for a live "wiki is missing this" note beside Gaps; a zone & loot
    overlay (raid sources first, row jumps to the mob on /con or kill); check our upgrade maths
    against the wiki's own item tier formulas (`Maergoth/EQLWiki`); Linux AppImage build.
  - Needs network (owner's sign-off, rule 15): publishing to the wiki from the app (login,
    preview, publish) instead of Copy; uploading drop observations; the pack refreshed in the app
    between releases; a character sheet on the wiki User page.
  - Hard, no network: a 3D map from the client's own zone files, routing that respects walls.
  - Pack fields we do not read yet: NPC `loc` (7,644), level range, race/class, raid flag; item
    effect blocks and drop-count completeness; 279 `lootSets`; `wikiRelationshipCoverage` (19,593
    records of missing or unparsable sections per page). Hints only: DATA_REFRESH.md keeps our
    data from the wiki itself.
  - Ours, not theirs: respawn timers, DPS timeline and proc breakdowns, buff timers, voice/sound
    alerts, Sky tracker, bazaar watchlist, factions, spellbook and loadouts, AA/leveling ledger,
    bosses of the week, exaltation optimizer.
- Performance audit 2026-10-20 leftovers: an engine "met" module (loot/kills re-fetch per kill), one
  engine connection served in order.
- Major dependency bumps (`requirements/deps-refresh.md`), one branch each.
- Next wiki delta before ~2027-01-16 (the wiki keeps ~90 days of changes).
