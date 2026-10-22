# Phase 0: rulings

No code. Each step is a decision or a measurement, recorded here when it is made. Phases 1 and 2
need steps 0.1 and 0.2. Phase 3 also needs step 0.3. The fight steps of phase 4 need step 0.4.
Step 0.5 is optional.

[Back to the plan](README.md)

## 0.1 Does issue #37 become the fork's work?

- **Decides**: whether the fork builds this at all.
- **Background**: `docs/community/ISSUES.md`, on the fork's integration branch, records #37 as
  waiting on the owner, because the request involves the game's own folder. The creator has not
  yet commented on the issue.
- **Recommendation**: yes for phases 1 and 2, which never change anything in the game's folder.
  Phase 3 is decided separately in step 0.3.
- **After this step**: the ISSUES.md row names this branch and this plan.
- **Undo**: restore the row.

Ruling: yes (owner, 2026-10-03, asking for phase 1 to start). The fork builds the plan as a
whole, and every part of it sits behind the switch described in the [plan](README.md#the-switch).

## 0.2 Where do archives and segments live?

- **Decides**: the folder for compressed archives and for segment files.
- **Options**:

| Option | For | Against |
|---|---|---|
| The app's own data folder (recommended) | Phases 1 and 2 never write outside the app. Nothing new appears in the game's folder. | Players who look for old logs will look beside the live one first. |
| `Logs\archive\` inside the game's folder | Where players expect it. Log discovery does not look in subfolders, so nothing there is mistaken for a character. | Creates a folder in the game's install. |
| A folder the player picks | Flexible. | A folder on another drive turns a rename into a copy, which phase 3 must then handle. |

- **Fixed whatever is chosen**: an archive's name never matches `eqlog_*.txt` in a folder that
  log discovery reads, because discovery would list it as a character.
- **Undo**: a later change of folder moves files; segment files record the archive path.

Ruling: provisional, the app's own data folder (2026-10-03). The owner asked for phase 1 to start
without choosing; phase 1 writes nothing, so the recommendation is used and the folder can still
change before phase 2 writes the first file.

Ruling: `Logs\companion-archive\` inside the game's folder (owner, 2026-10-07). The data folder
put the history in one install's folder while the log it came from is read by every install on
the machine: an archive made by the dev app left the TEST app looking at a fresh log with its
history out of reach. Beside the log, every install finds the same history, and it stays with the
log through a reinstall of the app. Deleting the game's Logs folder now deletes the history too.
The owner's own archives were moved by hand. test.18 and test.19 could archive into the data
folder, but the owner ruled that no tester uses the feature yet, so no migration ships.

## 0.3 May the app move the live log?

- **Decides**: whether phase 3 is built.
- **What is being asked**: with the player opted in, the app renames the live log into the archive
  folder, and the game starts a fresh one.
- **What is not being asked**: editing the log, or removing lines from it.
- **Who decides**: the owner for the fork. The creator's view is asked for on the issue before
  anything is offered upstream (step 6.4).
- **If the answer is no**: phases 1, 2, 4 and 5 still stand. The player clears the log by hand,
  and step 3.4's launch check recognises that the log was replaced.

Ruling: yes, on three conditions (owner, 2026-10-03):

1. The feature is off until the player turns it on by hand ([the switch](README.md#the-switch)).
2. Every move is the player's own click, confirmed each time. Nothing moves the log on its own.
3. The game does not have to be closed. Step 0.5 showed the move is safe while it runs, and the
   owner asked why it should be closed.

## 0.4 How much of each fight is kept?

- **Decides**: what phase 4 stores for archived fights.
- **Measured**: summaries for 6,299 fights are 1.6 MB. Full breakdowns are 92 MB.
- **Recommendation**: summaries only. The archive still holds every line, so a full breakdown can
  be rebuilt from it if it is ever wanted.
- **Idea from #37 (joeymavity)**: archives are named by the time of their first and last line,
  so the one archive that holds a given fight is found from the fight's time alone. Opening an
  archived fight can then rebuild its full breakdown from that one archive, on demand, instead of
  storing it. This is what makes "summaries only" cost nothing that cannot be had back.

Ruling (owner, 2026-10-04): **summaries only.** Each segment keeps its fights' summaries; the full
detail stays in the archive.

## 0.5 Does the client let go of the log between lines?

- **Measures**: whether the EverQuest Legends client holds the log open.
- **Needed for**: whether phase 3 must wait for the game to close.
- **How**: on a throwaway character, with the game running and `/log on`, rename the live log in
  Explorer. Then say something in game. Note whether the rename succeeded and whether a new file
  appeared.
- **Owner's time**: about ten minutes.

Result (2026-10-03, on the owner's real log, 321 MB, game running, companion closed):

- The rename succeeded at once while the game was writing. No lock, no error.
- The moved file never grew again. Its last line is from before the rename.
- The game created a fresh `eqlog_<Character>_<server>.txt` by itself with its next line, nine
  seconds later.
- So the client opens the log by name for each write and does not hold it. This matches the
  report on #37 (joeymavity) from the EQBuddy tool.
- The log was then put back with the game still running: the fresh file was moved aside, its
  bytes added to the end of the old one, and the old one moved back to the live name, in a loop
  that repeats if the game recreates the name in between. It took one round. The result was
  exactly the old size plus the fresh file's size, the join read cleanly from the last old line
  to the first new one, and the game went on adding to it.

One limit: the test shows the game did not write to the moved file. It cannot prove that no line
was lost in the nine seconds between, though nothing suggests one was.
