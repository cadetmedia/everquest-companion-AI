# Gaps from every character: phase doc (2026-10-19)

Owner ask, 2026-10-19, with a second character (Kaltinril on freeport) beside Drywrought on oggok:
"Is there a way the GAPS section, can come from ALL characters though? ... JUST the gaps
information!" Built 2026-10-19 on `gaps-all-characters` (BRANCHES.md row has the shape). Rules first: `docs/community/RULES.md`, then
`agent/INDEX.md`. The requirement row goes in `requirements/gaps-tab.md` before any code (rule 19).

## Scope

- Owner ruling, 2026-10-19: "it should not create a combined set of log files, it should just
  aggregate the data together INTO a single source of gaps in the tab ... while maintaining the
  isolation of the log files as is." No log, archive segment or per-character store is merged,
  copied or rewritten; each character's data stays its own, and only the tab's view is a join.
- Only the Gaps tab reads across characters. Kills, loot, the ledger, achievements, wish lists and
  every other view stay per character, exactly as now.
- Every Gaps domain: Items, Mobs, Spells, Merchants (engine `gaps` module) and Factions, Drops,
  Images (derived in the renderer from the `gaps`, `loot` and `kills` modules).

## How it works today (measured 2026-10-19)

- The engine folds only the attached log; a switch re-reads the new log from byte zero
  (`engined/src/world.rs`, `session.attach`). The Gaps tab reads the engine `gaps`, `loot` and
  `kills` modules (`GapsView.tsx`), plus the attached character's archived history.
- Archive history is per character: `eligibleSegments` keeps only the attached character's sealed
  segments (`logArchive/eligible.ts`). `shared/logArchive/mergeGaps.ts` already merges two `gaps`
  snapshots (rows joined by domain and case-folded name, tallies and copper summed, kinds and
  first/last widened, totals recounted, re-capped at 500 a domain), including `killFactions` and
  `mobLocs`.
- Character id is `name_server` lower-cased (`log/config.ts characterId`); no logic depends on the
  server name.

## Plan (recommended): remember each character's Gaps, merge on demand

1. **Save.** While a character is attached, keep its latest Gaps inputs on disk per character
   (userData, e.g. `gaps-snapshots/<characterId>.json`): the engine `gaps` snapshot, and the loot
   and kills the derived domains need (or only the slices they read: loot source/item/zone/count,
   kills display/count). Written when the snapshot settles and on detach, not on every delta.
2. **Merge.** An "All characters" checkbox on the Gaps tab (remembered with `useBoolPref`, like
   "Group by zone, then mob"): the live character plus every other saved character, joined with
   `mergeGaps`; the derived domains computed over the joined loot and kills.
3. **Re-check what the tab can.** A saved row can be stale: the wiki or our data gained the page
   after that character was last attached. Before showing, re-check saved rows against the data the
   renderer holds: mobs (`mobs.json`, `otherNames`), drops, factions and images fully. Items and
   spells only where the renderer has the answer (item and spell known-ness is decided in the
   engine); say so in the tab ("as of <date> for <character>").
4. **Show whose.** A row's details name the characters that saw it, so a screenshot trip knows who
   to log in.
   Held works the same way (owner, 2026-10-19 and 2026-10-21): each character's OWN inventory export
   plus its loot since, each holder named ("held by Drywrought"); the "I have it" filter on the Items
   list then means held by any character with an export (gaps-tab's box, `onlyHeld`). A character
   with no export of its own claims nothing.
5. **First save** needs one attach of each character after this ships (Drywrought's log, 76 MB,
   re-reads once).

Cost: moderate. No engine change; a store file, an IPC pair, the merge, the checkbox, tests.

## Not chosen

- **The engine folds every character's log in the background.** Always current, but it re-reads
  Drywrought's whole log beside the live one, costs disk and CPU while the player plays, and is a
  large engine change.
- **Archive history only.** Other characters' archived segments could be merged without a new
  store, but only what was archived would show; a character never archived would show nothing.

## Owner answers (2026-10-19)

- **Archived history: yes.** "all data including archived data". Every character's sealed archive
  segments are merged too (they already keep their `gaps`, `loot` and `kills` snapshots), under the
  same no-double-count rule as `eligible.ts`, applied per character.
- **Stale warning: 2 months.** A character whose saved Gaps data is older than two months is flagged
  in the tab; rows still show, with "as of <date> for <character>" in the details.
- **Checkbox: off by default, with a warning.** "All characters", unchecked by default (owner:
  "start off"); its caption or tooltip warns that it can hold a lot of data with several accounts,
  characters or servers.
- **How far back: a setting, default 60 days.** "The time to go back could be per user, default to
  60 days but give them the ability to change that". One player setting (not per character): rows
  last seen, and archived segments that ended, more than N days ago are left out; N defaults to 60
  and the player can change it. This replaces the fixed-date proposal (rolling days, owner's
  choice). Built for the All characters view first; since 2026-10-21 it trims every view (owner:
  "days back should be for any character yes"): the attached character's rows last seen, and its
  loot and kills, before the cut are left out (`ownSince`, the cut the join makes per character),
  and the Days back field shows with All characters off. Its archive history is already folded into
  its modules, so a segment that ended before the cut drops out through its rows, loot and kills; a
  row also seen since keeps its whole count, as in the join. Held is not cut: it reads the
  character's whole loot since its export.
- **The 2-month flag and the 60-day window overlap:** a character not attached for two months has
  little or nothing inside a 60-day window. The flag then says so per character ("Drywrought: last
  seen <date>, outside the N-day window") rather than warning about rows that are already hidden.
