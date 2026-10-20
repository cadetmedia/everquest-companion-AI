# The wiki (eqlwiki.com): reference

What a session needs to know about the EverQuest Legends wiki before scraping it, parsing it, or
writing pages for it (the Gaps tab). Facts are dated; re-check a fact before relying on it after a
long gap. How to refresh the app's copy of the wiki: `DATA_REFRESH.md`.

## Links

- Site: https://eqlwiki.com/ (pages at the root: `https://eqlwiki.com/Page_Title`, never `/wiki/`;
  `src/shared/wiki.ts`).
- API: `https://eqlwiki.com/api.php` (MediaWiki). Every scraper calls it through
  `scripts/sources/wikiApi.ts`.
- Editing help and the page blueprints: https://eqlwiki.com/Help:Contents (sections NPC, Merchant,
  Item, Spell Page Blueprint; drop-frequency table; categories; images; editing standards).
- Template docs: `Template:Namedmobpage`, `Template:MerchantPage`, `Template:Itempage`,
  `Template:Spellpage` (pages on the wiki).
- The owner edits as **Kaltinril** (`DATA_REFRESH.md`, "Whose edits a delta brought in").

## Rules for us

- **Every wiki text we read is cached** (owner, repeated; 2026-10-19). A scraper writes what it
  fetched under `scripts/sources/cache/<kind>/` and re-derives offline (`--offline`) from it. A
  parser fix is a re-parse of the cache, never a hand edit of a data file.
- **1 request per second, honest User-Agent naming the fork.** No retries on permanent errors;
  50 pages per request where the API allows it.
- **Development, testing and validation send zero requests** (owner, 2026-10-10). A `--dry-run`
  that reads the wiki counts as a request. Real runs are the owner's call.
- **No runtime fetch for Gaps.** The tab reads committed data and local caches only.
- **The wiki's own rule on AI text** (Help:Contents, Editing Standards): "All graphics and readable
  page text should be crafted by real human contributors". Tools may polish spelling and grammar.
  Gaps copies structure and the player's own measurements (levels, rates, locations), never
  generated prose; the player finishes the page from a screenshot.
- **Out-of-era content is not allowed on the wiki** (Help:Contents). Pages carry an era banner.

## Page types and their templates

| Type | Template | Key fields | Our parser | Data file |
| --- | --- | --- | --- | --- |
| NPC / named mob | `{{Namedmobpage` | imagefilename, name, race, class, level, zone, location, respawn_time, special, description, known_loot, common_loot, factions, opposing_factions, related_quests | `scripts/sources/mobPage.ts`, `src/main/mobLookupParse.ts` | `mobs.json` |
| Merchant | `{{MerchantPage` | as NPC, plus items_sold (no loot fields) | same | `mobs.json` (`merchant: true`) |
| Item | `<onlyinclude>{{Itempage` | itemname, lucy_img_ID, statsblock, merchant_value, dropsfrom, relatedquests, playercrafted, recipes, soldby, foraged, notes | `src/main/itemLookupParse.ts` via `scripts/scrape-items.ts` | `items.json` |
| Spell | `{{Spellpage\|` or `{{Spellpagesmart\|` | spellname, spellicon, description, classes, mana, range, casting_time, recast_time, duration, target_type, spell_type, resist, msg_cast_on_you/other, msg_wears_off, where_to_obtain | `scripts/sources/spellCache.ts` and the spell scraper | `spells.json` |
| Quest | quest templates | | `scripts/sources/questPage.ts` (faction-tab) | `quests.json` |

A page is a mob page only if its OWN text opens the template (indirect transclusions such as
`{{:A zol ghoul knight}}` on a quest page do not count; `mobPage.ts` header).

## Conventions (measured on the cached pages)

- **Era banner** first: `{{Classic Era}}` (also Kunark, Velious, Luclin, revamps, Epics). `{{Sky
  Era}}` was retired 2026-09. The banner decides a page's era (`mobs.json eraTag`).
- **Level** as a range is written unspaced, `11-13` (983 pages) more often than `11 - 13` (281).
- **Location**: `|location = (y, x)`, the same order as the game's `/loc`; some pages write
  `100% @ (-1128, -2923)`.
- **Zones** on a mob page: one link, a comma list for several (143 + 43 pages), `Various` (22).
  Zone categories end the page: `[[Category:North Qeynos]]`. A category never follows a redirect,
  so it must use the wiki's own zone spelling (`Plane of Hate`, `The Hole`, `Lower Guk`), which the
  Gaps tab reads off the catalog (`src/shared/gapWikiZone.ts`).
- **Images**: NPC portraits are `npc_<name lowercase, non-alphanumerics as _>.png` (6,207 of 7,355
  named images). Upload: `Special:Upload&wpDestFile=<name>`. 6,364 of 7,954 mob pages name a file
  nobody uploaded (`mobs.json noImage`, from the cached file list).
