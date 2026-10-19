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
 *  mob whose page lists neither it nor its group (shared/gapDrops.ts) (owner asks, 2026-10-18). */
export type GapDomain = 'item' | 'mob' | 'spell' | 'merchant' | 'faction' | 'drop'
export const GAP_DOMAINS: readonly GapDomain[] = ['item', 'mob', 'spell', 'merchant', 'faction', 'drop']
export const GAP_DOMAIN_LABELS: Record<GapDomain, string> = {
  item: 'Items',
  mob: 'Mobs',
  spell: 'Spells',
  merchant: 'Merchants',
  faction: 'Factions',
  drop: 'Drops'
}

/** How the log named it. */
export type GapKind = 'looted' | 'dropped-by' | 'received' | 'bought' | 'crafted' | 'killed' | 'considered' | 'cast' | 'quoted' | 'sold'

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
}

export interface GapsSnap {
  rows: GapRow[]
  /** Unknown names per domain — the served rows are the first 500 of these. */
  totals: Record<GapDomain, number>
  /** Distinct names checked per domain, known or not. */
  seen: Record<GapDomain, number>
  /** Each kill and the factions its lines moved (gaps_trade.rs), for shared/gapFactions.ts. */
  killFactions?: KillFaction[]
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

/** A row about a mob's page (a missing faction or drop): its domain is one of these. */
export const onMobPage = (row: GapRow): boolean => row.domain === 'faction' || row.domain === 'drop'

/** A faction or drop row's mob: the page the missing faction or drop goes on. */
export const factionMob = (row: GapRow): string => row.details.sources?.entries[0]?.name ?? ''

/** A faction or drop row's subject: its name less the ` (mob)` it is filed under. */
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
 * A spell only mobs were seen casting: no caster is you or a single-word name (a player, or a
 * named mob the rule cannot tell from one, which keeps the row a plain "Check wiki").
 */
export function npcOnlySpell(row: GapRow): boolean {
  const casters = row.details.casters?.entries ?? []
  return row.domain === 'spell' && casters.length > 0 && !casters.some((c) => c.name === 'you' || /^[A-Z][a-z]+$/.test(c.name))
}

/**
 * What someone must do to close the gap, one or two chips: the page exists under another
 * spelling (fix its title), the wiki was asked and had nothing (add the page), the wiki has it
 * and our data predates it (re-scrape), only mobs cast it (an NPC spell, which the wiki seldom
 * pages), or nobody has looked (check the wiki) — plus "fix parser" when the name itself carries
 * a parser's leftover.
 */
export function gapActions(row: GapRow, verdict: GapVerdict): GapAction[] {
  if (onMobPage(row)) {
    const what = row.domain === 'faction' ? 'this faction among those a kill moves' : 'this drop, nor a group holding it'
    const why = `The wiki page for ${factionMob(row)} does not name ${what}.`
    return [{ kind: 'checkWiki', label: 'Edit mob page', why, href: wikiEditUrl(factionMob(row)) }]
  }
  const actions: GapAction[] = []
  if (row.suggest !== undefined) {
    actions.push({
      kind: 'fixTitle',
      label: 'Fix wiki title',
      why: `The wiki has this page under another spelling: ${row.suggest.name}.`,
      href: wikiPageUrl(row.suggest.page)
    })
  } else if (verdict === 'noPage') {
    actions.push({ kind: 'addToWiki', label: 'Add to wiki', why: 'The app asked the wiki for this name and it had no page.' })
  } else if (verdict === 'hasPage') {
    actions.push({ kind: 'rescrape', label: 'Re-scrape', why: 'The wiki has this page; the next data scrape picks it up.' })
  } else if (npcOnlySpell(row)) {
    actions.push({
      kind: 'npcSpell',
      label: 'NPC spell',
      why: 'Only mobs were seen casting it. The wiki pages few NPC-only spells, so this may need no fix.',
      href: wikiSearchUrl(row.name)
    })
  } else {
    actions.push({ kind: 'checkWiki', label: 'Check wiki', why: 'Nobody has looked this name up yet: search the wiki for it.', href: wikiSearchUrl(row.name) })
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
