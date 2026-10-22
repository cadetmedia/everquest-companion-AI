# Phase 2: capture and backup

The app learns to record a segment and to make a verified compressed copy of the log. The live
log is opened for reading only. Nothing in the game's folder changes in this phase.

[Back to the plan](README.md) · Needs: phase 1 · Touches the game folder: no (reads only)

Everything a player can see in this phase sits behind the app's existing gate for unreleased
features, until phase 6. Every step also refuses while [the switch](README.md#the-switch) is off.

## Steps

### 2.1 Capture

- **Does**: asks the engine for every module snapshot and for the fight summaries, and writes
  them into a new segment in state `captured`, together with the log's byte length, SHA-256,
  head fingerprint and first and last line times.
- **Refuses, with the reason, when**: the switch is off, the engine is not live on this log, the fold is still
  running, or the log grew while the capture ran. The engine's sequence number is read before
  and after; if it moved, the capture is thrown away.
- **Touches**: one new file in `src/main/`; an IPC channel for the trigger.
- **After this step**: a `captured` segment can exist on disk. It is never shown, because only
  `sealed` segments are merged. No tab changes.
- **Check**: on a copy of a real log, the captured kill count, loot row count and level list
  equal what the tabs show. A unit test for each refusal.
- **Undo**: delete the segment file. Revert the commit.

### 2.2 Backup

- **Does**: compresses the live log with gzip into the archive folder under a temporary name,
  decompresses it again to confirm the SHA-256 matches the capture, and only then gives it its
  final name. The segment moves to `backed-up`.
- **Archive name**: `eqlog_<Character>_<server>_<first day>_to_<last day>.log.gz`. It does not
  end in `.txt`, so log discovery cannot mistake it for a character.
- **Refuses when**: free space is less than the log's size, the folder cannot be written, or
  the log's length changed during the copy.
- **Touches**: one new file in `src/main/`. Node's built-in zlib; no new dependency.
- **After this step**: a player can have a verified compressed copy of their log. The live log
  is untouched. This alone is useful: the measured log went from 250 MB to 22 MB in two seconds.
- **Check**: tests on a fixture log for the round trip, an interrupted write (the temporary
  file is removed at next launch, the segment stays `captured`), and a full disk.
- **Undo**: delete the archive. The segment falls back to `captured`.

### 2.3 Seal, and the check at launch

- **Does**: lets a `backed-up` segment become `sealed`, and runs the eligibility rule of step
  1.2 at every attach, reading the live log's first 64 KiB and first line time.
- **Why sealing is safe before rotation exists**: a sealed segment whose log is still in place
  fails rule 2 (the live log begins with it), so it is held back. History appears only once the
  live log no longer contains the segment.
- **This step also serves a player who clears the log by hand.** They capture, back up and seal,
  then move or empty the log themselves. At the next launch the
  live log no longer begins with the segment, and the history is shown.
- **Touches**: the merge lookup from step 1.7; the capture file.
- **After this step**: history survives a log that was cleared by hand after sealing.
- **Check**: three launches on fixtures: log unchanged after sealing (nothing merged, counts
  equal today's), log emptied (history shown), log replaced by one that overlaps (segment held
  back, reason reported).
- **Undo**: set the segment back to `backed-up`, or delete it.

### 2.4 The panel

- **Does**: adds a "Log archive" section to Settings. While the switch is off it shows only the
  switch and a plain statement of what turning it on allows. Once on, it shows the live log's
  size and age, the segments for this character with their state and size, and any segment being
  held back with the reason in plain words. Buttons: "Back up this log", and "Keep this history"
  (seal). Turning the switch off asks first, and says the history stays on disk.
- **Touches**: a new renderer feature folder; one settings entry.
- **After this step**: a player can do everything in this phase without developer tools.
- **Check**: an e2e pass over the panel on a fixture log: the switch off by default on a fresh
  profile, with no buttons shown; both buttons once on; each refusal message.
- **Undo**: revert the commit. Segments stay on disk and keep working.

### 2.5 Before-you-clear advice

- **Does**: before sealing, the panel reminds the player to run `/outputfile inventory` and
  `/outputfile faction` in game, and says whether a recent dump already exists. Plane of Sky
  held counts and faction standings lean on those dumps once the log is gone.
- **Touches**: the panel only.
- **After this step**: the two known losses that a dump prevents are prevented.
- **Check**: the advice is shown when the newest dump is older than the log's last line, and
  hidden otherwise.
- **Undo**: revert the commit.

## As built (2026-10-03)

- **Capture reads the engine's position, not the file's size.** `session.health` reports the end
  of the last complete line the engine has folded. Capture asks for it, takes every module's
  snapshot, and asks again; if it moved, a line landed mid-capture and the capture is taken
  again (four tries). The segment then describes exactly bytes [0, offset) of the log, which the
  game never changes, so capture works with the game running and needs no "log grew" refusal.
- **Fight summaries are not captured yet.** What to keep of a fight is ruling 0.4.
- **Segments and archives share one folder**, `<app data>/log-archive`.
- **The panel** is `features/preferences/LogArchiveSetting.tsx`, in Preferences under Game,
  behind the unreleased gate. The main side is `main/logArchive/actions.ts` and
  `main/ipc/logArchive.ts`; every action checks the switch first and runs one at a time.
- **The dump advice (2.5)** compares the inventory and factions dump files beside the game with
  the log's last write, and shows when either is missing or more than a day older.
- **Tests**: `tests/logArchiveRotate.test.mts` (capture refusals and retries, backup round trip,
  mismatch, crash sweep). No e2e pass over the panel yet.

## When this phase is done

| Question | Answer |
|---|---|
| What changed for players? | Behind the unreleased gate: a panel that backs up the log and keeps its history. |
| What is on disk? | Segment files and compressed archives, in the folder from ruling 0.2. |
| Did the app change the game's folder? | No. |
| Can work stop here for good? | Yes. A player who clears their own log keeps kills, loot and levels. |
| What does the next phase add? | The app moving the log itself. |
