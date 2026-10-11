// shared/gaps.ts — the Gaps tab's data: names the log mentions that the app's wiki data has no
// record of (owner ask, 2026-10-11).
//
// The engine's `gaps` module (engine/crates/fold/src/modules/gaps.rs) serves one row per unknown
// name, most mentioned first, at most 500 per domain. The tab's domain toggle and search box narrow
// those rows here rather than in the renderer, which never filters served rows (owner ruling 4).

export const GAPS_MODULE_ID = 'gaps'

export type GapDomain = 'item' | 'mob' | 'spell'
export const GAP_DOMAINS: readonly GapDomain[] = ['item', 'mob', 'spell']
export const GAP_DOMAIN_LABELS: Record<GapDomain, string> = { item: 'Items', mob: 'Mobs', spell: 'Spells' }

/** How the log named it. */
export type GapKind = 'looted' | 'dropped-by' | 'received' | 'bought' | 'crafted' | 'killed' | 'considered' | 'cast'

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
}

export interface GapsSnap {
  rows: GapRow[]
  /** Unknown names per domain — the served rows are the first 500 of these. */
  totals: Record<GapDomain, number>
  /** Distinct names checked per domain, known or not. */
  seen: Record<GapDomain, number>
}

/** The rows of one domain whose name or kinds contain the query, case-folded; engine order kept. */
export function visibleGaps(rows: readonly GapRow[], domain: GapDomain, query: string): GapRow[] {
  const q = query.trim().toLowerCase()
  return rows.filter((r) => r.domain === domain && (q === '' || r.name.toLowerCase().includes(q) || r.kinds.some((k) => k.includes(q))))
}

/** The visible rows as tab-separated text with a header, for pasting into an issue. */
export function gapsAsText(rows: readonly GapRow[]): string {
  const lines = rows.map((r) => [r.name, r.kinds.join(', '), String(r.count), r.first, r.last].join('\t'))
  return ['Name\tSeen as\tTimes\tFirst\tLast', ...lines].join('\n')
}

/** `Mobs · 76 of 468 names` — the toggle's caption for one domain. */
export function gapsCaption(snap: GapsSnap, domain: GapDomain): string {
  return `${snap.totals[domain] ?? 0} of ${snap.seen[domain] ?? 0} names`
}
