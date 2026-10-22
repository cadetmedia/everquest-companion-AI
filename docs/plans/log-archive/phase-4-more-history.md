# Phase 4: more history

One merge rule per step. Every step is independent of the others: they can be taken in any
order, and any of them can be left out.

[Back to the plan](README.md) · Needs: phase 1 · Touches the game folder: no

Segments captured before a step lands already hold the module's snapshot, because capture stores
every module from the start. So a merge rule added here applies to logs that were archived
earlier.

Each step has the same shape:

- **Touches**: one new merge file in `src/shared/`, one line in the merge lookup.
- **Check**: unit tests, and the module added to the split-log test of step 1.6.
- **Undo**: remove the line from the lookup. The module goes back to showing the live log only.

Until a module's step lands, that module shows what the live log holds, as it does today.

## Steps

### 4.1 Drops seen per mob

- **Does**: merges the `consider` module's own-loot index (mob, item, count, last seen), and the
  separate served read for a single mob's drops.
- **After this step**: the Mobs page shows drops from archived logs.
- **As built** (2026-10-03): the own-loot index is published in no snapshot, so the single-mob
  read rebuilds the archived part from each segment's `loot` rows (every loot but a destroy, with a
  source), under every spelling the mob answers to, and joins it to the served list
  (`mergeDropsSeen.ts`, wired in `serveMobDropsSeen`). The consider ring itself merges by mob.
  Allowed difference: a con before the live log's first zone line carries no zone.

### 4.2 Item tiers

- **Does**: merges the highest upgrade seen per item. The higher value wins.
- **After this step**: gear and planner surfaces keep the tiers learned from archived logs.
- **As built** (2026-10-03): exact on both fixtures. A tier-less "held" sighting that only
  updates an existing row's name and time is not published by a live log that has no row yet;
  no fixture holds one.

### 4.3 Class unlocks and raw turn-ins

- **Does**: merges class unlocks (the earliest sighting wins) and the raw turn-in rows for
  trades that did not match a Plane of Sky quest. Matched turn-ins are already stored.
- **After this step**: an unlock seen only in an archived log is still shown.
- **As built** (2026-10-03): exact. A trade whose offers are in the archive and whose "complete
  the trade" line is in the live log is lost: the open offer group is not published.

### 4.4 Learned respawn gaps

- **Does**: merges the learned gaps per mob, keeping the engine's own limits (the six most
  recent gaps per mob, the 800 most recent mobs).
- **After this step**: respawn timers keep what they learned.
- **As built** (2026-10-03): the module publishes clock rows only for watched mobs (at most 60)
  and the 40 most recently killed mobs, not its 800-mob history, so an archive gives back the
  gaps of mobs that were watched when it was captured. An archived clock is shown only for a mob
  the live list still watches. A gap spanning the cut is not recovered. The split-log test covers
  the candidates; `parity` cannot set watches, so clock rows are covered by unit tests.

### 4.5 Leveling charts

- **Does**: joins the `progression` module's series, older first, and then applies the same
  caps the engine applies, so the merged series is never longer than a live one could be. The
  charts already tell the player when a range reaches history that was dropped; that wording is
  reused.
- **After this step**: XP and kill-rate charts continue across a rotation.
- **Note**: this is the largest merge after loot, and the one most tied to the engine's own
  shape. If the split-log test cannot be made to pass with a short list of allowed differences,
  the step is left out and the charts start fresh after a rotation.
- **As built** (2026-10-03): kept. One named difference: an experience line on the archive's last
  line is held by the parser and never published (the same cut costs the kills test one credit).
  A live kill before the live log's first zone line takes the zone the archive ended in, as one
  continuous log would.

### 4.6 Learned buff durations

- **Does**: merges the duration samples per spell from the `buffs` module. Live bars and active
  buffs are not merged; they belong to the present.
- **After this step**: buff bars keep their learned lengths instead of falling back to the
  database value.
