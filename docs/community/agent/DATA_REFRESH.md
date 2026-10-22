# Agent notes: refreshing wiki data

How to bring the committed wiki corpus up to date. Running any of this is an owner decision
(RULES.md rule 15; WORKFLOW.md "Wiki and network"). Output lands on `local-data-refresh`.

## When

Baseline: a full fresh scrape of every wiki file on 2026-10-18 (the phase doc in `../plans/` has the
run, the checks and what was kept). From then on refreshes are the delta only (owner, 2026-10-18).
The wiki keeps about 90 days of changes, so a delta must run within 90 days of the last stamp; past
that it refuses and only a full scrape is left (next one due before about 2027-01-16).

After a game patch or zone rework, give wiki editors a few days, then run the delta. The Gear
tab's "wiki data from <date>" caption shows the current `scrapedAt`. Before the run, tell the
owner what it touches: it folds `items.json`, `mobs.json` (with redirects as `otherNames`),
`spells.json` (with the spell title index) and `quests.json` (with the quest cache), then refreshes
every other file the changes reach (next section). It lists every changed page it read and folded
nowhere, and closes with any wiki-derived file it left stale and the command that refreshes it.

## What the delta covers (since 2026-10-18, `sources/deltaFollow.ts`)

| File | When | How |
| --- | --- | --- |
| `mobs.json` `otherNames` | a redirect page changed | folded from the read text (`sources/mobRedirects.ts`) |
| `respawns.json` | a mob page changed | rebuilt from the mob cache, zero requests; refuses if a catalog page is missing from it |
| `mobFactions.json`, `mobRaces.json` | a mob page changed | `gen-mob-factions.mts`, `gen-mob-races.mts` over the cache |
| `classes.json` | a class page changed | `scrape-classes.ts` (revid-checked) |
| `pageEra.json` | items, mobs or spells changed | `scrape-page-era.ts --fresh <changed titles>`: only batches holding a changed or new name are asked |
| `posky.json` | always | `scrape-posky.ts` through the render cache: one revid request per 50 pages, only moved pages rendered again; `--refresh` (all ~209) when the template feed (ns10) shows a change |
| `spell-overlay.json` | spells changed | `gen-engine-spell-overlay.mts` |
| `resources/wiki-images` | always; a File: page changed | the bundled copy is dropped, then `fetch-wiki-images.mts` fetches what is missing |
| `dataWeight.generated.json` | always | `gen-data-weight.mts` |
| `dropGroups.json` (gaps-tab) | a mob page or a cached group page changed | `scrape-drop-groups.ts --fresh <changed titles>`: only a page its cache lacks or the feed names |
| `bosses.json` | always | `scrape-bosses.ts`: every portrait it has is kept; only a target with none is looked up, through the render cache; a changed boss page is also named |
| `cache/files/files.json`, `mobs.json` `noImage` | always | `scrape-wiki-files.ts --fresh <changed File: titles>` (50 a request), else `--offline`; re-marks every mob whose page names no image or one the wiki lacks |

A script missing from the checkout it runs in (the generators live on slayer-tab) is named stale.

## Delta procedure

The script is `scripts/scrape-delta.mts` on `scrape-delta-tool`. It reads MediaWiki
`list=recentchanges` (articles, then File:) once from the oldest stamp and fetches only changed
pages at 1 request per second, through the creator's own parsers (output byte-compatible with the
full scrapers). A 3-week window was ~1,200 pages in ~25 batched requests.

1. `npx tsx scripts/scrape-delta.mts --dry-run` from the main clone to see volume. It reads the
   wiki, so it is part of the owner's run, never a development check (WORKFLOW.md).
2. A scratch tree that has every script and the caches:
   `git worktree add --detach .claude/worktrees/delta-run main_community`, then junctions to the
   main clone's `node_modules`, `scripts/sources/cache/items`, `scripts/sources/cache/mobs` and
   `scripts/sources/cache/rendered` (gitignored, so the run keeps their text current where they
   live; without `rendered`, posky and bosses render ~209 pages again). The dev app can stay up.
3. `npx tsx scripts/scrape-delta.mts` there (`--spell-titles` the first time). It folds, writes the
   caches back, runs the follow-ups above and re-measures the byte ledger.
4. `npx tsx scripts/data-diff.mts` and `npx tsx scripts/validate-data.mts`; cite the diff in the
   commits.
5. Each changed file to its branch: quests and the quest cache to faction-tab, mobFactions and
   mobRaces to slayer-tab, the spell overlay to catch_all, everything else (items, mobs, spells and
   their cache, classes and its cache, pageEra and its cache, respawns, posky, images, the ledger)
   to local-data-refresh; dropGroups.json and `cache/drop-groups` to gaps-tab.
6. Gate the merged result in a second scratch tree and compare `^✖` lines against
   `main_community`'s head; clear the census reds (next section).
7. Remove the junctions first (`(Get-Item <wt>\node_modules).Delete()`, the same for the three cache
   junctions), then `git worktree remove --force`.
- Known gap (2026-10-20 run): the quest scraper tells items by `cache/quests/item-titles.json`, a
  category listing cached once and never refreshed by the delta, so a quest linking a moved or new
  item page loses that requirement (Armor of Ro Quests lost `A Dark Cauldron`, now `Dark Cauldron`).
  Proposed: the delta adds the item pages it folds to that list and drops the ones it removes
  (scrape-delta-tool), or the owner approves a re-list of the item categories. Owner to decide.
- mobs.json `factionAmounts` (wiki-scraper-fixes, 2026-10-20) comes from the parser the delta folds
  with; the first delta after it kept it 1:1 with `factions` on every record.
