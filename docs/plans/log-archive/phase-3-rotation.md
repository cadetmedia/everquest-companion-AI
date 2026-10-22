# Phase 3: rotation

The app moves the live log into the archive and leaves a fresh one in its place. This is the
first and only phase that changes anything in the game's folder.

[Back to the plan](README.md) · Needs: phase 2 and rulings 0.2, 0.3 · Touches the game folder: **yes**

The order of the steps is the safety design. The checks, the journal and the recovery are built
and tested before the button exists, and the restore is built before the owner's trial.

## What rotation does, in order

1. Run the preflight checks.
2. Wait until the engine has read to the end of the log, then capture, as in phase 2.
3. Write a journal entry naming the log, the segment and the step about to be taken.
4. Rename the live log into the archive folder at once. On the same drive this is a single
   operation that either happens or does not.
5. If no file is at the live log's path, create an empty one without truncating anything: if
   the game created it first, it is left alone.
6. Compare the moved file's length with the captured length. Any extra bytes are lines the game
   wrote between the capture and the rename. They stay in the moved file, so they are in the
   archive, and the segment records how many lines they are, because its totals do not include
   them. Phase 5's re-derive counts them. The window is the time between two back-to-back calls.
7. Back up and verify the moved file, as in phase 2. The moved file is no longer written to, so
   its SHA-256 is final.
8. Seal the segment and add it to the set sealed during this attach.
9. Confirm the archive's SHA-256 matches the moved file, then delete the moved file. The
   compressed archive remains.
10. Clear the journal entry.

If anything fails before step 4, the log was never touched. After step 4, the moved file stays
in the archive folder until step 9 proves the compressed copy is good.