- **Left out** (2026-10-03). The `buffs` snapshot publishes per-spell summaries (`n`, median,
  quartiles, min, max, the estimate and its source), not the duration samples. The estimate is
  the larger of the database floor and the longest of the five most recent samples per evidence
  class, with a corroboration rule over those samples that can lower the floor. None of that can
  be recomputed from two summaries: the merged median and quartiles are unknown, and which
  samples are "the five most recent" across the cut cannot be told. A merge would be a guess, so
  buff bars keep learning from the live log only. It could be built if the engine published the
  recent samples per spell, which is an engine change and so the creator's decision.
- **As built** (2026-10-08): what the reasoning above rules out is
  joining two summaries of one spell, and nothing joins them. Each spell keeps the summary of the
  newest stretch of log that saw it: the live log's row when it has one, else the newest archive's.
  That reaches the Buffs tab's learned-duration table. The countdown bars are timed inside the
  engine from its own samples, so after a rotation a bar starts from the database duration until
  the spell is cast again; carrying the bars over is still an engine change.

### 4.7 Fight history

- **Does**: adds archived fight summaries to the history list served by `serveCombatSnapshot`.
  Archived fights are marked as archived, and are listed after the live ones in time order.
- **Depends on**: ruling 0.4.
- **Touches**: `src/main/dataServer/serveShim.ts` (a few lines), one merge file.
- **After this step**: the fight picker lists fights from archived logs.
- **As built** (2026-10-04): capture now also asks `combat.snapshot` for every fight (a page size
  no log reaches) inside the same before/after pair as the modules, and stores the summaries as the
  segment's optional `fights` field. The open fight is kept as finished; the whole-zone row is not
  a fight and is left out. `SEGMENT_VERSION` stays 1: a segment written before this step reads as
  one with no fights kept. The read path (`mergeFights.ts`, `history.ts archivedFights`) renames
  each archived fight `arch:<segment>:<id>`, because the engine counts `e<n>` from the start of
  each log and every log has an `e1`. Archived fights follow the live ones, newest first, before
  the whole-zone row, and only fill the page the live log leaves under `maxSegments`, so "Load
  more fights" pages into the archives and a poll stays small. Two changes the plan did not name:
  the archived rows are added only for a caller that asks (`SnapshotOpts.archived`, app-side and
  never sent to the engine), which is the Combat tab, so the overlays keep the live log's fights
  and cannot open an archived one to an empty meter; and an archived selection resolves to
  `selected: null` with the summary in `archivedSelected`, rather than to the engine's default
  fight, which is what the engine does with an id it does not know. The picker's pinned head row
  is the live log's current or last fight only, never an archived one.

### 4.8 Fight search

- **Does**: `serveSearchFights` also searches archived summaries, with the same matching rule
  and the same limit, and adds their number to the corpus count.
- **Note**: the matching rule lives in the engine. This step writes it a second time, so the
  test pins both to the same fixture and fails if they drift.
- **After this step**: searching finds archived fights.
- **As built** (2026-10-04): `shared/logArchive/searchFights.ts` restates the parts of
  `engine/crates/engined/src/search.rs` that sit around the scorer: the haystack (name, plus the
  zone when it has one), the order (score, then newer first, then id), the empty-query answer and
  the default limit of 50. The scorer itself is `shared/fuzzy.ts`, which `search.rs` already
  mirrors. The engine's top hits and the archive's top hits are joined, ranked once and cut to the
  limit, which is exactly the top of the union; the corpus count adds the archived fights. No
  engine file changed. `tests/logArchiveFightSearch.test.mts` reads `search.rs`'s own test
  fixtures and stated answers out of the Rust source (nine today, with a floor so a parser that
  reads fewer fails) and runs each through the TypeScript copy, and compares the score constants,
  the typo floor, the edit-budget bands and `DEFAULT_FIGHT_HITS` in `ops.rs`. `cargo test` holds
  the Rust side to the same fixtures, so a change on either side that the other does not share
  fails one of the two.

### 4.9 Opening an archived fight

