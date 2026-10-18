# Agent notes: refreshing wiki data

How to bring the committed wiki corpus up to date. Running any of this is an owner decision
(RULES.md rule 15; WORKFLOW.md "Wiki and network"). Output lands on `local-data-refresh`.

## When

Baseline: a full fresh scrape of every wiki file on 2026-10-18 (the phase doc in `../plans/` has the
run, the checks and what was kept). From then on refreshes are the delta only (owner, 2026-10-18).
The wiki keeps about 90 days of changes, so a delta must run within 90 days of the last stamp; past
that it refuses and only a full scrape is left. Respawns, mob factions and races derive offline
from the mob cache; classes, Plane of Sky, bosses and the era verdicts are not yet covered.

After a game patch or zone rework, give wiki editors a few days, then run the delta. The Gear
tab's "wiki data from <date>" caption shows the current `scrapedAt`. Before the run, tell the
owner which files it touches: the delta folds `items.json`, `mobs.json`, `spells.json` (with the spell
title index) and `quests.json` (with the quest cache). Since 2026-10-10 it
lists every changed page it read and folded nowhere (spell, quest, class, Plane of Sky, redirect),
and closes with every wiki-derived file it leaves stale and the command that refreshes each.

## Delta procedure (items.json + mobs.json)

The script is `scripts/scrape-delta.mts` on `scrape-delta-tool` (not on the data branch). It reads
MediaWiki `list=recentchanges` since `items.json`'s `scrapedAt` and fetches only changed ns0 pages
at 1 request per second, through the creator's own parsers (output byte-compatible, keys are
lowercased names). A 3-week window was ~1,200 pages in ~25 batched requests.

1. `npx tsx scripts/scrape-delta.mts --dry-run` from the main clone to see volume. It reads the
   wiki, so it is part of the owner's run, never a development check (WORKFLOW.md).
2. Make a throwaway worktree of `local-data-refresh` under the session temp dir with a
   `node_modules` junction, copy the script in, run it for real there. The dev app can stay up.
3. `npm run gen:data-weight` (`dataWeight.test` pins exact bytes of every data JSON).
4. `node --import tsx --test tests/itemsDb.test.mts tests/dataWeight.test.mts`.
5. Commit on `local-data-refresh`.
6. Gate the merged result in a second scratch worktree
   (`git worktree add --detach <scratch>/mc main_community`, merge, typecheck/lint/test) and
   compare `^✖` lines against a baseline run at `main_community`'s head.
- Since 2026-10-10 the delta follows moves (reads by pageid, so the current title comes back),
  removes a page that was deleted, became a redirect or is no longer an item or mob, re-reads
  restores, and re-decides every key a change touches (a page's own title wins its key; an
  `|itemname` alias only takes a key no title holds). A page that came back unreadable holds
  `scrapedAt` back and is named.
- It writes the text it fetched back into `scripts/sources/cache/{items,mobs}` only where those
  caches exist. The throwaway worktree of step 2 has none, so it warns that `scrape:page-era`,
  `gen-mob-races` and `gen-mob-factions` still read the last full scrape's text.
- Moves stamped past before that fix are not seen again: `Megan OReilly` and
  `Solusek kobold king` in `mobs.json` are the wiki's `Megan O`Reilly` and `A kobold king`.
  Repair is a full `scrape:mobs`, or a delta from an earlier date (no `--since` option yet).
7. Remove the junctions first (`(Get-Item <wt>\node_modules).Delete()`), then
   `git worktree remove --force`. Only the final merge into the main clone needs the dev app
   closed.

## Expect new reds, and clear them

New wiki content turns the creator's census tests red. Each failing test names its tokens.

- gearIndex family ("slots/classes/sockets/tiers tokens are canonical", "class/slot table covers
  the corpus", "unindexed stat keys are exactly the five", `eraFromTag` token-for-token, layer-3
  census): add the new tokens to the hand-authored normalization/era tables they point at.
- A case or punctuation variant is folded in the test, not reported (WORKFLOW.md, wiki tokens).
- A real wiki typo: give the owner the page link, the exact current text and the exact
  replacement; the owner edits the wiki; a second delta run (seconds) reads it back.
