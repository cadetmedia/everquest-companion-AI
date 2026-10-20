// shared/gapGroups.ts — the Gaps list as a hunting plan (owner ask, 2026-10-18: "group by zone,
// then by mob ... so i can go into the game, go kill the mob ... and take a picture"): each zone,
// the mobs in it, and what is missing under each.
//
// An item sits under every zone and mob the loot ledger saw drop it, so one item can be listed
// more than once; one never looted from a mob sits under its zones alone. A mob or a spell sits
// under the zones it was named in. A row seen in no zone is filed under ZONE_NOT_SEEN, last.

import { onMobPage, type GapRow } from './gaps'
import { itemBaseName } from './itemStats'
import type { LootEvent } from './types'

export const ZONE_NOT_SEEN = 'Zone not seen'

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

/** Zones A to Z (ZONE_NOT_SEEN last), then mobs A to Z after the rows with no mob; rows in the given order. */
export function groupGaps(rows: readonly GapRow[], loot: readonly LootEvent[], zoneName: (raw: string) => string = (z) => z): GapEntry[] {
  const tree: Tree = new Map()
  const looted = lootPlaces(loot)
  for (const row of rows) for (const p of placesOf(row, looted)) addTo(tree, p, row, zoneName)
  const zones = [...tree.values()].sort((a, b) => Number(a.zone === ZONE_NOT_SEEN) - Number(b.zone === ZONE_NOT_SEEN) || a.zone.localeCompare(b.zone))
  const out: GapEntry[] = []
  for (const z of zones) {
    const mobs = [...z.mobs.values()].sort((a, b) => Number(a.mob !== '') - Number(b.mob !== '') || a.mob.localeCompare(b.mob))
    const n = new Set(mobs.flatMap((m) => m.rows)).size
    out.push({ kind: 'zone', key: `zone|${z.zone}`, zone: z.zone, n })
    for (const m of mobs) {
      if (m.mob !== '') out.push({ kind: 'mob', key: `mob|${z.zone}|${m.mob}`, mob: m.mob, n: m.rows.length, rows: m.rows })
      const depth = m.mob === '' ? 1 : 2
      for (const row of m.rows) out.push({ kind: 'row', key: `row|${z.zone}|${m.mob}|${row.domain}|${row.name}`, row, depth })
    }
  }
  return uniqueKeys(out)
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
