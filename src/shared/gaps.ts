// shared/gaps.ts — the Gaps tab's data: names the log mentions that the app's wiki data has no
// record of (owner ask, 2026-10-11).
//
// The engine's `gaps` module (engine/crates/fold/src/modules/gaps.rs) serves one row per unknown
// name, most mentioned first, at most 500 per domain, each with its details (gaps_details.rs):
// where the log named it, from whom, and the last lines the game printed. The tab's domain toggle
// and search box narrow those rows here rather than in the renderer, which never filters served
// rows (owner ruling 4); the Copy list text is rendered here for the same reason.

import type { KillFaction } from './gapFactions'
import { wikiPageUrl } from './wiki'
import { zoneKey } from './zones'

export const GAPS_MODULE_ID = 'gaps'

/** `merchant`: an NPC the log saw trading that the wiki lists as no merchant; `faction`: a faction a
 *  kill moved that the mob's page does not name (shared/gapFactions.ts); `drop`: an item looted from a
 *  mob whose page lists neither it nor its group (shared/gapDrops.ts); `image`: a mob met whose page
 *  has no image (shared/gapImages.ts) (owner asks, 2026-10-18). */
export type GapDomain = 'item' | 'mob' | 'spell' | 'merchant' | 'faction' | 'drop' | 'image'
export const GAP_DOMAINS: readonly GapDomain[] = ['item', 'mob', 'spell', 'merchant', 'faction', 'drop', 'image']
export const GAP_DOMAIN_LABELS: Record<GapDomain, string> = {
  item: 'Items',
  mob: 'Mobs',
  spell: 'Spells',
  merchant: 'Merchants',
  faction: 'Factions',
  drop: 'Drops',
  image: 'Images'
}

/** What the shown-count line calls a domain's rows: "Showing 11 of 395 mobs missing a wiki picture" (owner, 2026-10-19: "unknown images" read oddly). */
export const GAP_SHOWN_NOUN: Record<GapDomain, string> = {
  item: 'items with no wiki page',
  mob: 'mobs with no wiki page',
  spell: 'spells with no wiki page',
  merchant: 'merchants the wiki does not list',
  faction: 'factions missing from mob pages',
  drop: 'drops missing from mob pages',
  image: 'mobs missing a wiki picture'
}

/** One line under the toggle saying what the chosen domain's rows are (owner ask, 2026-10-18). */
export const GAP_DOMAIN_HELP: Record<GapDomain, string> = {
  item: 'Items your log names that the wiki has no page for.',
  mob: 'Mobs you looted, killed or considered that the wiki has no page for.',
  spell: 'Spells cast near you that the wiki has no page for.',
  merchant: 'NPCs who traded with you that the wiki does not list as a merchant.',
  faction: "Factions a kill changed that the mob's wiki page does not list.",
  drop: "Items you looted from a mob whose wiki page lists neither the item nor a group holding it. Drops that fall from almost any mob (the Motes) are left out.",
  image: 'Mobs you met whose wiki page has no picture: take a screenshot and upload it.'
}

/**
 * What to collect in game for each domain's page (review 2026-10-19): the Copy wiki page tooltip
 * says it, since a page the log could not fill needs a second trip otherwise.
 */
export const GAP_CAPTURE: Record<GapDomain, string> = {
  item: 'Screenshot the item window while you still hold it (its stats, slot and icon), then paste this and type the stats.',
  mob: '/con it (level), /loc then hail or /con it within 10 s (location), kill it (loot and factions), and screenshot it for its image.',
  merchant: '/con it (level), /loc then hail it within 10 s (location), and screenshot it for its image.',
  spell: "Screenshot the spell's description window (classes, mana, timings).",
  faction: "Kill the mob once more if the amount is missing; paste the line into the mob page's faction list.",
  drop: "Paste the line into the mob page's known_loot list.",
  image: 'Screenshot the mob, then upload it under the file name shown.'
}

/** A row's key in the Done marks (owner ask, 2026-10-19). */
export const doneKey = (row: GapRow): string => `${row.domain}:${row.name}`