**Why the game may keep running** ([step 0.5](phase-0-rulings.md#05-does-the-client-let-go-of-the-log-between-lines)):
the client opens the log by name for each line, so after the rename it writes to a fresh file at
the old name and never to the moved one. The engine's tailer already handles this: a path that
vanished and came back forces a reopen, and a file smaller than the read cursor restarts at byte 0
(`engine/crates/eqlog/src/tail.rs`, module header, rules 1 and 5). The fresh file starts empty, so
the restart re-reads nothing. Whether the engine reads the last bytes of the old file before it
reopens is checked in step 3.3; step 6 above records them either way.

## Steps

### 3.1 Preflight checks

- **Does**: one pure function that answers "may this log be rotated now" with a list of reasons
  when the answer is no.
- **Checks**: the switch is on; the engine is live on this log and has finished folding; the
  archive folder is on the same drive, or the player has accepted a slower copy; free space
  covers the log's size.
- **No game check**: step 0.5 removed the need for one. The app's presence watcher is not
  consulted, which also avoids its habit of assuming the game is running until a check says
  otherwise.
- **Touches**: one new file in `src/shared/` for the rule, one in `src/main/` for the readings.
- **After this step**: no behaviour change. The panel can show why rotation is unavailable.
- **Check**: a unit test per reason, including the failed reading.
- **Undo**: delete the files.

### 3.2 The preflight in the panel

- **Does**: the panel shows the preflight result in plain words. The switch itself was built in
  step 1.0 and given its control in step 2.4, and turning it on is what allows moving the log;
  the panel's statement beside the switch says so from this step on. There is still no rotate
  button.
- **Touches**: the panel.
- **After this step**: a player who has turned the switch on can see whether archiving would be
  allowed now, and why not.
- **Check**: each preflight reason shown in the panel.
- **Undo**: revert the commit.

### 3.3 The rotation itself, on test folders only

- **Does**: the nine steps above as one function that takes every path as an argument. Nothing
  calls it with a real log.
- **Reports in plain words when**: the rename is refused because another program holds the
  file. Nothing has changed at that point, and the player is told so.
- **Also settles**: whether the engine reads the old file's last bytes before it reopens the
  fresh one, using a temp-folder log appended to between the capture and the rename.
- **Touches**: one new file in `src/main/`.
- **After this step**: no behaviour change.
- **Check**: tests on temp folders for the clean run and for a failure injected after each of
  the nine steps. After every injected failure, either the log is where it was or the moved
  file is intact in the archive folder.
- **Undo**: delete the file.

### 3.4 Recovery at launch

- **Does**: at launch, before the engine attaches, reads the journal. An entry from before step
  5 is cleared. An entry from step 5 or later is finished from where it stopped. If the live
  log's path has no file, an empty one is created, because the app does not retry a log that
  was missing when it started.
- **Touches**: one new file in `src/main/`; one call from the launch sequence in
  `src/main/session.ts`.
- **After this step**: no behaviour change when there is no journal, which is every launch
  until step 3.5.
- **Check**: a launch test for each interrupted state from step 3.3.
- **Undo**: revert the commit.

### 3.5 The button

- **Does**: adds "Archive this log and start fresh" to the panel. It is enabled only when the
  preflight passes. Each click asks for confirmation, naming the file, its size and where the
  archive will go. Nothing else ever starts an archive.
- **What the player sees afterwards**: the same history as before. During this session it comes
  from the engine's memory. From the next launch it comes from the sealed segment merged with
  the fresh log.
- **Touches**: the panel; an IPC channel.
- **After this step**: the feature is complete for kills, loot and levels.
- **Check**: an e2e run on a fixture log: rotate, compare Bosses, Loot and Leveling before and
  after, relaunch, compare again, append lines to the fresh log, compare a third time.
- **Undo**: revert the commit. Logs already rotated stay rotated and their history stays
  visible, because phases 1 and 2 remain.

### 3.6 Restore

- **Does**: "Put this log back" for the newest segment. It decompresses the archive beside the
  live log, confirms the SHA-256, then joins the two the way step 0.5 did by hand: move the fresh
  log aside, add its bytes to the end of the restored one, move the restored one to the live
  name, and repeat if the game recreated the name in between. Then it sets the segment back to
  `backed-up`.
- **On the rule that the log is never rewritten**: no line is removed or changed. The result is
  the game's own bytes, oldest first, exactly as if the log had never been moved. The owner had
  this done to their own log on 2026-10-03.
- **Touches**: the rotation file; the panel.
- **After this step**: a rotation can be taken back.
- **Check**: rotate then restore on a fixture; the restored file's SHA-256 equals the original.
- **Undo**: revert the commit.

### 3.7 The owner's trial

- **Does**: no code. The owner rotates a copy of their real log in a test folder, then their
  real log, and compares the tabs.
- **Compares**: boss kill counts and first and last seen; this week's lockout rungs; loot row
  count and three item totals; level and AA history; Plane of Sky held counts.
- **After this step**: the result is recorded here, with anything that differed.
- **Undo**: step 3.6.

Result (2026-10-03, automated by `tests/e2e/log-archive-trial.mts` on a copy of the owner's
324 MB log, in a temp install with its own settings folder; the live log was never touched):

- Archive: 324,347,223 bytes became a 28,260,590-byte archive; the live log was left at 0 bytes.
- **The next launch was ready in 2 seconds instead of 60.**
- Kills, loot, levels and AA, consider, item tiers, class unlocks, turn-ins, respawn and the
  leveling series were identical before the archive, in the same session after it, and at the
  next launch from the archive plus the fresh log. The only difference is the respawn card's
  current zone, which the fresh log does not know until the game prints a zone line.
- New lines in the fresh log added to the history. Putting the log back produced exactly the
  original bytes followed by the new lines, and nothing was counted twice.
- **One loss, found by the trial and caused by the engine:** the first line of a fresh log is
  counted while the app runs, but not at the next launch. The engine's launch-date epoch
  (`engine/crates/fold/src/epoch.rs`) fires at the first line dated after 2026-07-28 and is
  delivered after that line, so every character-scoped module clears what that line just added.
  In a log that began before launch day the line is a login line and nothing is lost; in a fresh
  log it is whatever the game printed first. **Fixed 2026-10-04 on `catch_all` (06c37f78), at
  the owner's request:** the epoch is now delivered before its line. Re-run with the fixed engine:
  the first line counts live and at the next launch.
- With the fix in, the only differences left are context the fresh log does not have yet: a kill
  made before the fresh log's first zone line is counted but filed under "unknown zone" (tier
  key -2) instead of the zone the player was in, and the respawn card's zone is blank until the
  next zone line. A boss killed in an instance in that window would not credit its tier rung
  until the player zones. **Built 2026-10-04 as step 3.8**, below.

### 3.8 The zone across the cut

- **Does**: files what a fresh log records before its first zone line in the zone the archive
  ended in, as reading the two as one log would. App-side only; no engine file changes.
- **Kills** (`shared/logArchive/carryZone.ts`, applied by `main/logArchive/history.ts`): a
  `-2` run moves only when its last kill is before the stretch's first zone line, read from that
  stretch's `progression` zone column (or the stretch has none yet). `-2` also means an instance
  whose difficulty the app does not decode, after a zone line; a run that straddles the line mixes
  the two causes and cannot be split, so it stays. The tier is not decoded again from the zone's
  name, because the kills fold also remembers instance notices that no snapshot publishes: it is
  read off the archive's own kills, as the one key every run carries whose last kill came at or
  after the archive's last zone line. When no kill says, or two disagree, nothing moves. Every cut
  is handled, oldest first, so an archive that began as a fresh log takes the zone of the one
  before it. As in step 4.5, only a progression that dropped nothing can place its first zone line.
- **The live log's first zone line** comes from the live `progression` snapshot, which
  `serveModuleSnapshot` asks for before a kills read, only while history is shown and only until
  the line is known (it cannot move afterwards).
- **Respawn** (`mergeRespawn.ts`): the fold files a death before its first zone line under zone
  `''`, and nothing else is ever filed there. Those rows and candidates join the archive's zone,
  merging with one the live side already holds for it, and a blank live header shows the archive's
  zone.
- **Found on the way**: `mergeModule` started its fold from the first archive joined with an empty
  template, so the respawn rule read an empty watch list and dropped every archived clock, and
  progression added the live side's `dropped` twice. The first archive now starts the fold as
  itself (6f1a7910).
- **What it still cannot do**: a boss killed before the first zone line in a zone whose archive
  holds no kill after its last zone line stays under "unknown zone" until a later kill there; the
  engine's own memory of an instance notice is not carried, so a bare zone name never becomes d0
  without that kill evidence.
- **Tests**: `tests/logArchiveCarryZone.test.mts`, with the la2 fixtures' `kills` and `respawn`
  recorded for this step: the merged split log equals the whole log for both modules. A read-path
  test in `tests/logArchive.test.mts` covers when the live progression is asked for.
- **Undo**: revert the commit.

## As built (2026-10-03)

- `main/logArchive/rotate.ts` holds steps 3.3, 3.4 and 3.6 over paths; `shared/logArchive/preflight.ts`
  is 3.1. The archive folder must be on the log's drive, so the move is a rename.
- **The moved file is checked** to begin with exactly the captured bytes before anything is
  compressed. A file that does not is kept where it is and the player is told.
- **The launch check (3.4)** runs before the session resolves the log (`main/index.ts`), and
  returns at once when the archive folder does not exist.
- **Restore (3.6) restarts the app.** The engine is following a short log that just became a
  long one, and a reopened path keeps its read offset (`tail.rs`, rule 5), so only a fresh launch
  folds the restored log correctly. The card says so before the player confirms. The join uses a
  hard link to the live name, which fails if the game recreated it, so it can never overwrite.
- **Tests**: a clean run; lines written between capture and move (archived and counted); the
  game recreating the log first (never truncated); a log that cannot be moved; a crash after each
  step followed by the launch recovery, checking the lines are whole at every point; restore byte
  for byte; a corrupt archive refused.

## When this phase is done

| Question | Answer |
|---|---|
| What changed for players? | Behind the unreleased gate and the switch: one button that archives the log and keeps the history. |
| Did the app change the game's folder? | Yes: it moved the log, when the player clicked and confirmed. |
| Can work stop here for good? | Yes. This is the core feature. |
| What is not covered yet? | Fight history, leveling charts, learned buff durations, resist history. See phases 4 and 5. |
