# Scrape re-baseline and era rules: phase doc (2026-10-17/18)

Status of an owner-directed piece of work, written so a fresh session can pick it up. Rules
first: `docs/community/RULES.md`, then `agent/INDEX.md`. Requirements rows (2026-10-17/18) live in
`requirements/wiki-scraper-fixes.md`, `scrape-delta-tool.md`, `catch_all.md`, `slayer-tab.md`,
`faction-tab.md`, `map-improvements.md`, `map-waypoints.md`, `gear-progression-plan.md`.

## Owner rulings (binding for this work)

- **Era rule.** (1) A thing whose wiki page is in the current era, or states no era, is in.
  (2) A thing whose page names an unreleased era (Kunark, Velious, Luclin, revamps, Epics,
  Unknown…) is out. (3) The wiki is the base; nothing relies only on the player having seen it.
  (4) The player's own log is the ONLY exception: a mob killed, conned or looted from, an item
  looted, a zone entered is in era for that player, everywhere (lists, links, pages, formulas,
  achievements, factions, loot).
- **Blanket rules, never per-name exception lists.**
- **No give-way rules.** A classic zone or a classic dropper never overrules an unreleased banner
  (that let Eejag, `{{Kunark Era}}` in Lavastorm, and ~107 others in; removed 2026-10-18).
