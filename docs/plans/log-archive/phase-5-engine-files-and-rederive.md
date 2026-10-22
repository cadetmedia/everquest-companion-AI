# Phase 5: engine files, and refreshing stored totals

Two separate pieces of work. Steps 5.1 and 5.2 cover the two files the engine writes itself.
Steps 5.3 to 5.5 cover refreshing a segment's totals after a parser fix. Either piece can be
done without the other.

[Back to the plan](README.md) · Needs: phase 2 · Touches the game folder: no

Both pieces carry more uncertainty than the earlier phases. Each begins with a step that finds
out whether the rest is possible, and the plan accepts "no" as an answer.

## The two engine files

`resist-ledger.json` and `message-overlay.json` hold what the engine has learned about resists
and about spell messages, in one bucket per character. At every attach the engine sets aside the
attached character's bucket and rebuilds it from the log. After a rotation the rebuilt bucket
holds only what the fresh log shows, and about a minute into the session the file is written
with the smaller bucket.

This happens today to any player who shortens their log by hand. It is not caused by this plan.

### 5.1 Find out how buckets are read

- **Does**: no code. Reads the engine to answer one question: when a bucket exists under a key
  that is not the attached character, do the resist card and the message register include it?
- **Records here**: the answer, with file and line.
- **If yes**: step 5.2 can be built without touching the engine.
- **If no**: step 5.2 is not built. The loss is added to the README's list, and the question is
  put to the creator, since the fix would be in the engine.

Finding (2026-10-03, read from the code): **yes, with conditions; no engine change needed.**

- Keys are `name_server` in lower case (`engine/crates/engined/src/foldsink.rs` 208-214). The
  key `baseline` is dropped on read and write; `log` is the engine's fallback name. Avoid both.
- Resist evidence is pooled across every bucket: `src/main/resist/ledger.ts rowsFor` (219-229)
  reads all of them, and so do the whole-ledger figures in `src/main/ipc/resist.ts`. Learned
  messages are pooled too: the engine sums every bucket (`message_overlay.rs aggregate`, 348-373)
  and the app's `appSpellDb.ts` merges every user bucket (76-80).
- At attach the engine restores every bucket and empties only the attached character's
  (`fold/src/lib.rs` 451-462). Other keys are written back unchanged; there is no cap and no
  pruning by key. Empty buckets are dropped.
- The engine reads both files once at attach and rewrites them every 60th live beat with its
  whole store, so a key added while a fold is live is lost within about a minute. The copy must
  be made after the old fold stops and before `session.attach` (`engineClientHost.ts` 584-600).
  The app reads each file once per run, so the copy reaches the resist card from the next launch.
- The copy must be made exactly at the rotation, or the live log and the copy both count the
  same lines.

So step 5.2 is possible. It writes into a file format the creator owns, which the plan already
says needs the owner's agreement.

### 5.2 Keep the bucket

- **Does**: at launch, before the engine is told where its files are, copies the attached
  character's bucket to a key named for the newest sealed segment, once per segment. The engine
  leaves buckets for other keys alone.
- **Needs**: step 5.1 answered yes, and the owner's agreement, because this writes to a file
  whose format belongs to the creator.
- **Touches**: one new file in `src/main/`; one call before the attach.
- **After this step**: resist history and learned messages continue across a rotation.
- **Check**: a launch test on fixture files: the copied bucket is still there after the engine
  has written the file. The file's version number is checked first, and an unknown version is
  left alone.
- **Undo**: revert the commit. Copied buckets stay in the file and are harmless.

Agreement (owner, 2026-10-04): build it. What is best for the player decides it.

As built (2026-10-04), in `main/logArchive/engineBuckets.ts`:

- **The bucket is read at the archive and written in at the next launch.** At that launch the
  file no longer holds only the archived log: the engine keeps tailing after the move, adds the
  fresh log's first lines to the same bucket and writes it back every minute. A copy taken then
  would count those lines twice. So the rotation reads the character's bucket from both files
  after the capture and before the move, and keeps it beside the segment as `<id>.buckets.json`.
  Nothing is written into the engine's files during the session, because the engine rewrites its
  whole store every minute. The next launch, after the interrupted-archive check and before the
  session resolves the log, adds each sealed segment's buckets under `archive:<segment id>`.
