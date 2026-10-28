# Open items after the 2026-10-27 sweep

State at 2026-10-28: `main_community` holds the 2026-10-27 work merged locally, NOT pushed
(owner: "no pushing yet and NO releasing"). Gate green on the merged tip (typecheck, lint, unit
suite with only the 2 known reds, cargo test, rust factoring); engine rebuilt. Nothing checked in
the running app yet.

Unreleased on the trunk since test.35: buff duration override (fork #4), "Helps these classes"
filter (worn is not benefit), release blockmap fix, maps travel card float, Gaps emote fix,
Tradeskill Ingredient rows, font reader, Map pins Achievements chip, docs housekeeping.

## Waiting on the owner

- Push and release: owner's word only.
- Close fork #4 when a release ships the buff fix (reply/close on the owner's word).
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
- Wiki edits for the owner: Enynti `| respawn_time = 8:50`, restore Sulgar, Clockwork Merchant `|name`.
- Unconfirmed changes: meters update 1/s in a fight; `heal-*` overlays character-aware; a charm
  bind still ends at the zone line.
- The `UNRELEASED` gate: ruled 2026-10-28, always open ("no reason to hide them ever just always
  show the tabs"). Both halves are pinned true. Left: remove the gate's ~128 call sites (48 files)
  as cleanup; no player-visible change.

## Candidate work (owner to pick)

- From the competitor scan 2026-10-27 (EQBuddy, eqltools, Loadout Legends, SEQO, eql-log-reader,
  eql-tooltip): death recap (easy), friends online from `/who` (easy), item lookup hotkey via the
  existing OCR (moderate), AA planner (data only), phone/tablet second screen (moderate, EQBuddy's
  edge), leaderboards/profiles (needs a backend; skip for now).
- Performance audit 2026-10-20 leftovers: an engine "met" module (loot/kills re-fetch per kill), one
  engine connection served in order.
- Major dependency bumps (`requirements/deps-refresh.md`), one branch each.
- Next wiki delta before ~2027-01-16 (the wiki keeps ~90 days of changes).
