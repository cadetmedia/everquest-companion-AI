# Gaps from every character: phase doc (2026-10-19)

Owner ask, 2026-10-19, with a second character (Kaltinril on freeport) beside Drywrought on oggok:
"Is there a way the GAPS section, can come from ALL characters though? ... JUST the gaps
information!" Planned only; nothing is built. Rules first: `docs/community/RULES.md`, then
`agent/INDEX.md`. The requirement row goes in `requirements/gaps-tab.md` before any code (rule 19).

## Scope

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
5. **First save** needs one attach of each character after this ships (Drywrought's log, 76 MB,
   re-reads once).

Cost: moderate. No engine change; a store file, an IPC pair, the merge, the checkbox, tests.

## Not chosen

- **The engine folds every character's log in the background.** Always current, but it re-reads
  Drywrought's whole log beside the live one, costs disk and CPU while the player plays, and is a
  large engine change.
- **Archive history only.** Other characters' archived segments could be merged without a new
  store, but only what was archived would show; a character never archived would show nothing.

## Open questions for the owner

- Default of the checkbox: off (today's view) or on.
- Whether "All characters" also merges each character's archived history, or only the live log's
  snapshot.
- How old a saved snapshot may be before the tab warns.