- **The read waits for the engine's own write.** A file written by an earlier attach can hold an
  older log's lines under the same character. Before the capture, the rotation waits for the
  engine to write either file, for at most 65 seconds. The engine writes on every 60th beat, and
  the first write of an attach always lands. If neither file changes in that time, a write beat
  has passed with nothing new, so the files already hold this attach's buckets. An archive can
  therefore take up to a minute longer than before.
- **Once per segment.** A key that is already in the file is not copied again.
- **A second archive of one character in one run keeps nothing.** The attach that is still
  running holds both logs' lines. A relaunch between the two archives avoids this.
- **Put back (3.6):** a segment that is no longer sealed has its key taken out of both files at
  the next launch, which the restore itself starts, and its stash is deleted. A segment whose
  interrupted archive is still to be finished is left for the launch that seals it.
- **Versions:** only resist ledger version 3 and message register version 2 are read or written.
  A file of any other version, or one that does not parse, is left exactly as it is. Every write
  is temp + fsync + rename.
- **With the switch off** the launch step takes every `archive:` key out of both files (same
  version checks, same durable write), so the tabs show what the live log alone gives, as the
  README's switch rule says. It does not open the archive folder, and the stashes stay: turning
  the switch back on adds them again at the next launch through the ordinary copy.
- **What is missed:** what the engine learned after its last write and before the move, which is
  under a minute. No line is counted twice.
- **Call sites:** the rotation (`rotateNow`) and the launch check (`recoverLogArchiveAtLaunch`),
  both in `main/logArchive/actions.ts`. The plan named one call site; the read at the archive is
  the second, for the reason in the first bullet.
- **Tests** (`tests/logArchiveBuckets.test.mts`, fixture files): the copy survives the engine
  rewriting the file and holds only the archived share; a second launch does not copy again; an
  unknown version is left alone at the archive, at launch and with the switch off; the switch off
  takes the keys out and keeps the stashes, and turning it on again adds them back; an
  unsealed segment waits; a restored segment is taken out; nothing is kept when the log was not
  moved or for a second archive in one run; the wait ends at a write, or after its limit.

## Refreshing totals after a parser fix

Today a parser fix corrects history by itself, because the next launch folds the whole log
again. A segment's totals were computed by the parser of their day. The archive still holds
every line, so the totals can be recomputed.

### 5.3 Say which parser made a segment

- **Does**: the panel shows, for each segment, the app version that captured it, and marks
  segments captured by an older engine build.
- **Touches**: the panel only. The fields are recorded since step 1.1.
- **After this step**: a player can see which history predates a parser fix. Nothing is
  recomputed. An older segment is as correct as it was on the day it was captured.
- **Undo**: revert the commit.

### 5.4 Trial: fold an archive with a second engine

- **Does**: a developer-only command. It decompresses an archive to a temp folder, starts a
  second engine process pointed at it with no state folder, waits for the fold, and reads its
  snapshots.
- **Known obstacles, to be measured by this step**:
  - The app's supervisor is written for one engine process.
  - The engine finds the client's spell table relative to the log's folder, so a log in a temp
    folder is folded without it.
  - A full fold of the measured 250 MB log took 55 seconds.
- **Touches**: one new file in `src/main/`, reachable only from owner tools.
- **After this step**: a written answer, recorded here: does the second fold produce the same
  totals as the segment, given the same engine build?
- **Undo**: delete the file.

Finding (2026-10-04, measured): **yes. Given the same engine build, a second fold of the archive
produces the totals the segment stored, in every module.**

- **How it was run.** `tests/e2e/log-archive-refold-trial.mts` stages a log in a temp install with
  its own settings folder, folds it in the app, turns the switch on, backs the log up, and calls
  the developer's trial (`window.eq.logArchiveRefoldTrial`, refused in a packaged build). Both folds
  used the same `engined.exe` (app 43.7.0).
- **The split-log fixture** (`wl40-farm-run.log`, 76,494 bytes, 941 events): all 20 captured
  modules the same. Folded in 0.75 s.
