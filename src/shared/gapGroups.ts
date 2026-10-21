// shared/gapGroups.ts — the Gaps list as a hunting plan (owner ask, 2026-10-18: "group by zone,
// then by mob ... so i can go into the game, go kill the mob ... and take a picture"): each zone,
// the mobs in it, and what is missing under each.
//
// An item sits under every zone and mob the loot ledger saw drop it, so one item can be listed
// more than once; one never looted from a mob sits under its zones alone. A mob or a spell sits
// under the zones it was named in. A row seen in no zone is filed under ZONE_NOT_SEEN, last.

import { factionOf, onMobPage, type GapRow } from './gaps'
import { itemBaseName } from './itemStats'
import type { LootEvent } from './types'
import { zoneKey } from './zones'

export const ZONE_NOT_SEEN = 'Zone not seen'

/**
 * How the headings themselves are ordered (owner ask, 2026-10-20: "sort by how many are missing
 * fewest to most, or most to least, this way I could either work on the ones almost done, or, if I
 * have a lot of time, start on the ones with the most"). Zones and the mobs under each zone both
 * follow it; a tie reads A to Z, and ZONE_NOT_SEEN stays last whatever the order.
 */
export type GapGroupOrder = 'name' | 'most' | 'fewest'
export const GAP_GROUP_ORDERS: readonly GapGroupOrder[] = ['name', 'most', 'fewest']
export const GAP_GROUP_ORDER_LABELS: Record<GapGroupOrder, string> = { name: 'A to Z', most: 'Most missing', fewest: 'Fewest missing' }

/** A remembered order, or A to Z for anything unknown. */
export function gapGroupOrderOf(raw: string | null): GapGroupOrder {
  return GAP_GROUP_ORDERS.find((o) => o === raw) ?? 'name'
}

/** `order` between two headings: by how many are missing, then A to Z. */
function byOrder(order: GapGroupOrder, a: { name: string; n: number }, b: { name: string; n: number }): number {
  const byCount = order === 'most' ? b.n - a.n : order === 'fewest' ? a.n - b.n : 0
  return byCount || a.name.localeCompare(b.name)
}

/** One line of the grouped list: a zone heading, a mob heading under it, or a row. */
export type GapEntry =
  | { kind: 'zone'; key: string; zone: string; n: number }
  | { kind: 'mob'; key: string; mob: string; n: number; rows: readonly GapRow[] }
  /** `depth` in the grouped list: 1 under a zone, 2 under a mob; absent ungrouped. */
  | { kind: 'row'; key: string; row: GapRow; depth?: 1 | 2 }

/** The flat list, as the table shows it ungrouped. */
export function rowEntries(rows: readonly GapRow[]): GapEntry[] {
  return uniqueKeys(rows.map((row) => ({ kind: 'row', key: `${row.domain}|${row.name}`, row })))
}

/**
 * Every entry's key made unique, a repeat taking `#2`, `#3`. The table keys its rows by these, and
 * two rows under one key leave a stale copy behind each time the list changes (owner, 2026-10-19:
 * toggling Zone I'm in stacked up "A cave bat" rows).
 */
export function uniqueKeys(entries: GapEntry[]): GapEntry[] {
  const seen = new Map<string, number>()
  for (const e of entries) {
    const n = (seen.get(e.key) ?? 0) + 1
    seen.set(e.key, n)
    if (n > 1) e.key = `${e.key}#${String(n)}`
  }
  return entries
}

interface Place {
  zone: string
  mob: string
}

function zonesOf(row: GapRow): string[] {
  return row.details.zones?.all ?? row.details.zones?.entries.map((e) => e.name) ?? []
}

/** Every (zone, mob) each item was looted from, by lowercase item name: one pass over the ledger. */
function lootPlaces(loot: readonly LootEvent[]): Map<string, Place[]> {
  const out = new Map<string, Place[]>()
  const seen = new Set<string>()
  for (const e of loot) {
    if (e.source === undefined) continue
    // An item at any tier is one item (owner, 2026-10-19).
    const key = itemBaseName(e.item).toLowerCase()
    const pair = `${key}|${(e.zone ?? '').toLowerCase()}|${e.source.toLowerCase()}`
    if (seen.has(pair)) continue
    seen.add(pair)
    const places = out.get(key) ?? []
    places.push({ zone: e.zone ?? '', mob: e.source })
    out.set(key, places)
  }
  return out
}

/** The (zone, mob) pairs a row belongs under; `mob` is '' for none. */
function placesOf(row: GapRow, looted: ReadonlyMap<string, Place[]>): Place[] {
  // A faction or drop row belongs under the mob whose page lacks it; an image row is that mob.
  if (row.domain === 'image') return [{ zone: zonesOf(row)[0] ?? '', mob: '' }]
  if (onMobPage(row)) return [{ zone: zonesOf(row)[0] ?? '', mob: row.details.sources?.entries[0]?.name ?? '' }]
  const fromLoot = row.domain === 'item' ? (looted.get(row.name.toLowerCase()) ?? []) : []
  const places = fromLoot.length > 0 ? fromLoot : zonesOf(row).map((zone) => ({ zone, mob: '' }))
  return places.length > 0 ? places : [{ zone: '', mob: '' }]
}

