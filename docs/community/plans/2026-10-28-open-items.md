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
  row. Owner, 2026-10-28: the higher-of-two count is not accurate; the ask reads as pure log
  tracking for runes (loot adds, any hand-over removes, the export ignored). Not built yet.
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
  several releases a day), scanned 2026-10-28, owner's answers the same day. Read as data; nothing
  of it is run.
  - Cheap, no network: heading arrow on the 2D map marker (last two logged positions); "crawl
    mode" (dim mobs you killed on the map and loot list until you re-zone); melee swing timer;
    overlay polish (drag a docked overlay to detach, a hotkey to recover overlays, any installed
    font); character sheet as a PNG (copy/save).
  - Zone & loot overlay (raid sources first, row jumps to the mob on /con or kill): owner, "could
    add it, not yet".
  - Upgrade maths checked against the wiki's tier formulas (`Maergoth/EQLWiki`): owner, do it now;
    their maths is not taken as fact, a disagreement is settled by our own data. Done 2026-10-28
    (branch fix-upgrade-math): three rules fixed on game windows (requirements/gear-tab-improvements.md).
    Open: weight at whole tiers (needs a +0 Windstriker or another weight reading) and whether the
    regens qualify Void.
  - Linux build (AppImage/.deb for Wine/Proton players): owner asked if it can be done. Assessed
    2026-10-28: moderate, mostly packaging. The engine builds as-is (one `cfg(unix)` read in
    `eqlog/src/tail.rs`), the engine name is already per-platform (`ENGINE_BIN_NAME`), and the
    Windows-only parts already switch off (presence watcher, GDI font reader, process stats,
    registry lookup). Work: a `linux:` target and `engined` in `electron-builder.yml`; an
    `ubuntu-latest` job in `community-release.yml` and the AppImage plus `test-linux.yml` in
    `publish-release.sh`; log discovery probing Wine/Lutris/Steam prefixes (the folder picker
    already works); overlays forced to X11. Lost on Linux: overlay hiding when the game is not in
    front, the font reader, the Kokoro voice. Nobody here can test it on Linux yet.
  - Not wanted: a live "wiki is missing this" check (we answer from the shipped cache; their pack is
    a cache too, refreshed at most daily, and we compare against it before each release); refreshing
    the data inside the app (we keep wiki traffic down).
  - Needs the owner's sign-off (rule 15): publishing to the wiki from the app instead of Copy, and
    sending kill/loot observations to the wiki's `action=eozobservations`. Both are documented on
    the wiki's API page (WIKI.md has the summary). Our drop data is the wiki's own drop lists plus
    the player's own log; EOZ's observations are a private, attributed store on the wiki's server,
    with no public read and no drop rates yet.
  - Not a gap: our data already has map locations (6,456 mobs), levels (8,049), drops (4,835) and
    zone/leveling recommendations; the pack's equivalents only matter as a cross-check.
  - Ours, not theirs: respawn timers, DPS timeline and proc breakdowns, buff timers, voice/sound
    alerts, Sky tracker, bazaar watchlist, factions, spellbook and loadouts, AA/leveling ledger,
    bosses of the week, exaltation optimizer.
- Performance audit 2026-10-20 leftovers: an engine "met" module (loot/kills re-fetch per kill), one
  engine connection served in order.
- Major dependency bumps (`requirements/deps-refresh.md`), one branch each.
- Next wiki delta before ~2027-01-16 (the wiki keeps ~90 days of changes).