/**
 * The Done marks to keep (`key -> the day it was marked`): a mark stays while its row is on the tab,
 * and after that until the wiki data is newer than the mark, when the refresh has learned the page.
 * A row's absence alone is no proof: the list fills in stages and swaps with the character.
 */
export function keptDoneMarks(marks: Readonly<Record<string, string>>, live: ReadonlySet<string>, dataDate: string): Record<string, string> {
  return Object.fromEntries(Object.entries(marks).filter(([k, markedOn]) => live.has(k) || markedOn >= dataDate))
}

/** The rows less the Mobs rows the player marked as players (lower-cased names). */
export function withoutPlayers(rows: readonly GapRow[], players: ReadonlySet<string>): GapRow[] {
  return players.size === 0 ? [...rows] : rows.filter((r) => r.domain !== 'mob' || !players.has(r.name.toLowerCase()))
}

/**
 * Whether the tab is unsure the row is a gap at all ("Hide uncertain", owner, 2026-10-19). Only a
 * row whose EXISTENCE is in doubt: today a one-word name only hailed or conned that may be a player
 * (`maybePlayer`). Not a near miss (`suggest`: the wiki lacks this exact spelling, so a redirect is
 * still owed), not a faction whose direction no line stated, not a drop whose mob page the catalog
 * could not pick, not a verdict of the runtime caches: those are real gaps with an unsure detail.
 */
export function uncertainGap(row: GapRow): boolean {
  return row.maybePlayer === true
}

/** The rows the tab is sure of. */
export function withoutUncertain(rows: readonly GapRow[]): GapRow[] {
  return rows.filter((r) => !uncertainGap(r))
}

/** The rows not marked done. */
export function withoutDone(rows: readonly GapRow[], done: ReadonlySet<string>): GapRow[] {
  return done.size === 0 ? [...rows] : rows.filter((r) => !done.has(doneKey(r)))
}

/** One spell as the client files state it; absent fields were not stated (or are zero). */
/** What the install's spells_us.txt / spells_us_str.txt state about a spell (src/main/gapSpellFacts.ts). */
export interface ClientSpellFacts {
  /** `[[Shaman]] - Level 43` order: the classes that can scribe it, with their level. */
  classes: { cls: string; level: number }[]
  mana?: number
  range?: number
  /** Seconds, as the wiki writes them (`1.50`). */
  castTime?: string
  recastTime?: string
  /** `Magic (-10)`. */
  resist?: string
  msgOnYou?: string
  msgOnOther?: string
  msgWearsOff?: string
}

/** Item name → the mobs its own item page names under `|dropsfrom`; null when the wiki has no page. */
export type ItemPageMobs = Record<string, string[] | null>

/** How the log named it. */
export type GapKind =
  | 'looted'
  | 'dropped-by'
  | 'received'
  | 'bought'
  | 'crafted'
  /** a mote fusion's result (`merged two items together`): not a tradeskill, so no Player Crafted */
  | 'fused'
  | 'foraged'
  | 'killed'
  | 'considered'
  | 'hailed'
  | 'cast'
  | 'quoted'
  | 'sold'

/** Distinct values with counts: the eight most frequent, and how many there were in all. */
export interface GapTally {
  entries: { name: string; n: number }[]
  distinct: number
  /** The zones list only: every zone by name, beyond the eight, for the "this zone" filter. */
  all?: string[]
}

/** The lists are absent when nothing was tallied; `samples` is always there. */
export interface GapDetails {
  /** The zone the fold was in when the line was read. */
  zones?: GapTally
  /** An item: the corpse it was looted from, or the merchant it was bought from. */
  sources?: GapTally
  /** An item: how the loot line disposed of it (depot, sold, hoard, combined, currency). */
  dispositions?: GapTally
  /** A mob: the items it was seen to drop. */
  drops?: GapTally
  /** A mob: what the /con said, `L50 indifferent`. */
  cons?: GapTally
  /** A mob: what killed it; `you`, or `nobody` for a "died." line. */
  killers?: GapTally
  /** A spell: who cast it; `you` for the player's own. */
  casters?: GapTally
  /**
   * An item: what an instant sale on loot paid, as the line printed it (`4 platinum 2 gold`).
   * NOT the real price: a sale on loot, to no vendor, is at a discount, so each amount is a floor.
   */
  sales?: GapTally
  /** An item: what a purchase line paid, the whole stack's price. */
  paid?: GapTally
  /** The two lists summed, in copper; absent when zero. */
  salesCopper?: number
  paidCopper?: number
  /** The last three raw log lines, oldest first. */
  samples: string[]
}