- **Does**: an archived fight opens to its summary with a line saying the full breakdown is in
  the archive, and the archive's name.
- **Touches**: the combat drill-down in the renderer.
- **After this step**: no dead end when a player clicks an archived fight.
- **Should follow**: step 4.7. Without it there is nothing to open.
- **As built** (2026-10-04): the meter body shows `ArchivedFightPane.tsx` for an archived
  selection: the fight's name, zone, start, rate, total and length, and the line "This fight is
  from an archived log, so only its summary is kept here. The full breakdown is in the archive
  <file name>." The summary comes from the snapshot's `archivedSelected` (step 4.7), so a fight
  picked from a search far outside the listed page opens the same way. Archived rows in the
  picker, its closed trigger and search results say "archived" before their timing. The timeline
  view is not offered for such a fight, as for any fight without an event ring. Rebuilding the
  breakdown from the archive on demand (the idea recorded under ruling 0.4) is not built.

### 4.10 Spell ranks

- **Does**: merges the `observedSpellRanks` module, the highest rank of each spell line this
  character was seen to merge or cast.
- **After this step**: rank chips and the spell upgrade plan keep a rank learned in an archived log.
  The game prints a rank only when a spell is merged or cast, so no `/outputfile` gives it back.
- **As built** (2026-10-08): every rank takes the higher side, merges add, the first instant is the
  earlier and the last the later. Exact on a new split fixture (`la3-gems-run.log`, cut after line
  10), which also holds the spell set and class-loadout snapshots.

### 4.11 Spell sets

- **Does**: merges the `spellSets` module's named sets, each name's latest definition.
- **After this step**: the spell set names on the Leveling tab keep sets saved in archived logs.
- **As built** (2026-10-08): a name both sides defined takes the later definition. The memorized
  gems are the live log's alone, because the module records presence only and a gem forgotten in
  the live log before the live log saw it go in leaves nothing to remove it from. Two named
  differences on the split fixture follow from that rule: a set saved again in the live log holds
  only the gems the live log watched go in, and the memorized list starts empty, which the module
  reads as unknown. Not recoverable: a set deleted in the live log is still shown from the archive.

### 4.12 Class-loadout history

- **Does**: merges the `combo` module's loadout intervals (Profiles).
- **After this step**: the loadout history continues across a rotation, and a correction placed
  over archived time takes effect there.
- **As built** (2026-10-08): at the cut, the archive's open interval and the live log's first are
  joined when both state the same loadout outright and no level went down, else the archived one
  is closed where the live one begins. Ids are renumbered over the whole list. The engine applies
  corrections only to its own log, so the read path applies the stored corrections to archived
  intervals, by the engine's own rule (`combo/intervals.rs correction_for_slice`, restated in
  `mergeCombo.ts`); a span the game named with `/who` keeps its classes and is marked overruled.
  Today's open-ended override does not reach back past the live log's first interval. Exact on the
  split fixture. One thing cannot be undone: an archived interval locked by a correction that was
  later cleared keeps that loadout, because the archive kept the result, not the evidence.
  With several archives, each archive's open interval ends where the next archive begins (the
  live log for the newest), so a correction placed in a later stretch cannot lock an earlier one.

### 4.13 Resist history

- **Does**: nothing, by design.
- **As built** (2026-10-08): the `resist` snapshot is two counts over every bucket of the engine's
  resist ledger, and step 5.2 already keeps each archived log's bucket in that ledger under its own
  key. The resist card reads every bucket. A merge rule would count the archive twice, so `resist`
  has no line in the lookup, and a test holds it there.

### 4.14 Respawn gaps of mobs nobody watched

- **Does**: keeps the learned respawn gaps of every mob the fold remembered, not only the watched
  ones, so a mob watched for the first time after a rotation starts from what the archive learned.
- **Touches**: `main/logArchive/respawnHistory.ts` (new), the capture, the refresh's second engine,
  `mergeRespawn.ts withHistoryRows`, and an optional `respawnHistory` field on the segment.