- Fact pins and floors move on `local-data-refresh`. Census tests that compared raw spellings or
  required a key the wiki dropped move on `catch_all`, written to hold on BOTH main's corpus and
  the refreshed one.
- `bundledImages` ("every item icon in the bundle"):
  `npx tsx scripts/fetch-wiki-images.mts --seed "$APPDATA/everquest-companion-dev/image-cache"`
  first (its `--dry-run` still copies seeded files), then the real run. Item icons 1918 and 1920
  are 404 upstream and stay missing.
- A top-up is not finished until those reds are cleared (BRANCHES.md, known reds).

## Plane of Sky quests (posky.json): not covered by the delta

`npm run scrape:posky` reads the rendered `Plane of Sky` page plus one request per item/reward page
(~209). Since 2026-10-17 every scraper sends through `scripts/sources/wikiApi.ts` (1 s apart, maxlag,
retries 429/5xx); posky names pages that ended without stats, and refuses to write when any class
yields no quests.
A posky rescrape trips two audits by design: rows in `skyQuestRewards.ts` the wiki has caught up to
must be deleted, and `achievementInference` needs every reward to match the game's achievements
file.

## Other scrapers

`npm run scrape:quests|bosses|spells|page-era|mobs|classes` run only on the owner's word. A real `scrape:spells` refuses to write when the wiki lists no spell pages or under half the catalog (an error body or an outage); `--allow-shrink` overrides after a look.
`npm run scrape:classes -- --offline` (since 2026-10-17) re-derives `classes.json` from the committed
cache with zero requests and keeps `scrapedAt`; run it on `local-data-refresh` with the scraper files
copied from the `wiki-scraper-fixes` worktree (it needs that branch's `revCache.ts` and `isMain.ts`).
`scrape:spells`, `scrape:classes` and (since `wiki-scraper-fixes`) `scrape:quests` are
revid-checked: one request per 50 titles, then content only for pages whose revision moved, so a
rerun is cheap; the quest scraper's first run builds its index (~38 requests). `scrape:mobs` was
run once (2026-09-29, 2,547 pages, ~2 min) by seeding `cache/mobs` from `cache/items` first; that
seeding served 5,406 pages from the August item cache and stamped them as new, so a run that sets
a new baseline passes `--refresh`.

The parser fixes of `wiki-scraper-fixes`, `faction-tab` and `slayer-tab` reach the shipped data
only when it is re-derived. Every wiki-derived file re-derives from the caches with zero requests:
items, mobs, quests, `mobFactions.json`, `mobRaces.json`, `spellLines.json`, respawns, and since
2026-10-10 spells (`npm run scrape:spells -- --offline`, which needs the page titles a real run
records in `cache/spells/index.json`; the spell name is the page title, `Healing Water`, not the
page's copy-pasted `|spellname = Greater Healing`). After a spell re-derive, the name corrections
in `spellCorrectionsList.ts` and `engine/crates/eqlog/data/spell-overlay.json`
(`npm run gen:engine-spell-overlay`) follow in the same change, on `catch_all`.

## The ETL, as the owner wants it run (2026-10-10)

1. **Extract**: a real run fetches changed pages into the committed caches. Owner's word, 1 req/s.
   Run the delta where `scripts/sources/cache/{items,mobs}` exist (junction the main clone's into a
   worktree first): the 2026-10-10 run tree had neither, so its item and mob text was never kept
   and those files could not be re-parsed later; only its parsed output survives. After a top-up,
   `npm run fetch:images` (one request per missing icon; 41 on 2026-10-10) and, for new spell
   names, `scrape-page-era-spells.mts`. `mobFactions.json`/`mobRaces.json` read the mob CACHE,
   so a mob page the wiki renamed (`a dwarven merc`, `Cazic-Thule (God)`) misses its faction and
   race rows until the next mob scrape refreshes that cache.
2. **Transform**: the parsers, run offline over the caches. A parser fix means a re-parse, never a
   hand edit of a data file.
3. **Compare against what is known** before a data commit: `npx tsx scripts/data-diff.mts` (what
   changed, record by record; cite it in the commit) and `npx tsx scripts/validate-data.mts`.
   The wiki is the only source for scraping; the owner's log is the truth for what the game
   prints; the game's own files (`spells_us.txt`) may be parsed ONCE, at dev time, to find wiki
   errors (`validate-data --client-spells <path>`), and nothing in the app or a scraper reads them.
   A wiki title the client has never heard of is fixed on the wiki, or named in
   `spellCorrectionsList.ts` with evidence; the scraper does not guess.
4. **Load**: the data commit on the file's branch, gated on the merged tree.

A spell re-derive leaves its new or renamed names without an era verdict (`spellEra` tests go
red). `npx tsx scripts/scrape-page-era-spells.mts` asks the era endpoint for only those names, one
request per 450, and merges them into `pageEra.json`; `--dry-run` names them and sends nothing.
A full `scrape:page-era` would re-ask every batch the new names shift (about twenty requests).

Done 2026-10-10 for every file. To re-derive `items.json`/`mobs.json` offline without undoing
later top-ups, replace a record only where the pre-fix parser reproduces it exactly from the
cached page; keep it otherwise (its page changed after the cache). Rulings from that review:
a faction bullet stating `(-0)` is a listed hit of unstated size and the mob stays in
`mobFactions.json` (a faction the page lists is shown); a quest's minimum level comes only from a
`Minimum Level` cell (a `Recommended Level` is not one); a page the wiki marks `{{Delete}}` is not
a spell; a `Song:` title prefix is decoration. The client audit of the 2026-10-10 catalog: 85 of
2,013 spell names are not game names, four of them title typos whose `|spellname` is the game's
(Largo's Absonant Binding, Rapacious Subversion, Selo's Assonant Strane, Wind of Tishani), the
rest alias pages and NPC spells; before the re-derive, 118.

## Wiki facts that matter to parsers (as of 2026-09-27)

- `{{Sky Era}}` was retired: ~107 pages became `{{Classic Era}}`, ~45 have no banner. Pre-upgrade
  Sky rewards carry `{{Delete}} Replaced with X in EQL`; the app does not read that marker and the
  delta never drops a page.
- Per-class Sky test pages became `Plane of Sky#<Class> Tests` sections, so ~340
  `questUses.page` values no longer match quests.json/posky.json; `eraDerive` looks up
  `use.page ?? use.quest`, so its quest edge misses on them. The app's Sky links are built from
  posky.json and are unaffected.
- `{{Legacy of Ykesha Era}}` does not exist as a template on the wiki.
- Itempage fields: `|dropsfrom` = mobs, `|playercrafted` = how it is made, `|recipes` = what it is
  used in.
- Verifying a suspicious delta costs one request: `prop=revisions` for up to 50 titles.
- `scripts/sources/cache/quests` (and spells) wikitext caches ARE committed; mobs' is not. Quest
  facts (e.g. faction receipts) can be re-extracted with zero requests.

## Not every "the scrape broke it" is the scrape

Recommended-tab bars come from EQUIPPED items only. Check the inventory export's date and its
equipped slots before suspecting data; the remedy is equip + `/outputfile inventory`.

## In-game freshness to suggest to a player

- `/outputfile inventory`: gear, ownership, bars (the app reloads it on view open).
- `/outputfile achievements`, `/outputfile faction` (singular): achievements and factions tabs.
- `/who`: level and class detection, and group-mates' classes.
- `/pet who leader` after each zone-in: group-pet crediting (binds drop on every zone line by
  design).

## Audits

The whole Gaps list for a log, offline: concatenate the archived `.log.gz` and the live log into one
file named `eqlog_<Name>_<server>.all.txt` (the harness wants a slice-shaped name), then from a
`main_community` checkout's `engine/`: `GAPS_LOG=<file> GAPS_OUT=<out.json> cargo test --release -p
knowledge --test gaps_corpus -- --ignored --nocapture`. Fold against `main_community`, not a branch off
`main`: the data differs and so do the counts.

Dated, offline measurements of the data against the owner's log and the caches live in `docs/community/audits/`. The 2026-10-11 one (`2026-10-11-data-gaps.md`) is the reference for what the log names that the data lacks, what the caches hold that the data lacks, and where a re-derive from THIS clone's item and mob caches would regress (they are older than the committed data; refresh them first). Its section 4 is the to-do list.