/** One known name within a character or two of the row's — see engine gaps_suggest.rs. */
export interface GapSuggest {
  name: string
  /** The wiki page title to link. */
  page: string
  distance: number
}

/** One unknown name, as the engine serves it. */
export interface GapRow {
  domain: GapDomain
  /** As the log spelled it; a spell with its rank stripped. */
  name: string
  /** In the order first seen. */
  kinds: GapKind[]
  count: number
  /** The log's own stamp, `2026-09-23 17:54:48`. */
  first: string
  last: string
  details: GapDetails
  /** Absent when no known name is close enough to name with confidence. */
  suggest?: GapSuggest
  /** A drop row of one item: whether that item's own page names the mob (shared/gapDrops.ts). */
  itemPage?: 'namesMob' | 'lacksMob'
  /** An image row: the file its page names, or the name it would take (shared/gapImages.ts). */
  image?: string
  /** A faction, drop or image row: the wiki page of its mob, when the catalog could pick one. */
  page?: string
  /** A faction row: the amount most kills stated, and whether the kill raised the faction. */
  adjust?: number
  raised?: boolean
  /** A drop row whose item or group the wiki files under a mob page's `|common_loot`, not `|known_loot`. */
  lootField?: 'common_loot'
  /** A one-word name only hailed or conned that the log has not shown to be an NPC (gaps_players.rs). */
  maybePlayer?: boolean
}

export interface GapsSnap {
  rows: GapRow[]
  /** Unknown names per domain — the served rows are the first 500 of these. */
  totals: Record<GapDomain, number>
  /** Distinct names checked per domain, known or not. */
  seen: Record<GapDomain, number>
  /** Each kill and the factions its lines moved (gaps_trade.rs), for shared/gapFactions.ts. */
  killFactions?: KillFaction[]
  /** Where a con or hail beside a `/loc` placed each mob, `/loc` order (gaps_locs.rs). */
  mobLocs?: { mob: string; zone: string; points: number[][] }[]
  /** What each mob was seen to do on its own attack lines, `Rampages` / `Flurries` (gaps_specials.rs). */
  mobSpecials?: { mob: string; specials: string[] }[]
  /** What each mob's corpse paid at the player's kills: how many paid, each coin's least and most (gaps_coin.rs). */
  mobCoin?: MobCoin[]
}

/** One mob's corpse coin, `[platinum, gold, silver, copper]` (gaps_coin.rs). */
export interface MobCoin {
  mob: string
  n: number
  min: number[]
  max: number[]
}

/** The lists in display order, with the words the tab and the copy text use for them. */
export type GapListKey = 'zones' | 'sources' | 'dispositions' | 'drops' | 'cons' | 'killers' | 'casters' | 'sales' | 'paid'
export const GAP_LISTS: { key: GapListKey; label: string }[] = [
  { key: 'zones', label: 'zones' },
  { key: 'sources', label: 'from' },
  { key: 'dispositions', label: 'disposed' },
  { key: 'drops', label: 'dropped' },
  { key: 'cons', label: 'con' },
  { key: 'killers', label: 'killed by' },
  { key: 'casters', label: 'cast by' },
  // The caveat travels in the word: a sale on loot is discounted, so these amounts are floors.
  { key: 'sales', label: 'sold on loot (discounted)' },
  { key: 'paid', label: 'paid' }
]

/**
 * Was the row named in this place, any tier (owner ask, 2026-10-17: work through a zone)? The
 * place is `zones.zoneKey`, so standing in `Befallen 4 (Refined)` admits a row seen in plain
 * `Befallen`. A row with no zones is in none.
 */
