// shared/gapDrops.ts — drops missing from a mob (owner asks, 2026-10-18): an item the player looted
// from a mob the wiki has, which no page of that mob's name lists. A mob page may list a GROUP
// (`[[Rusty Weapons]]`) instead of its items; dropGroups.json (scrape-drop-groups.ts) holds each
// group's members. The owner's rule: an item in a group is filed as the group, "Rusty Weapons
// (a bandit)", with the members the player saw, since a mob that drops one member drops the set.
// A mob the catalog does not have at all is a mob row already, so its drops are not repeated here.

import type { GapRow } from './gaps'
import { itemBaseName } from './itemStats'
import { mobKey } from './mobKey'
import type { LootEvent } from './types'

/** An item name as the catalog keys its drops: `+N` stripped, case folded (itemSources.ts `sourceItemKey`). */
const sourceItemKey = (name: string): string => itemBaseName(name).toLowerCase()

/** A catalog record as this reads it; `otherNames` is absent on a branch without it. */
interface CatalogMob {
  name: string
  page: string
  otherNames?: string[]
  drops?: string[]
}

/** Group name → its member items, as dropGroups.json states them. */
export type DropGroups = Readonly<Record<string, readonly string[]>>

/** Every catalog name → the drop names (item keys) its pages list. */
function dropsByMob(catalog: readonly CatalogMob[]): Map<string, Set<string>> {
  const out = new Map<string, Set<string>>()
  for (const m of catalog) {
    for (const name of [m.name, m.page, ...(m.otherNames ?? [])]) {
      const set = out.get(mobKey(name)) ?? new Set<string>()
      for (const d of m.drops ?? []) set.add(sourceItemKey(d))
      out.set(mobKey(name), set)
    }
  }
  return out
}

/** Item key → the groups that list it. */
function groupsByItem(groups: DropGroups): Map<string, string[]> {
  const out = new Map<string, string[]>()
  for (const [group, members] of Object.entries(groups)) {
    for (const m of members) out.set(sourceItemKey(m), [...(out.get(sourceItemKey(m)) ?? []), group])
  }
  return out
}

interface Missing {
  mob: string
  /** the group it is filed as, or the item itself */
  name: string
  zone: string
  n: number
  /** the members seen, for a group */
  seen: Map<string, number>
}

/** The (mob, item or group) pairs no page of the mob lists, as Gaps rows, most looted first. */
export function dropGaps(loot: readonly LootEvent[], catalog: readonly CatalogMob[], groups: DropGroups): GapRow[] {
  const listed = dropsByMob(catalog)
  const inGroups = groupsByItem(groups)
  const missing = new Map<string, Missing>()
  for (const e of loot) {
    const filed = filedAs(e, listed, inGroups)
    if (filed === null || e.source === undefined) continue
    const key = `${mobKey(e.source)}|${sourceItemKey(filed.name)}`
    const m = missing.get(key) ?? { mob: e.source, name: filed.name, zone: '', n: 0, seen: new Map<string, number>() }
    m.n += e.count ?? 1
    m.zone = e.zone ?? m.zone
    if (filed.group) m.seen.set(e.item, (m.seen.get(e.item) ?? 0) + (e.count ?? 1))
    missing.set(key, m)
  }
  return [...missing.values()].map(rowOf).sort((a, b) => b.count - a.count || a.name.localeCompare(b.name))
}

/** What a looted item is filed as when its mob's page lists neither it nor a group holding it; null when listed or the mob is unknown. */
function filedAs(e: LootEvent, listed: ReadonlyMap<string, Set<string>>, inGroups: ReadonlyMap<string, string[]>): { name: string; group: boolean } | null {
  const page = e.source === undefined ? undefined : listed.get(mobKey(e.source))
  if (page === undefined || page.has(sourceItemKey(e.item))) return null
  const its = inGroups.get(sourceItemKey(e.item)) ?? []
  if (its.some((g) => page.has(sourceItemKey(g)))) return null
  return its.length > 0 ? { name: its[0], group: true } : { name: e.item, group: false }
}

/** The served snapshot with the drop rows joined in and counted, so the tab treats them as a domain. */
export function withDropRows<S extends { rows: GapRow[]; totals: Record<string, number> }>(
  snap: S,
  loot: readonly LootEvent[],
  catalog: readonly CatalogMob[],
  groups: DropGroups
): S {
  const rows = dropGaps(loot, catalog, groups)
  return { ...snap, rows: [...snap.rows, ...rows], totals: { ...snap.totals, drop: rows.length } }
}

function rowOf(m: Missing): GapRow {
  const seen = [...m.seen].map(([name, n]) => ({ name, n }))
  return {
    domain: 'drop',
    name: `${m.name} (${m.mob})`,
    kinds: ['looted'],
    count: m.n,
    first: '',
    last: '',
    details: {
      samples: [],
      sources: { entries: [{ name: m.mob, n: m.n }], distinct: 1 },
      ...(m.zone === '' ? {} : { zones: { entries: [{ name: m.zone, n: m.n }], distinct: 1, all: [m.zone] } }),
      ...(seen.length > 0 ? { drops: { entries: seen, distinct: seen.length } } : {})
    }
  }
}