- **As built** (2026-10-08): the fold keeps up to 800 mobs with their gaps but publishes a clock
  row only for a watched mob (4.4). The watch list is a define, and the fold re-cuts its rows from
  the history it holds when the list changes, with no refold. So the capture, inside its
  before/after pair and after the modules, watches the mobs of the `kills` snapshot and the recent
  candidates in batches of 40, keeps every row that learned something, and pushes the player's own
  list back from the store. A refresh reads the same from its throwaway engine. At read time each
  archived respawn state takes the history rows of the mobs the live list watches today, and
  today's list, before the fold. No engine file changed. Probed on `wl40-farm-run.log` against the
  real binary: 41 mobs asked for, none watched, 9 with learned gaps back. A segment without the
  field counts as lacking, so the automatic refresh at launch fills it in for older archives.
  The Timers tab may redraw once while the batches run, for well under a second.
- **Revised after review** (2026-10-08): the read now runs AFTER the capture's before/after pair
  has held, not inside it, because inside it any line written during the read threw the whole
  capture away and an archive during busy play kept failing. The history is kept only if the log
  still has not moved; otherwise the segment goes without it and the next launch's refresh takes
  it from the archive. Putting the player's list back is retried, and if it still fails the app
  re-pushes it by its usual path. A refresh stamps `extrasTriedBy`, so an extra a refold could not
  read costs one refold per version, not one per launch.

### 4.15 Fight summaries on Refresh

- **Does**: a refresh takes every fight's summary again with the totals, so a parser fix reaches
  an archive's fight list, and a segment kept before step 4.7 gains one.
- **As built** (2026-10-08): the refresh's throwaway engine is asked for every fight after the
  modules (`secondEngine.ts`), exactly as the capture asks the live one, and the refresh writes them
  into the segment beside the totals. A refold that could not read them keeps the stored list. A
  segment with no fight list now counts as lacking, so the automatic refresh at launch fills it in.
  Probed on `e2e-combat.log` against the real binary: both fights back, totals and timings intact.

### 4.16 Faction lines for the Factions tab

- **Does**: keeps an archived log's faction lines in a small ledger beside its segment, so the
  Factions tab can still correct a stale `/outputfile faction` dump with lines that were archived.
- **Touches**: `shared/factionLedger.ts` (new, byte-identical on `faction-tab`, which reads it),
  `main/logArchive/factionLedgerFile.ts` (new), `rotate.ts finishFromMoved`, and Refresh.
- **As built** (2026-10-08): written as `<segment id>.factions.json` while the moved log still exists
  (so the lines written during the move are in it too), and again on Refresh from the compressed
  archive. A run of identical cap lines for one faction is kept as one entry at its last time. A
  segment without a ledger counts as lacking, so the automatic refresh at launch writes one for logs
  archived before this step. The reader on `faction-tab` takes the ledgers newest first and each
  only for lines older than what it already covers, so a backup and a later archive of the same log
  count once. Not built until then: no `/outputfile` gives these lines back, and the live log alone
  starts after the archive.
- **One exception to the switch**: the Factions tab reads the ledgers whether the switch is on or
  not. A ledger exists only if the switch was on when the log was archived, and what it corrects is
  today's standing, not a history shown on a tab; without it the tab would show a standing the
  player knows is wrong.
- **Known limit**: the window cannot see an archive whose ledger is missing. If one in the middle
  has none (its write failed and no refresh has run since), the tab can call its correction
  complete while that stretch's lines are left out. The refresh at launch writes a missing ledger,
  so this lasts until the next launch at most.

## When this phase is done

| Question | Answer |
|---|---|
| What changed for players? | Every history surface continues across a rotation. |
| Can work stop after any single step? | Yes. Each step adds one module's history and nothing else. |
| What is still not covered? | Nothing by a merge rule: resist history and learned messages are kept by step 5.2 (see 4.13). The buff countdown bars restart from the database (see 4.6). |