export function gapInZone(row: GapRow, zone: string): boolean {
  const here = zoneKey(zone)
  const zones = row.details.zones
  const names = zones?.all ?? zones?.entries.map((e) => e.name) ?? []
  return here !== '' && names.some((z) => zoneKey(z) === here)
}

/**
 * The rows of one domain whose name or kinds contain the query, case-folded, and, given a zone,
 * only those named there; engine order kept.
 */
export function visibleGaps(rows: readonly GapRow[], domain: GapDomain, query: string, zone: string | null = null): GapRow[] {
  const q = query.trim().toLowerCase()
  return rows.filter(
    (r) =>
      r.domain === domain &&
      (q === '' || r.name.toLowerCase().includes(q) || r.kinds.some((k) => k.includes(q))) &&
      (zone === null || gapInZone(r, zone))
  )
}

/** `a treant (11), a kobold (2) +3 more` — one tally as a phrase. */
export function tallyText(t: GapTally): string {
  const shown = t.entries.map((e) => `${e.name} (${e.n})`).join(', ')
  const more = t.distinct - t.entries.length
  return more > 0 ? `${shown} +${more} more` : shown
}

/** `4 platinum 2 gold 1 silver 4 copper` → copper; the engine's one spelling, so no commas or "and". */
export function parseCoin(coin: string): number {
  const per: Record<string, number> = { platinum: 1000, gold: 100, silver: 10, copper: 1 }
  let copper = 0
  for (const m of coin.matchAll(/(\d+) (platinum|gold|silver|copper)/g)) copper += Number(m[1]) * per[m[2]]
  return copper
}

/** Copper → `1 platinum 1 gold 4 silver 3 copper`, zero parts left out; `0 copper` for nothing. */
export function formatCoin(copper: number): string {
  const parts: string[] = []
  let rest = Math.max(0, Math.round(copper))
  for (const [word, per] of [['platinum', 1000], ['gold', 100], ['silver', 10], ['copper', 1]] as const) {
    const n = Math.floor(rest / per)
    rest -= n * per
    if (n > 0) parts.push(`${n} ${word}`)
  }
  return parts.length > 0 ? parts.join(' ') : '0 copper'
}

/** What one instant sale on loot implies, in copper — see `derivedPrices`. */
export interface DerivedPrices {
  /** The instant sale, as the line printed it. */
  sale: number
  /** The item's base price: the sale is base ÷ 1.4. */
  base: number
  /** The loot window's Value line, what a vendor pays at best standing: base ÷ 1.05. */
  vendorValue: number
}

/**
 * The real prices behind an instant sale. Measured on the owner's whole log (9,129 sale lines,
 * docs/community/agent/MEASURED.md): an instant sale on loot pays the item's base price ÷ 1.4,
 * rounded to the nearest copper, the same at every tier, and the game's Value line is base ÷ 1.05.
 * Both are derived from the rounded base rather than as one factor on the sale, which is what
 * matches the screenshots to the copper (Gold Ring 857c → Value 1,143c, base 1,200c; Jade Earring
 * 3,214c → 4,286c, 4,500c). The sale read is the row's most frequent sale amount; `null` when the
 * row has no sale, or only free ones.
 */
export function derivedPrices(details: GapDetails): DerivedPrices | null {
  const sale = parseCoin(details.sales?.entries[0]?.name ?? '')
  if (sale <= 0) return null
  const base = Math.round(sale * 1.4)
  return { sale, base, vendorValue: Math.round(base / 1.05) }
}

/** The header the copy text starts with. */
export const GAPS_TEXT_HEADER = 'Name\tSeen as\tTimes\tFirst\tLast'

/**
 * One row as lines: its tab-separated fields, then each list it has and its sample lines, each
 * indented by a tab so a paste into an issue keeps the row and its details together.
 */
/** `1 character off`, `2 characters off`. */
export function charactersOff(distance: number): string {
  return `${distance} character${distance === 1 ? '' : 's'} off`
}