- **Loot lines**: `<li> {{:Item}} <span class='drare'>(Rare)</span> <span class='ddb'>[...]</span></li>`.
  Rarity bands (Help:Contents): Always 100%, Common >= 50%, Uncommon >= 25%, Rare >= 5%, Ultra Rare
  < 5%. The wiki's `ddb` holds loot-table data no log has; Gaps writes `[Overall: ~N%]`, the
  player's corpses over kills. The wiki writes one decimal (`25.0%`) on most pages.
- **known_loot vs common_loot**: known_loot is the mob's own drops (4,008 pages carry rate lines);
  common_loot is on 195 of 7,954 pages and holds loot shared across mobs: tables such as `Classic
  Raid Tier Treasures` (58 pages) and a zone's set loot (Plane of Fear/Hate belts and bracelets, 11
  pages each). Groups (`[[Rusty Weapons]]`) appear in both; members are listed one by one more often
  than the group link.
- **Factions**: `* [[Faction]] <span class='profac'>(-30)</span>` under `|factions` (lowered by a
  kill); `<span class='oppfac'>(10)</span>` under `|opposing_factions` (raised). `* None` when known
  to be none (most pages), `(?)` when unknown.
- **Item soldby**: `{{ItemWhereTable|` + `{{ItemWhereRow | [[Zone]] | [[Vendor]] | | (x, y) }}` on
  1,243 of 1,278 pages that fill it.
- **Merchant items_sold**: `<li> {{:Item}} <span class='ddp'>(5gp 2sp 4cp)</span>`.
- **merchant_value** (item): `2s 7c` style.
- **Spell pages**: NPC-only spells say `| classes =` then `This spell is cast by NPCs only.` and
  carry `[[Category:NPC Only Spells]]` (321 and 311 of 354 cached NPC-only pages).
- **Redirects** send common spellings to the page (`Hoptor Thaggelum` -> `The Ghoul Lord`; item
  links such as `A Wooden Heart` -> `Wooden Heart`). Pages titled with an article (`A skeletal
  finger`) are reached from the bare name by a redirect. The wiki asks that prefixes like a, an, the
  stay in titles where they match the game (Help:Contents, NPCs).
- **Disambiguation**: same-named NPCs get a qualifier, `Orc Centurion (Crushbone)`; `Cazic-Thule
  (God)`. Pick by zone, never guess (`src/shared/gapMobPage.ts`).
- **Create a page**: the wiki's editor on a new title offers "Create from a Blueprint" (the first
  `<pre>` under each Help:Contents heading ending in "Blueprint"). The Gaps tab's Create page link is
  `index.php?title=<Title>&action=edit&redlink=1`; on an existing title it lands on the page.

## What the log can and cannot give a page

- From the log: level range (`/con`), location (`/loc` within 10 s of a hail or `/con`), loot and
  rates (corpses over kills), factions with their amounts and direction, merchant status (a quote,
  a purchase, a sale), forage zones, Rampage and Flurry (`special`), the vendor value from an
  instant sale on loot (sale x 1.4 / 1.05, MEASURED.md).
- From the game's own files at runtime (owner, 2026-10-19, for spell pages only): classes and
  levels, mana, range, cast and recast time, resist, the three messages
  (`src/main/gapSpellFacts.ts`; field map in `src/main/resist/spellsUsParse.ts`).
- Never from the log: stats, slot, icon, race, HP, damage, respawn time (death-to-death floors at
  the fight length), summons or immunities (Legends prints none), a merchant's stock (vendor stock
  and player resells cannot be told apart; owner, 2026-10-18).

## The caches (where each wiki text lives)

| Kind | Path | Committed | Refresh |
| --- | --- | --- | --- |
| Items | `scripts/sources/cache/items/` | no (~30 MB) | `scrape:items`, the delta |
| Mobs | `scripts/sources/cache/mobs/` | no | `scrape:mobs`, the delta |
| Spells | `scripts/sources/cache/spells/` | yes | `scrape:spells` (revid-checked), the delta |
| Quests | `scripts/sources/cache/quests/` | yes (faction-tab) | `scrape:quests`, the delta |
| Classes | `scripts/sources/cache/classes/` | yes | `scrape:classes` |
| Era verdicts | `scripts/sources/cache/page-era/` | yes | `scrape:page-era` |
| Drop groups | `scripts/sources/cache/drop-groups/pages.json` | yes (gaps-tab) | `scrape-drop-groups.ts` |
| File list | `scripts/sources/cache/files/files.json` | yes | `scrape-wiki-files.ts` |
| Rendered pages | `scripts/sources/cache/rendered/` | no | posky, bosses |
| Redirects | `scripts/sources/cache/redirects/redirects.json` | not yet: first run is the owner's call (~19 requests) | `scrape-mob-redirects.ts`, kept current by the delta |
