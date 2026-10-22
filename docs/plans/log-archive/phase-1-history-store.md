# Phase 1: the history store, inert

Builds everything that reads and merges archived history, before anything exists that creates
it. When the phase is finished the app behaves exactly as it does today, because no segment is
on disk.

[Back to the plan](README.md) · Needs: rulings 0.1 and 0.2 · Touches the game folder: no

## What a segment is

One file per archived stretch of one character's log, in the folder ruled in step 0.2.

| Field | Purpose |
|---|---|
| Character id | `name_server`, lower case, the same spelling the store and the engine use |
| State | `captured`, `backed-up` or `sealed` (see below) |
| Byte length and SHA-256 of the log | Proves the archive is the file that was captured |
| Head fingerprint | SHA-256 of the first 64 KiB, used to tell whether a live log still begins with this segment |
| First and last line time | For ordering segments and for the overlap check |
| App version and engine build | Says which parser produced the totals (phase 5 uses it) |
| Archive path | Where the compressed log is |
| Module snapshots | Every module the engine published, as served, plus the fight summaries |

States move one way: `captured` (totals written, no archive yet), `backed-up` (a verified
archive exists), `sealed` (may be shown as history). Only `sealed` segments are ever merged.

## When a sealed segment is shown

All five must hold. This rule is the whole defence against counting anything twice.

1. The segment belongs to the character that is attached.
2. The live log does not begin with the segment: the head fingerprints differ.
3. The live log's first line is later than the segment's last line. If it is not, and the
   fingerprints differ, the two may overlap: the segment is held back and the player is told.
4. The segment was not sealed during the current engine attach, because the engine's memory
   still holds those lines until it next folds the log.
5. No other shown segment already holds the same lines. Two captures of one log, taken at
   different times, share a head fingerprint; only the longer is shown. Two segments that overlap
   in time without sharing a head (a log edited by hand) show the earlier, and the later is held
   back with the reason. Added while building step 1.2.

## Steps

### 1.0 The switch

- **Does**: adds the **Summarize and archive log** setting, off by default, as an optional key in the
  app's settings, and one function every later step asks before it does anything. See
  [the switch](README.md#the-switch).
- **Touches**: the settings shape (an optional key, so no migration), one new file in
  `src/main/` that answers "is it on".
- **After this step**: no behaviour change. The setting has no control yet; the control arrives
  with the panel in step 2.4, and until then nothing can turn it on.
- **Check**: a missing key reads as off; an older build reading the store ignores the key.
- **Undo**: revert the commit. A stored key is left on disk and ignored.

### 1.1 Segment format and store

- **Does**: defines the segment shape, its version number, and pure functions to write, read,
  list and validate segment files. A file that is unreadable, or from a newer version, is
  skipped and reported, never repaired in place.
- **Touches**: new files only, under `src/shared/` for the shape and `src/main/` for the file
  access. The folder is passed in, so tests use a temp directory.
- **After this step**: no behaviour change. Nothing calls the new code.
- **Check**: unit tests for round trip, unknown version, truncated file, wrong character.
- **Undo**: delete the new files.

### 1.2 The eligibility rule

- **Does**: the five-part rule above as one pure function. Inputs: the segments, the attached
  character, the live log's head fingerprint and first line time, and the set sealed during this
  attach. Output: the segments to show, and for each one held back, the reason.
- **Touches**: one new file in `src/shared/`.
- **After this step**: no behaviour change.
- **Check**: a test per rule, plus the awkward cases: an empty live log, a live log shorter than
  64 KiB, two segments in the wrong order, a repeated hour at the autumn clock change.
- **Undo**: delete the file.

### 1.3 Merge rule: kills

- **Does**: combines the `kills` module's per-mob, per-tier records. Counts add. First seen takes
  the earlier, last seen and last credited take the later, best tier takes the better.
- **Touches**: one new file beside `src/shared/kills.ts`.
- **After this step**: no behaviour change.
- **Check**: unit tests, and the split-log test of step 1.6.
- **Undo**: delete the file.

### 1.4 Merge rule: loot

- **Does**: joins the `loot` module's rows, older segment first, in time order. Rows are kept
  one per event because every time slice on the Loot and Leveling tabs filters by time.
- **Touches**: one new file in `src/shared/`.
- **After this step**: no behaviour change.
- **Check**: unit tests, the split-log test, and a test that a time slice over merged rows
  counts the same as over the unsplit log.
- **Undo**: delete the file.

### 1.5 Merge rule: levels and AA

- **Does**: joins the four lists of the `leveling` module (levels, AA gains, AA spends, potion
  state), older first.
- **Touches**: one new file in `src/shared/`.
- **After this step**: no behaviour change.
- **Check**: unit tests and the split-log test. The AA ledger's unspent total is the value to
  watch, because it needs every purchase.
- **Undo**: delete the file.

### 1.6 The split-log test

- **Does**: adds the test that keeps every merge rule right. A small synthetic log is cut at a
  line boundary into A and B. Three snapshot sets are recorded once with the engine's own tools:
  A alone, B alone, and A followed by B. The test asserts that merge(A, B) equals the snapshot
  of the whole, for every module that has a merge rule.
- **Fields that are allowed to differ** are listed by name in the test, each with its reason.
  They are the ones that depend on context B does not have at its start, such as the zone of a
  kill before B's first zone line.
- **Touches**: a new test and its fixtures. The log is synthetic. No player's log is committed.
- **After this step**: no behaviour change.
- **Check**: the test passes, and fails when a merge rule is broken on purpose.
- **Undo**: delete the test and fixtures.

### 1.7 Wire the merge into reads

- **Does**: `serveModuleSnapshot` in `src/main/dataServer/serveShim.ts` passes what the engine
  served through the merge. With the switch off, the archive folder is not opened and the served
  object is returned unchanged. With no eligible segment, the same.
  The file already adjusts one module's state before serving it (`graftLastPlayed` on the
  character module), so this follows an existing pattern in the same function.
- **Covers**: every reader of module snapshots, because the renderer's `module:getSnapshot`
  handler and the main-side reader in `src/main/ipc/knowledge.ts` both go through this function.
- **Touches**: `src/main/dataServer/serveShim.ts` (a few lines), one new file that holds the
  merge lookup. Segments are read once per attach and cached; the merged result is cached per
  module and engine sequence number so a busy surface does not re-merge on every read.
- **After this step**: no behaviour change for any player, because nothing creates segments. A
  developer can place a hand-made sealed segment in the folder and see merged history.
- **Check**: a test that the switch off returns the identical object even with a sealed segment
  on disk; a test that an empty store returns the identical object; a test with one sealed
  segment; the full gate; the dev app opened on a real log with Bosses, Loot and Leveling
  compared against the same tabs before the change.
- **Undo**: revert the commit. Segment files on disk are ignored by older builds.

## When this phase is done

| Question | Answer |
|---|---|
| What changed for players? | Nothing. |
| What is on disk? | Nothing new. |
| Can work stop here for good? | Yes. The code is dormant and tested. |
| What does the next phase add? | The first thing that creates a segment. |