export function gapDetailsText(row: GapRow, verdict: GapVerdict = 'unchecked'): string {
  const lines = [[row.name, row.kinds.join(', '), String(row.count), row.first, row.last].join('\t')]
  if (row.suggest !== undefined) lines.push(`\tprobably: ${row.suggest.name} (${charactersOff(row.suggest.distance)})`)
  lines.push(`\taction: ${gapActions(row, verdict).map((a) => a.label).join(' · ')}`)
  for (const { key, label } of GAP_LISTS) {
    const t = row.details[key]
    if (t === undefined) continue
    lines.push(`\t${label}: ${tallyText(t)}`)
    const prices = key === 'sales' ? derivedPrices(row.details) : null
    if (prices !== null) lines.push(`\tvendor value: ${formatCoin(prices.vendorValue)}`)
  }
  for (const s of row.details.samples) lines.push(`\tsample: ${s}`)
  return lines.join('\n')
}

/** The visible rows as text with a header, each row followed by its details, for pasting into an issue. */
export function gapsAsText(rows: readonly GapRow[], verdicts: GapVerdicts = {}): string {
  return [GAPS_TEXT_HEADER, ...rows.map((r) => gapDetailsText(r, verdicts[r.name] ?? 'unchecked'))].join('\n')
}

// ---- what to do about a row (owner ask, 2026-10-12) --------------------------------------------

/**
 * What the app's own runtime caches say about a name: the wiki was asked and had no page
 * (`noPage`), had one (`hasPage`), or was never asked (`unchecked`). Read, never fetched: the
 * main process answers off `<userData>/item-knowledge-cache.json` / `mob-knowledge-cache.json`
 * (src/main/gapVerdicts.ts); spells have no cache and are always `unchecked`.
 */
export type GapVerdict = 'noPage' | 'hasPage' | 'unchecked'
/** Verdicts by row name, as the renderer's store hands them to the table. */
export type GapVerdicts = Record<string, GapVerdict>

export type GapActionKind = 'fixTitle' | 'addToWiki' | 'rescrape' | 'checkWiki' | 'npcSpell' | 'fixParser'

/** One chip: what to do, why (the tooltip), and where it goes when it is a link. */
export interface GapAction {
  kind: GapActionKind
  label: string
  why: string
  href?: string
}

/** The wiki's own search for a name — a link the person clicks, never an app fetch. */
export function wikiSearchUrl(name: string): string {
  return `https://eqlwiki.com/index.php?search=${encodeURIComponent(name.trim())}`
}

/** The wiki's editor on an existing page. */
export function wikiEditUrl(page: string): string {
  return `https://eqlwiki.com/index.php?title=${encodeURIComponent(page.trim().replace(/ /g, '_'))}&action=edit`
}

/** The wiki's upload form with the file name filled in. */
export function wikiUploadUrl(file: string): string {
  return `https://eqlwiki.com/index.php?title=Special:Upload&wpDestFile=${encodeURIComponent(file.trim())}`
}

/** A row about a mob's page (a missing faction, drop or image): its domain is one of these. An image row is the mob itself. */
export const onMobPage = (row: GapRow): boolean => row.domain === 'faction' || row.domain === 'drop' || row.domain === 'image'

/** A faction, drop or image row's mob: the page the missing faction, drop or image goes on. */
export const factionMob = (row: GapRow): string => row.details.sources?.entries[0]?.name ?? ''

/** A faction, drop or image row's subject: its name less the ` (mob)` it is filed under. */
export const factionOf = (row: GapRow): string => row.name.slice(0, Math.max(0, row.name.length - factionMob(row).length - 3))

/** The wiki's editor on a new page titled with the name, as its own red links open it (owner ask, 2026-10-18). */
export function wikiCreateUrl(name: string): string {
  return `https://eqlwiki.com/index.php?title=${encodeURIComponent(name.trim().replace(/ /g, '_'))}&action=edit&redlink=1`
}