- The delta follows moves (reads by pageid), removes a page that was deleted, became a redirect or
  is no longer an item or mob, re-reads restores, and re-decides every key a change touches. A page
  that came back unreadable holds `scrapedAt` back and is named.
- Mob redirects after a full `scrape:mobs` (which writes records without them):
  `npx tsx scripts/scrape-mob-redirects.ts` (2026-10-18: 4,482 redirects in 19 requests, 516 on
  463 mobs). Since 2026-10-19 the list is cached at `cache/redirects/redirects.json` and
  `--offline` re-applies it at zero requests; the delta keeps it current. First real run
  2026-10-21 (owner, "yes P3a"): 19 requests, 4,485 redirects, 517 on 464 mob pages, committed on
  local-data-refresh; the full list matched the delta-kept otherNames byte for byte. mobs.json now
  re-derives fully offline.
- A new field from an existing parser (2026-10-19, `commonDrops`): re-parse the cached pages with
  the fixed parser and take the field into a record only where the re-parse reproduces the record's
  other parser fields exactly; a full `scrape:mobs` would drop `otherNames` until the redirect
  cache exists.

## Expect new reds, and clear them

New wiki content turns the creator's census tests red. Each failing test names its tokens.

- `itemsResearch.json`'s instrument table is pinned both ways against the corpus: a page that stops
  stating an instrument loses its entry, and the floor drops with it, on local-data-refresh
  (2026-10-21: Unfinished Lute Neck, 47 to 46).

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

## Plane of Sky quests (posky.json)

`npm run scrape:posky` reads the rendered `Plane of Sky` page plus one request per item/reward page
(~209). Since 2026-10-18 the renderings are cached by revid (`sources/renderCache.ts`, gitignored
`cache/rendered/<site>/`): a run asks one `rvprop=ids` request per 50 pages and renders only moved
pages; `--offline` sends nothing, `--refresh` renders all (a template changed: the Itempage template
adds `DMG Bonus` itself). A checkout without the cache renders all once. Since 2026-10-17 every scraper sends through `scripts/sources/wikiApi.ts` (1 s apart, maxlag,
retries 429/5xx); posky names pages that ended without stats, and refuses to write when any class
yields no quests.
A posky rescrape trips two audits by design: rows in `skyQuestRewards.ts` the wiki has caught up to
must be deleted, and `achievementInference` needs every reward to match the game's achievements
file.

## Boss portraits

- If either wiki has an image of a boss, use it (owner, 2026-10-18). Since 2026-10-18 scrape-bosses
  keeps every portrait bosses.json has and looks up only a target with none, so a run cannot lose a
  hand-picked one; the delta runs it every time and names changed boss pages for a look. eqlwiki and P99 both name NPC
  portraits `Npc_*`; scrape-bosses prefers those over the page's first image (a map, for Phinigel).
- On 2026-10-18 the P99 wiki's `action=parse` failed for every boss (about 35 s of retries each)
  while its image files downloaded fine; the scraper then fell back to eqlwiki for all of them.
  Compare a run's `bosses.json` with the committed one before landing it.

## Where the caches are (after the 2026-10-18 re-baseline)

- The fresh item and mob caches (gitignored) are in the main clone's `scripts/sources/cache/{items,mobs}`;
  a delta run there keeps their text current. The pre-baseline copies are archived at
  `.claude/worktrees/cache-backup-2026-10-18-items-mobs.tar.gz`.
- Spell, quest, class and era-verdict caches are committed (local-data-refresh; quests on faction-tab).

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

## Whose edits a delta brought in

- The owner edits eqlwiki as **Kaltinril**. Before calling a delta's changes the owner's, list them:
  `api.php?action=query&list=usercontribs&ucuser=Kaltinril&uclimit=100&ucprop=title|timestamp|comment`
  (one request). 2026-10-18 evening: the owner made the Oggok NPC pages, the portraits and Black
  Lizard Talon; the 24 item stat re-reads and the Sky weapons' `DMG Bonus` change were other editors'
  (the local-data-refresh commit of that run calls them all the owner's; it is not).
- The Itempage template renders a weapon's `DMG Bonus: N @ lvl 50` itself, after the statsblock's
  last `<br>`; scrape-posky turns every `<br>` into a line break so it keeps its own line.

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

The app's Gaps tab merges the archived months with the live log, and an archive's rows are as the
version that recorded it read them (refreshed automatically once per update since 2026-10-18). An
audit of the live log alone misses them: on 2026-10-18 it said the pet rows were gone while the
test.19 archive still served 140 of them. The archive lives where the app's Preferences card says
(here `<EQ>/Logs/companion-archive`), not only `%APPDATA%/everquest-companion-dev/log-archive`.

The whole Gaps list for a log, offline: concatenate the archived `.log.gz` and the live log into one
file named `eqlog_<Name>_<server>.all.txt` (the harness wants a slice-shaped name), then from a
`main_community` checkout's `engine/`: `GAPS_LOG=<file> GAPS_OUT=<out.json> cargo test --release -p
knowledge --test gaps_corpus -- --ignored --nocapture`. Fold against `main_community`, not a branch off
`main`: the data differs and so do the counts.

Dated, offline measurements of the data against the owner's log and the caches live in `docs/community/audits/`. The 2026-10-11 one (`2026-10-11-data-gaps.md`) is the reference for what the log names that the data lacks, what the caches hold that the data lacks, and where a re-derive from THIS clone's item and mob caches would regress (they are older than the committed data; refresh them first). Its section 4 is the to-do list.