/**
 * "Zone I'm in" (owner, 2026-10-20: "i shouldn't see 2 zones when i say only the zone i'm in"): a
 * row seen here and elsewhere files under here alone, any tier of it, and one the filter let in on
 * a sighting its places do not carry (an item named here but looted elsewhere) files under here too.
 */
function placesHere(places: Place[], here: string | null): Place[] {
  if (here === null) return places
  const key = zoneKey(here)
  const kept = places.filter((p) => zoneKey(p.zone) === key)
  return kept.length > 0 ? kept : [{ zone: here, mob: '' }]
}

/** The heading order, and with "Zone I'm in" on the one place the headings are kept to. */
export interface GapGroupOptions {
  order?: GapGroupOrder
  here?: string | null
}

/** The fourth argument read: an order alone (the older call), or the options. */
function groupOptions(opts: GapGroupOrder | GapGroupOptions): { order: GapGroupOrder; here: string | null } {
  if (typeof opts === 'string') return { order: opts, here: null }
  return { order: opts.order ?? 'name', here: opts.here ?? null }
}

interface MobGroup {
  mob: string
  rows: GapRow[]
}
type Tree = Map<string, { zone: string; mobs: Map<string, MobGroup> }>

function addTo(tree: Tree, p: Place, row: GapRow, zoneName: (raw: string) => string): void {
  // Tiers are one place (owner, 2026-10-19): `Befallen 4 (Refined)` files under the wiki's `Befallen`.
  const zone = p.zone === '' ? ZONE_NOT_SEEN : zoneName(p.zone) || p.zone
  const z = tree.get(zone.toLowerCase()) ?? { zone, mobs: new Map<string, MobGroup>() }
  tree.set(zone.toLowerCase(), z)
  const m = z.mobs.get(p.mob.toLowerCase()) ?? { mob: p.mob, rows: [] }
  z.mobs.set(p.mob.toLowerCase(), m)
  if (!m.rows.includes(row)) m.rows.push(row)
}

/**
 * Zones in `order` (ZONE_NOT_SEEN last), then under each the rows with no mob, then its mobs in
 * `order`; rows in the given order, except a mob page's lines, A to Z.
 */
export function groupGaps(
  rows: readonly GapRow[],
  loot: readonly LootEvent[],
  zoneName: (raw: string) => string = (z) => z,
  opts: GapGroupOrder | GapGroupOptions = 'name'
): GapEntry[] {
  const { order, here } = groupOptions(opts)
  const tree: Tree = new Map()
  const looted = lootPlaces(loot)
  for (const row of rows) for (const p of placesHere(placesOf(row, looted), here)) addTo(tree, p, row, zoneName)
  // A zone's count is its distinct rows: an item two of its mobs drop is one thing missing there.
  const zones = [...tree.values()]
    .map((z) => ({ ...z, n: new Set([...z.mobs.values()].flatMap((m) => m.rows)).size }))
    .sort((a, b) => Number(a.zone === ZONE_NOT_SEEN) - Number(b.zone === ZONE_NOT_SEEN) || byOrder(order, { name: a.zone, n: a.n }, { name: b.zone, n: b.n }))
  const out: GapEntry[] = []
  for (const z of zones) {
    const mobs = [...z.mobs.values()].sort(
      (a, b) => Number(a.mob !== '') - Number(b.mob !== '') || byOrder(order, { name: a.mob, n: a.rows.length }, { name: b.mob, n: b.rows.length })
    )
    const n = z.n
    out.push({ kind: 'zone', key: `zone|${z.zone}`, zone: z.zone, n })
    for (const m of mobs) {
      // Under a mob, the lines for its page read A to Z, as the page lists them and Copy lines copies
      // them (owner, 2026-10-20: "make sure the items are sorted by name").
      if (m.mob !== '' && m.rows.every(onMobPage)) m.rows.sort((a, b) => factionOf(a).localeCompare(factionOf(b)))
      if (m.mob !== '') out.push({ kind: 'mob', key: `mob|${z.zone}|${m.mob}`, mob: m.mob, n: m.rows.length, rows: m.rows })
      const depth = m.mob === '' ? 1 : 2
      for (const row of m.rows) out.push({ kind: 'row', key: `row|${z.zone}|${m.mob}|${row.domain}|${row.name}`, row, depth })
    }
  }
  return uniqueKeys(out)
}

/** Every heading's key: what "Collapse all" folds (owner ask, 2026-10-20). */
export function headingKeys(entries: readonly GapEntry[]): string[] {
  return entries.filter((e) => e.kind !== 'row').map((e) => e.key)
}

/**
 * The grouped list less what folded headings hide (owner ask, 2026-10-18): a folded zone shows only
 * its heading, a folded mob its heading and nothing under it. `folded` holds heading keys.
 */
export function unfoldedEntries(entries: readonly GapEntry[], folded: ReadonlySet<string>): GapEntry[] {
  const out: GapEntry[] = []
  let zoneFolded = false
  let mobFolded = false
  for (const e of entries) {
    if (e.kind === 'zone') {
      zoneFolded = folded.has(e.key)
      mobFolded = false
    } else if (e.kind === 'mob') mobFolded = folded.has(e.key)
    const hidden = e.kind !== 'zone' && (zoneFolded || (e.kind === 'row' && e.depth === 2 && mobFolded))
    if (!hidden) out.push(e)
  }
  return out
}