/** A shape the app's own parsers leave in a name, or null: the words the Fix parser tooltip uses. */
export function parserShape(name: string): string | null {
  if (name.endsWith(' from Reward Chest')) return 'a " from Reward Chest" tail the loot parser left in the item name'
  if (/^(Spell|Song): /.test(name)) return 'a scroll prefix whose spell the catalog does not know'
  if (name.endsWith('*')) return 'a trailing "*"'
  return null
}

/**
 * A spell only mobs were seen casting: no caster is you or a player. A one-word caster is a player
 * unless the mob catalog has the name (`Zazamoukh`), when `isMob` is given.
 */
export function npcOnlySpell(row: GapRow, isMob?: (name: string) => boolean): boolean {
  const casters = row.details.casters?.entries ?? []
  const player = (n: string): boolean => n === 'you' || (/^[A-Z][a-z]+$/.test(n) && isMob?.(n) !== true)
  return row.domain === 'spell' && casters.length > 0 && !casters.some((c) => player(c.name))
}

/** A faction, drop or image row's mob page: the catalog's title when it picked one, else the log's name. */
export const mobPageOf = (row: GapRow): string => row.page ?? factionMob(row)

/** What the chips may say beyond the row: the wiki data's date, and which names are catalog mobs. */
export interface GapActionContext {
  dataDate?: string
  isMob?: (name: string) => boolean
}

/**
 * A drop's chips: which page to update. The wiki connects nothing itself (owner ask, 2026-10-18):
 * the mob page's `|known_loot` and the item page's `|dropsfrom` are each typed by hand.
 */
function dropActions(row: GapRow): GapAction[] {
  const mob = mobPageOf(row)
  const item = factionOf(row)
  const why =
    row.details.drops !== undefined
      ? `The wiki page for ${mob} lists neither ${item} nor any item in it.`
      : row.itemPage === 'namesMob'
        ? `The page for ${item} names ${mob} as a source, but ${mob}'s page does not list it.`
        : `The wiki page for ${mob} does not list ${item}.`
  const field = row.lootField === 'common_loot' ? ' It belongs under common_loot: the wiki files it as loot shared across mobs.' : ''
  const actions: GapAction[] = [{ kind: 'checkWiki', label: 'Add to mob page', why: why + field, href: wikiEditUrl(mob) }]
  if (row.itemPage === 'lacksMob') {
    actions.push({ kind: 'addToWiki', label: 'Add to item page', why: `The page for ${item} does not name ${mob} under dropsfrom.`, href: wikiEditUrl(item) })
  }
  return actions
}

/**
 * What someone must do to close the gap, one or two chips: the page exists under another
 * spelling (fix its title), the wiki was asked and had nothing (add the page), the wiki has it
 * and our data predates it (re-scrape), only mobs cast it (an NPC spell), or the committed data
 * lacks it (check the wiki: a cache miss, not a verdict, owner 2026-10-19) — plus "fix parser"
 * when the name itself carries a parser's leftover.
 */
export function gapActions(row: GapRow, verdict: GapVerdict, ctx: GapActionContext = {}): GapAction[] {
  if (row.domain === 'image') {
    const file = row.image ?? ''
    const why = `The wiki has no image for ${row.name}. Upload a screenshot as ${file}; if the page names no image, add its imagefilename line too.`
    return [{ kind: 'addToWiki', label: 'Upload image', why, href: wikiUploadUrl(file) }]
  }
  if (row.domain === 'drop') return dropActions(row)
  if (onMobPage(row)) {
    const why = `The wiki page for ${mobPageOf(row)} does not name this faction among those a kill moves.`
    return [{ kind: 'checkWiki', label: 'Edit mob page', why, href: wikiEditUrl(mobPageOf(row)) }]
  }
  const actions: GapAction[] = []
  const asOf = ctx.dataDate === undefined ? 'the app' : `the wiki data from ${ctx.dataDate}`
  if (row.suggest !== undefined) {
    actions.push({
      kind: 'fixTitle',
      label: 'Fix wiki title',
      why: `The wiki has this page under another spelling: ${row.suggest.name}. Copy wiki page gives a redirect from the game's spelling.`,
      href: wikiPageUrl(row.suggest.page)
    })
  } else if (verdict === 'noPage') {
    actions.push({ kind: 'addToWiki', label: 'Add to wiki', why: 'The app asked the wiki for this name and it had no page.' })
  } else if (verdict === 'hasPage') {
    actions.push({ kind: 'rescrape', label: 'Re-scrape', why: `The wiki has this page; ${asOf} predates it, and the next data refresh picks it up.` })
  } else if (npcOnlySpell(row, ctx.isMob)) {
    actions.push({ kind: 'npcSpell', label: 'NPC spell', why: `Only mobs were seen casting it, and ${asOf} has no page for it: an NPC Only Spells page.`, href: wikiSearchUrl(row.name) })
  } else {
    actions.push({ kind: 'checkWiki', label: 'Check wiki', why: `Not in ${asOf}: search the wiki before creating the page.`, href: wikiSearchUrl(row.name) })
  }
  const shape = parserShape(row.name)
  if (shape !== null) actions.push({ kind: 'fixParser', label: 'Fix parser', why: `The name carries ${shape}.` })
  return actions
}

