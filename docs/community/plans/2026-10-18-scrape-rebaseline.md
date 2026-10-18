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
  (2,953 mobs after the 2026-10-18 re-baseline); `spells.json` and `quests.json` carry `eraTag`.
  Filled from the full 2026-10-18 re-scrape (next sections).
- One mob predicate `src/shared/mobEra.ts` (`mobOutOfEra`) over `src/shared/metInLog.ts` (the log
  evidence store, fed by `src/renderer/src/lib/useMetInLog.ts` from the engine's kills, loot,
  consider and progression modules). Zones (`era.ts zoneEra`) and items (`plannerData.ts
  donorEra`) honour the log too. Both shared files are byte-identical on catch_all, slayer-tab,
  map-improvements, map-waypoints, gear-progression-plan.
- Surfaces: Achievements Where to go / slayer map / Zone I'm in; Mobs roster (hide) and search
  (tag); map pane, pins, bands, wish counts, level caption; Plan zone levels and mob levels;
  Factions work panel (quests); loot detail droppers / quests / item chip; spell ladder.
- Verified on the owner's whole log after the re-baseline: 2,330 mobs, 2,265 looted item keys, 143
  zones met; none out of era.
- Known gaps: spells are NOT fed from the log (a cast spell the wiki marks out stays out); the
  in-game map overlay window shows every mob (it gets no log evidence); `questOutOfEra` exists in
  both `shared/questEra.ts` (faction-tab) and `shared/planner/era.ts` (catch_all); a stale comment
  in `features/maps/mobPins.ts` mentions `rosterInZone`.

## The scrape defect (fixed 2026-10-18 by a full re-baseline)

- Found 2026-10-18 via "A cave bat": wiki rev 177918 (2026-09-11) is `{{Classic Era}}`; the cache
  and data held rev 106364 (`{{Velious Era}}`).
- Cause: `scrape-mobs.ts` reads any cached page with no revision check; on 2026-09-29 its cache was
  seeded from the August item cache (5,406 pages carried forward). The item cache has the same
  no-revision design; the 2026-10-10 delta ran without caches, so its fetched text was lost.

## Re-baseline: DONE 2026-10-18 (owner chose a full re-scrape over the August delta)

- Backup first: every branch committed and pushed; the gitignored item and mob caches archived at
  `.claude/worktrees/cache-backup-2026-10-18-items-mobs.tar.gz` (21,585 files).
- Run in a scratch `main_community` tree with EVERY cache emptied (committed ones too), 1 req/s:
  `scrape:items --refresh` (378 batches), `scrape:mobs --refresh` (7,964 candidates), `scrape:spells`,
  `scrape:quests --refresh`, `scrape:classes`, `scrape:posky` (208 item pages), `scrape:bosses`,
  `scrape:page-era --refresh` (70 requests), `scrape-page-era-spells` (0 left). Respawns were derived
  offline from the fresh mob pages through scrape-respawns' own `rowsFromBatch`/`dedupe` (same
  pages, same order, 158 requests saved); `gen-mob-factions`, `gen-mob-races`, `gen:spell-lines`,
  `gen:engine-spell-overlay` (unchanged), `gen:data-weight` on the merged tree.
- Before each type's full run, one request of 50 known pages went through the real parsers and was
  compared with the committed records (owner's ask): mobs 50/50, spells 49/50, quests 46/50 (the 4
  differ only through the sample's item list), Plane of Sky 16 classes, 95 quests, set unchanged.
- Result (data-diff vs dd6f4a93): items 269 changed, +9/-12 (renames, redirects); mobs 141 changed,
  outOfEra +32/-20 (A giant cave bat in); Megan O`Reilly and A kobold king moves fixed; quests +3,
  34 changed; spells -Magical Monologue ({{Delete}}), Lower Element -> Lower Element I; respawns 545.
  Every loss was checked against the old and new page text: renames, redirects and editors' edits,
  except Sulgar (page blanked 2026-09-26; owner: trust the wiki, he may restore it there).
- bosses.json kept as committed: the P99 wiki failed every portrait request (each target ~35 s of
  retries, then eqlwiki at 900px; Protector of Sky got a blank `Item_.png`, Sister of the Spire a
  placeholder). Tonight's eqlwiki file is kept at `.claude/worktrees/bosses-eqlwiki-2026-10-18.json`
  for the owner to decide on (it adds Phinigel Autropos and Master of Spite portraits).
- The scrapers' and the delta's User-Agent now name the fork (github.com/kaltinril/everquest-companion).
- Owner dropped the planned revision-tracked caches: "after this run we only need to hit the changes
  endpoint". The wiki keeps ~90 days of changes, so the next delta must run before ~2027-01-16.

## Next: every future refresh is the delta, and nothing is missed (owner, 2026-10-18)

The delta tool already reads the change feed once from the oldest stamp, takes `--since-<file>`,
refuses when the feed does not reach back, keeps fetched text where the caches exist, and folds
items, mobs, spells and quests. Not yet covered, so a delta-only refresh would leave them stale:
respawns (derivable offline from the mob cache), mobFactions/mobRaces (offline from the mob cache),
classes (~20 pages, revid-checked), Plane of Sky (the `Plane of Sky` page plus its reward item
pages), bosses (32 curated pages; P99 portraits), the era verdicts (pageEra.json, per changed name).
Requirement row: `requirements/scrape-delta-tool.md` 2026-10-18. Not started.

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
- Boss portraits: keep the committed P99 ones or take eqlwiki's (`.claude/worktrees/bosses-eqlwiki-2026-10-18.json`);
  the owner looks at the four that differ in substance first.
- Wiki fixes for the owner to make: restore Sulgar (blanked 2026-09-26,
  https://eqlwiki.com/index.php?title=Sulgar&action=history); `Clockwork Merchant (LG-16)` has
  `|name = Clockwork Merchant (1105, -1030)`, should be `|name = Clockwork Merchant` like its 37 siblings.