- **A copy of the owner's log** (324,347,223 bytes, 3,888,249 events; the copy was deleted
  afterwards): all 20 modules the same, kills, loot, levels and AA, respawn, progression, buffs,
  resist and the event feed included. Decompressing and checking the hash took 5.1 to 5.4 s. The
  second fold took 134 s without the client's tables and 109 s with them, at below-normal
  priority, while the trial's own engine and the owner's dev app were running. The app's own first
  fold of the same log in that run was ready in 83 s.
- **One value always differs, and is not a total:** the `character` module names the file it read,
  which for a refold is the staged copy. The comparison leaves out that one path
  (`refoldCompare.ts IDENTITY_PATHS`), and a refresh keeps the stored path.
- **The supervisor** is not used. `main/logArchive/secondEngine.ts` starts the same binary by the
  same contract (token on stdin, port on stdout, closing stdin stops it), with no restart and no
  health watchdog, and stops it when the snapshots are read. The process itself is started by
  `engineHost.ts spawnEngineProcess`, which stays the one module allowed to launch the engine
  (`tests/noChildProcess.test.mts`). The app's engine kept serving.
- **The client's tables** made no difference to any module. The engine reads `spells_us.txt`
  lazily, to answer card and search questions (`engined/src/spells.rs`). They are copied beside
  the staged log anyway when the live install is known, so a later engine that does use them in
  the fold gets them.
- **The app's knowledge must go first.** Alert definitions, buff trust, respawn watches and the
  character's combo and roster edits change a fold, so the refold sends them before its attach,
  as the app's own client does, and a define the engine refuses is skipped, as the app does (this
  build refuses `buffTrust.define` from both). A refold therefore uses today's settings, not the
  ones in force at capture: a player who has since changed a respawn watch gets a refold under the
  new watch.
- **No state folder.** The refold reads and writes no resist ledger or message register. The trial
  profile had none, so this was not a difference here. `resist` has no merge rule, so a refreshed
  segment's resist state is never shown either way.

So step 5.5 can be built.

### 5.5 Refresh a segment

- **Does**: "Refresh this history" on a segment marked as older. It runs step 5.4 in the
  background, writes the new totals to a new segment file, confirms it reads back, and swaps it
  for the old one. The old file is kept until the next launch.
- **Needs**: step 5.4 to have worked.
- **Touches**: the file from 5.4; the panel.
- **After this step**: a parser fix reaches archived history when the player asks for it.
- **Check**: on a fixture, a segment captured with a snapshot that lacks one event kind gains
  it after the refresh.
- **Undo**: the old segment file is restored from its kept copy.

As built (2026-10-04):

- `main/logArchive/refresh.ts` holds the order: refold (step 5.4's code, with the client's tables),
  write `<id>.segment.json.next`, read it back and compare it with what was written, copy the old
  file to `<id>.segment.json.old`, then rename the new file over the old. A crash leaves the old
  file or the new one in place. The launch check removes `.old` and any unswapped `.next`.
- Only the module snapshots and `producedBy` change. The log identity, the archive, the state and
  the path the `character` module names are kept. A refold that lacks a module the segment held is
  refused, so a refresh never loses one. The merge reads the folder again afterwards, so the tabs
  show the new totals at once.
- The panel shows "Refresh this history" only on a segment marked as older that has an archive,
  and asks first; main refuses a segment this version already produced. The reply names the
  modules whose totals changed.
- Check, on the split-log fixture with the real engine (`tests/e2e/log-archive-refold-trial.mts`):
  the segment was rewritten as an older build with its 250 loot rows removed; the panel marked it
  older; the refresh answered "Updated: loot", the 250 rows were back, the segment recorded 43.7.0,
  the old file was kept beside it, and the mark was gone. Unit tests in
  `tests/logArchiveRefold.test.mts` cover the refusals and a failed or short refold leaving the
  file untouched.

## When this phase is done

| Question | Answer |
|---|---|
| What changed for players? | Resist history continues across a rotation, and archived history can be brought up to date. |
| Can work stop after any single step? | Yes. Steps 5.1 and 5.4 produce findings only. |
| What if 5.1 or 5.4 says no? | The plan stops there for that piece, and the README's list of losses is updated. |