/**
 * `76 unknown` — the toggle's caption for one domain (owner, 2026-10-17: the checked total meant
 * nothing to a player); `3 here` while the "this zone" filter is on, counted off the served rows.
 */
export function gapsCaption(snap: GapsSnap, domain: GapDomain, zone: string | null = null): string {
  if (zone !== null) return `${visibleGaps(snap.rows, domain, '', zone).length.toLocaleString()} here`
  return `${(snap.totals[domain] ?? 0).toLocaleString()} unknown`
}

/** Where the row was named most, and how many other zones: `Befallen 4 (Refined) +2`; '' for none. */
export function gapZone(row: GapRow): string {
  const zones = row.details.zones
  const top = zones?.entries[0]?.name
  if (zones === undefined || top === undefined) return ''
  return zones.distinct > 1 ? `${top} +${zones.distinct - 1}` : top
}

// ---- sorting the table (owner ask, 2026-10-13: every column sorts) ----

export type GapSortKey = 'name' | 'kinds' | 'zone' | 'count' | 'first' | 'last' | 'todo'
export interface GapSort {
  key: GapSortKey
  dir: 'asc' | 'desc'
}
/** The engine's own order: most mentioned first. */
export const DEFAULT_GAP_SORT: GapSort = { key: 'count', dir: 'desc' }

/** A column's first click: counts and dates biggest or newest first, text A to Z. */
export function firstGapSortDir(key: GapSortKey): GapSort['dir'] {
  return key === 'count' || key === 'first' || key === 'last' ? 'desc' : 'asc'
}

function gapSortValue(r: GapRow, key: GapSortKey, verdicts: GapVerdicts): string | number {
  if (key === 'count') return r.count
  if (key === 'name') return r.name.toLowerCase()
  if (key === 'kinds') return r.kinds.join(', ')
  // By the zone it was named in most, A to Z; a row with no zone sorts first.
  if (key === 'zone') return (r.details.zones?.entries[0]?.name ?? '').toLowerCase()
  if (key === 'todo') return gapActions(r, verdicts[r.name] ?? 'unchecked').map((a) => a.label).join(', ')
  // The timestamps are `YYYY-MM-DD HH:MM:SS`, which sort as text.
  return key === 'first' ? r.first : r.last
}

/** The rows in the table's order. A tie keeps the engine's order, so equal rows never shuffle. */
export function sortGaps(rows: readonly GapRow[], sort: GapSort, verdicts: GapVerdicts = {}): GapRow[] {
  const sign = sort.dir === 'asc' ? 1 : -1
  return rows
    .map((r, i) => ({ r, i, v: gapSortValue(r, sort.key, verdicts) }))
    .sort((a, b) => {
      const c = typeof a.v === 'number' && typeof b.v === 'number' ? a.v - b.v : String(a.v).localeCompare(String(b.v))
      return c !== 0 ? c * sign : a.i - b.i
    })
    .map((x) => x.r)
}
