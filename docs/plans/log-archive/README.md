# Log archive: keep the history, let the log go

Upstream issue [#37](https://github.com/jmoyers/everquest-companion/issues/37) asks for log
rotation. This folder is the plan for the fork's answer to it. It is a plan only: nothing here is
built yet, and nothing is built until the rulings in [phase 0](phase-0-rulings.md) are made.

## The goal

A player can archive their EverQuest log and start a fresh one, and every tab still shows the
history it showed before.

## Why it needs a plan

Three facts, each read from the code or measured on a real log (2026-09-26):

1. **The log is the only copy of most history.** The engine folds the whole file from byte 0 at
   every launch. Kills, loot, level and AA history and past fights are rebuilt each time and are
   stored nowhere else. Quest turn-ins are the one exception
   (`ProgressState.questTurnIns`), and they are stored for exactly this reason.
2. **Filtering the log does not solve it.** On a 250.7 MB log covering 45 days, 71% of the bytes
   are combat involving the player's own party. Lines the engine does not parse are 13.8%, chat
   is 2.8%, and bystander combat is 2 to 3%. Removing everything that looks like noise saves 10
   to 20%.
3. **Counts are small.** The long-horizon facts of those 45 days fit in about 0.45 MB as counts,
   plus about 1.6 MB for fight summaries. gzip takes the raw file from 250 MB to 22 MB.

So the shape is: keep the raw log as a compressed archive, keep the totals the engine already
computed from it, and show both together.

## The rules every step follows

These come from the creator's own design notes and from the fork's rules. A step that cannot keep
them is redesigned, not excused.

| Rule | Where it comes from |
|---|---|
| The game's log is never rewritten: no line is removed or changed. It is moved whole, put back whole (step 3.6), or left alone. | `AGENTS.md` ("Never write to the game log"), `src/main/feedback/slice.ts` header |
| No engine file changes. The engine stays the only thing that folds a log. | The factoring ratchet in `engine/factoring-baseline.json`; the creator owns the engine |
| A count is never stored twice. History from an archived stretch is shown only when the live log does not contain that stretch. | The creator's note on seeding a fold with what it is about to re-derive (`AGENTS.md`, fold checkpoint section) |
| The raw archive is always kept. Stored totals are a convenience; the archive is the record. | Parser fixes keep landing, and only raw lines can benefit from them |
| The whole feature is off until the player turns it on, by hand, in Settings. Nothing turns it on for them, and nothing runs on its own once it is on. | Owner ruling, 2026-10-03 ([the switch](#the-switch)) |
| Every branch rule of the fork applies. | `docs/community/RULES.md`, on the fork's integration branch |

## The switch

The feature has one switch, **Summarize and archive log**, and it is off for every player, new or existing.
Only the player can turn it on, in the Log archive section of Settings. Step 1.0 builds it before
anything else, and every later step checks it.

While the switch is off:

- the app does not capture, back up or move anything;
- the app does not open the archive folder, and every tab shows exactly what the engine served,
  with one exception: the Factions tab still reads the faction ledgers an earlier archive left,
  because they correct today's standing rather than show history (step 4.16);
- the Log archive section shows the switch, a plain statement of what turning it on allows, and
  nothing else.

While it is on, nothing still happens by itself. Every backup and every archive is one click by
the player, and moving the log asks for confirmation each time, naming the file. There is no
schedule, no size threshold and no trigger on the game closing (see [Not planned](#not-planned)).

Turning the switch off again stops the history from being shown. Segments and archives stay on
disk, and turning it back on shows them again. The panel says so before the player turns it off.

## The stop-anywhere contract

Every step in every phase ends in a state that can ship. For each step the phase document states:

- **Does**: what the step adds.
- **Touches**: the files it is expected to change.
- **After this step**: what a player sees, and what is different on disk.
- **Check**: how to know the step is right. The fork's gate (typecheck, lint, tests on Node 24)
  is assumed for every step and is not repeated.
- **Undo**: how to take the step back.

Three design choices make that contract hold:

1. **Inert first.** Reading and merging are built before anything that creates history to read.
   With no archived segment on disk, every read returns exactly what the engine served.
2. **Capture everything, merge gradually.** A segment stores every module the engine publishes
   from the first day. Merge rules are added one module at a time. A module with no merge rule
   yet simply shows the live log, as it does today, and gains its history when its rule lands.
3. **The log is the last thing touched.** Backup comes before rotation, recovery from an
   interrupted rotation comes before the button that starts one, and the player's own log is not
   moved until a verified archive of it exists.

## Phases

| Phase | What it delivers | Touches the game folder | Estimate |
|---|---|---|---|
| [0. Rulings](phase-0-rulings.md) | Decisions and one measurement. No code. | No | Owner's time |
| [1. History store](phase-1-history-store.md) | The switch, the segment format, merge rules for kills, loot and levels, wired in and inert | No | 3 to 4 h |
| [2. Capture and backup](phase-2-capture-and-backup.md) | The app can record a segment and make a verified compressed copy of the log | No (reads only) | 3 to 4 h |
| [3. Rotation](phase-3-rotation.md) | Opt-in "archive and start fresh", with recovery and restore | **Yes** | 4 to 5 h |
| [4. More history](phase-4-more-history.md) | Remaining modules, leveling charts, fight history | No | 5 to 8 h |
| [5. Engine files and re-derive](phase-5-engine-files-and-rederive.md) | Resist and learned-message history; refresh stored totals after a parser fix | No | 5 to 9 h |
| [6. Release](phase-6-release.md) | Help text, tester notes, offering it upstream | No | 1 to 2 h |

Estimates are working time for the agent that wrote this plan, not calendar time. Phases 1 to 3
are the core. Phases 4 and 5 are independent of each other and their steps can be taken in any
order.

## Words used in these documents

- **Live log**: the file the game writes, `Logs\eqlog_<Character>_<server>.txt`.
- **Segment**: one archived stretch of a character's log, with its identity, the totals captured
  from it, and the path of its compressed archive.
- **Capture**: asking the running engine for its module snapshots and writing them into a
  segment. Reads only.
- **Backup**: making a verified compressed copy of the live log. The live log is not changed.
- **Seal**: marking a segment as history that may be shown. Only a segment with a verified
  archive can be sealed.
- **Rotate**: moving the live log away so the next session starts a fresh one.
- **Merge**: answering a read with the live snapshot plus the eligible sealed segments.

## What is lost even when everything is built

These are stated here so nobody discovers them later.

- **Context at the start of a fresh log.** Until the next zone line, level line or group line
  prints, the engine does not know the current zone, level or group. The app files kills and
  respawn deaths before the first zone line in the zone the archive ended in (step 3.8), when the
  archive's own kills say which tier that zone had. Level and group recover within minutes of
  play. Carrying them in the engine would need a new input to it, which is the creator's decision.
- **Detail inside archived fights.** Fight summaries are kept. The per-fight breakdown is about
  14.5 KB per fight (92 MB for the measured log) and is not kept. An archived fight opens as a
  summary.
- **Alerts and the event feed** are live only, today and after.
- **Up to a minute of resist and message history** before each archive: what the engine had
  not yet written when the log was moved. A second archive of one character without a relaunch
  in between keeps none of that log's resist and message history (step 5.2).
- **The engine-fed loot ledger** (the optional data-source toggle on the Loot tab) reads the
  engine directly and shows the live log only. The default ledger shows merged history.

## Not planned

- **Archiving on its own.** Issue #37 suggests archiving when the game quits, and when the log
  passes a size such as 50 MB. Both are left out because the owner wants every archive to be the
  player's own click. Either could be added later as a further opt-in under the switch.
- **Removing lines from a log.** See the first rule above.
- **A resume checkpoint for the fold.** The creator built one and later removed it; this plan
  does not bring it back.

## Progress

Update this table in the same commit as the step it records.

| Step | Status | Commit |
|---|---|---|
| 0.1 to 0.3 | ruled 2026-10-03 (0.2 ruled again 2026-10-07: beside the logs) | |
| 0.4 | ruled 2026-10-04: summaries only, the detail stays in the archive | |
| 0.5 | measured 2026-10-03: the log can be moved while the game runs | |
| 1.0 to 1.7 | done 2026-10-03: inert, gate green | this commit |
| 2.1 to 2.5 | done 2026-10-03 (see the phase notes) | c318c9b4 |
| 3.1 to 3.6 | done 2026-10-03; 3.7 is the owner's trial | c318c9b4 |
| 3.8 | done 2026-10-04: the archive's last zone carried to kills and respawn before the fresh log's first zone line | 6fb66644 |
| 4.1 | done 2026-10-03: consider ring, and one mob's drops seen rebuilt from archived loot | 4f090517 |
| 4.2 | done 2026-10-03: item tiers | 449b7b12 |
| 4.3 | done 2026-10-03: class unlocks and raw turn-ins | e8887e04 |
| 4.4 | done 2026-10-03: respawn gaps of watched mobs, and the recent-kill candidates | 30d0e1b7 |
| 4.5 | done 2026-10-03: progression series, one named difference | dc987532 |
| 4.6 | left out 2026-10-03 (f57a4792); built 2026-10-08 for the learned-duration table, each spell's newest summary | this commit |
| 4.7 | done 2026-10-04: fight summaries kept at capture and listed after the live fights | 4581690b |
| 4.8 | done 2026-10-04: search reaches archived fights, pinned to the engine's own fixtures | 4c05f5a3 |
| 4.9 | done 2026-10-04: an archived fight opens to its summary and names its archive | 4989463e |
| 4.10 | done 2026-10-08: spell ranks, exact | this commit |
| 4.11 | done 2026-10-08: spell sets; gems are the live log's, two named differences | this commit |
| 4.12 | done 2026-10-08: class-loadout history, joined at the cut, corrections applied to archived spans | this commit |
| 4.13 | 2026-10-08: no rule for resist, step 5.2 already keeps it | this commit |
| 4.14 | done 2026-10-08: learned respawn gaps of every remembered mob, read by batched watches at capture and refresh | this commit |
| 4.15 | done 2026-10-08: Refresh takes the fight summaries again; a segment without them is refreshed at launch | this commit |
| 4.16 | done 2026-10-08: faction ledger beside each archive, written at the archive and on Refresh, read by the Factions tab (faction-tab) | this commit |
| 5.1 | answered 2026-10-03: yes, with conditions | |
| 5.2 | done 2026-10-04: resist and message buckets kept per archive, read at the archive, added at the next launch | c5d40f07 |
| 5.3 | done with the panel (version shown, older builds marked) | |
| 5.4 | measured 2026-10-04: a second fold matches the segment in all 20 modules (see phase 5) | a20bf12d, c10e63d0 |
| 5.5 | done 2026-10-04: "Refresh this history" on older segments | 386fa030 |
| 6.1 | first pass in the panel's own words | |
| 6.2 | not a separate step (owner, 2026-10-04): the switch is off by default, so the feature rides the next ordinary test build | |
| 6.3 | done 2026-10-04 (owner): the switch shows in every build, off by default; the owner tests it later | this commit |
| 6.4 | not planned (owner, 2026-10-04): no upstream offer | |