- **Lists that recommend hide out-of-era things; lookups (search, detail pages) tag them.**
- **Scraping:** all the correct wiki data, no gaps, no carried-forward copies; slow and polite;
  honest User-Agent (owner asked about posing as Chrome; declined because it hides the bot from the
  site admins, and the wiki's API rules ask bots to identify themselves).
- **Size limits** (2026-10-17): ESLint 440 code lines/file, 110/function, complexity 13; the engine
  register is a ceiling with 10% headroom and a shrink stays green (`catch_all`).
- **A remark is not an answer:** ask, do not act, when a reply comments instead of choosing.

## Where things stand (end of 2026-10-17/18 session)

Merged into `main_community` (local only, NOTHING PUSHED; push after the owner tests):
duplication clean-up, Gaps work, Timers Clear all, size-limit headroom, and the era work:

- Data: `mobs.json` records carry `eraTag` (page banner) and `outOfEra: true` by the banner alone
  (2,941 mobs); `spells.json` and `quests.json` carry `eraTag`. Filled OFFLINE from the local
  caches, which are STALE (next section).
- One mob predicate `src/shared/mobEra.ts` (`mobOutOfEra`) over `src/shared/metInLog.ts` (the log
  evidence store, fed by `src/renderer/src/lib/useMetInLog.ts` from the engine's kills, loot,
  consider and progression modules). Zones (`era.ts zoneEra`) and items (`plannerData.ts
  donorEra`) honour the log too. Both shared files are byte-identical on catch_all, slayer-tab,
  map-improvements, map-waypoints, gear-progression-plan.
- Surfaces: Achievements Where to go / slayer map / Zone I'm in; Mobs roster (hide) and search
  (tag); map pane, pins, bands, wish counts, level caption; Plan zone levels and mob levels;
  Factions work panel (quests); loot detail droppers / quests / item chip; spell ladder.
- Verified on the owner's whole log: 2,327 mobs, 2,260 items, 143 zones met; none out of era.
- Known gaps: spells are NOT fed from the log (a cast spell the wiki marks out stays out); the
  in-game map overlay window shows every mob (it gets no log evidence); `questOutOfEra` exists in
  both `shared/questEra.ts` (faction-tab) and `shared/planner/era.ts` (catch_all); a stale comment
  in `features/maps/mobPins.ts` mentions `rosterInZone`.

## The scrape defect (why the data is stale)

- Found 2026-10-18 via "A cave bat": wiki rev 177918 (2026-09-11) is `{{Classic Era}}`; our cache
  and data hold rev 106364 (`{{Velious Era}}`).
- Cause: `scrape-mobs.ts` reads any cached page with no revision check; on 2026-09-29 its cache was
  seeded from the August item cache (5,406 pages carried forward). The item cache has the same
  no-revision design. The delta tool (`scrape-delta.mts`, recentchanges since `items.json`
  `scrapedAt`) never looks before that stamp, and the 2026-10-10 delta ran without caches so its
  fetched text was lost. Every item/mob page edited between August and the stamps may be stale,
  and the era fields filled from those caches inherit it.

## Phase 1: gap-proof tooling (CODE ONLY, zero requests) — IN PROGRESS

Being built by a background implementer in worktrees `.claude/worktrees/wiki-scraper-fixes` and
`.claude/worktrees/scrape-delta-tool` (the latter merges wiki-scraper-fixes first). Check with
`git log --oneline -8 wiki-scraper-fixes scrape-delta-tool` and each worktree's `git status`.
Target:

- A1 items and mobs caches record each page's revid (generalise `scripts/sources/revCache.ts`);
  a run asks revids 50/request via `scripts/sources/wikiApi.ts` and re-downloads only changed,
  new, or revid-less pages (a page without a recorded revid is stale). `--offline` unchanged.
- A2 no cache is seeded from another.
- A3 `--delay <ms>` pace option (minimum 1000) on the shared client and scrapers.
- B1 delta start = OLDEST `scrapedAt` of the files it updates; B2 `--since <ISO>`; B3 refuse
  (unless `--allow-gap`) when recentchanges does not reach back to the start (wiki retention,
  often 90 days); B4 always keep fetched text with revids in the caches; B5 delta uses the shared
  polite client and `--delay`.
- Tests with stubbed fetch for every item above.

When it lands: gate each branch alone (typecheck, lint, npm test vs baseline), add BRANCHES.md
notes and set the requirement rows, rehearse the merge in a scratch tree, gate, merge.

## Phase 2: catch up from August with the changes-since endpoint (NEEDS REQUESTS — owner's final go first)

Owner ruling (2026-10-18): do NOT re-scrape everything; use the wiki's recent-changes endpoint from
the last known-good point. The August item corpus was fetched whole on 2026-08-03 and 2026-08-13
(JOS-298 re-fetch), with a top-up on 2026-08-22, and the mob cache was seeded from it, so every page
NOT edited since then is already correct; only pages edited since need fetching.

1. `scrape-delta.mts --since 2026-08-01 --delay 2000` (flags from Phase 1). 2026-08-01 precedes
   every August fetch; it is ~78 days before 2026-10-18, inside the wiki's usual 90-day change
   history — the B3 gap guard must confirm the list reaches back that far, else stop and ask.
   Cost: the change list (~500 changes per request) plus the changed pages at 50/request; a
   3-week window was ~1,200 pages / ~25 requests, so expect on the order of 100 requests. Run where
   `scripts/sources/cache/{items,mobs}` exist (the main clone's, junctioned into a scratch
   worktree of `local-data-refresh`; DATA_REFRESH.md "The ETL"), so the fetched text is kept.
   Mob pages ARE in the change list (the delta folds items and mobs); spell, quest and class pages
   it lists are reported as "folded nowhere" — their own scrapers are revision-checked.
2. Refresh the wiki's own era verdicts (`npm run scrape:page-era`, ~20 requests) — `pageEra.json`
   mob verdicts date from 2026-08-22.
3. Re-derive offline: items.json, mobs.json (eraTag + outOfEra from fresh text), quests/spells if
   their caches moved, mobFactions/mobRaces (slayer-tab `gen-mob-*`), respawns; `data-diff.mts`
   and `validate-data.mts`; `gen:data-weight` on the merged tree (committed on local-data-refresh).
4. Gate the merged tree, run the log check (below), merge, rebuild the engine (`npm run
   build:engine`: the engine embeds mobs.json), owner tests, then push every touched branch.
5. Expected visible change: A cave bat (and other Warrens/Stonebrunt mobs edited since August)
   come in by the wiki itself, not only through the owner's log.

## Re-runnable checks (scripts in the session scratchpad; recreate if gone)

- Log evidence: scan archive (`%APPDATA%/everquest-companion-dev/log-archive/*.log.gz`) + live log
  for looted items (`You have looted a X from Y's corpse` / `You looted a X from Y's corpse`),
  mobs (slain / has been slain by / con lines / loot sources), zones (`You have entered X.`),
  spells (`begins casting` — only the player's own casts count for spell era).
- Log check: feed those sets with `setMet` into a merged tree's `metInLog.ts` and assert every met
  mob row passes `mobOutOfEra` = false, every entered zone passes `zoneEra`, every looted item key
  is `wasMet('items', …)`.

## Open owner items

- Push is pending the owner's test of the merged build.
- `wiki-scraper-fixes` has open upstream PR #84; pushing updates it.
- Creator-code bugs found that RULES.md rule 20 says to file upstream: spell scraper wrote an
  empty catalog on an error body; scrape-bosses paced 80/120 ms; release triage sorts `main.10`
  before `main.9` (not fixed: `releaseNotes.ts` is the creator's).
