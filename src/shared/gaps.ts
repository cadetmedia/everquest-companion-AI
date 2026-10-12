// shared/gaps.ts — the Gaps tab's data: names the log mentions that the app's wiki data has no
// record of (owner ask, 2026-10-11).
//
// The engine's `gaps` module (engine/crates/fold/src/modules/gaps.rs) serves one row per unknown
// name, most mentioned first, at most 500 per domain, each with its details (gaps_details.rs):
// where the log named it, from whom, and the last lines the game printed. The tab's domain toggle
// and search box narrow those rows here rather than in the renderer, which never filters served
// rows (owner ruling 4); the Copy list text is rendered here for the same reason.

export const GAPS_MODULE_ID = 'gaps'

export type GapDomain = 'item' | 'mob' | 'spell'
export const GAP_DOMAINS: readonly GapDomain[] = ['item', 'mob', 'spell']
export const GAP_DOMAIN_LABELS: Record<GapDomain, string> = { item: 'Items', mob: 'Mobs', spell: 'Spells' }

/** How the log named it. */
export type GapKind = 'looted' | 'dropped-by' | 'received' | 'bought' | 'crafted' | 'killed' | 'considered' | 'cast'

/** Distinct values with counts: the eight most frequent, and how many there were in all. */
export interface GapTally {
  entries: { name: string; n: number }[]
  distinct: number
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

/** The rows of one domain whose name or kinds contain the query, case-folded; engine order kept. */
export function visibleGaps(rows: readonly GapRow[], domain: GapDomain, query: string): GapRow[] {
  const q = query.trim().toLowerCase()
  return rows.filter((r) => r.domain === domain && (q === '' || r.name.toLowerCase().includes(q) || r.kinds.some((k) => k.includes(q))))
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

export function gapDetailsText(row: GapRow): string {
  const lines = [[row.name, row.kinds.join(', '), String(row.count), row.first, row.last].join('\t')]
  if (row.suggest !== undefined) lines.push(`\tprobably: ${row.suggest.name} (${charactersOff(row.suggest.distance)})`)
  for (const { key, label } of GAP_LISTS) {
    const t = row.details[key]
    if (t === undefined) continue
    lines.push(`\t${label}: ${tallyText(t)}`)
    const prices = key === 'sales' ? derivedPrices(row.details) : null
    if (prices !== null) lines.push(`\tvendor value: ${formatCoin(prices.vendorValue)} · base price: ${formatCoin(prices.base)}`)
  }
  for (const s of row.details.samples) lines.push(`\tsample: ${s}`)
  return lines.join('\n')
}

/** The visible rows as text with a header, each row followed by its details, for pasting into an issue. */
export function gapsAsText(rows: readonly GapRow[]): string {
  return [GAPS_TEXT_HEADER, ...rows.map(gapDetailsText)].join('\n')
}

/** `76 of 468 names` — the toggle's caption for one domain. */
export function gapsCaption(snap: GapsSnap, domain: GapDomain): string {
  return `${snap.totals[domain] ?? 0} of ${snap.seen[domain] ?? 0} names`
}
