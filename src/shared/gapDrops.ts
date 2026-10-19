// shared/gapDrops.ts — drops missing from a mob (owner asks, 2026-10-18): an item the player looted
// from a mob the wiki has, which no page of that mob's name lists. A mob page may list a GROUP
// (`[[Rusty Weapons]]`) instead of its items; dropGroups.json (scrape-drop-groups.ts) holds each
// group's members. The owner's rule: an item in a group is filed as the group, "Rusty Weapons
// (a bandit)", with the members the player saw, since a mob that drops one member drops the set.
// A mob the catalog does not have at all is a mob row already, so its drops are not repeated here.
//
// The wiki ties a drop to a mob on two pages, each typed by hand: the mob page's `|known_loot` and
// the item page's `|dropsfrom` (main's corpus, asked through `gapItemMobs`). A row of one item says
// which of the two lacks it. A SERVER-WIDE drop is left out (owner, 2026-10-18): one looted from
// GLOBAL_MOBS or more mobs that the wiki ties to at most GLOBAL_TIES, counting every mob page that
// lists it, a member or a group sharing a member, and every mob its item pages name. Measured on the
// owner's live log that is exactly the six Mote of ... Potential items (140 of 1,038 rows); at 5
// mobs it would also hide Rat Eye (6 mobs, tied to 2), a real gap.

import type { GapRow } from './gaps'
import { itemBaseName } from './itemStats'
import { mobKey } from './mobKey'
import type { LootEvent } from './types'

/** An item name as the catalog keys its drops: `+N` stripped, case folded (itemSources.ts `sourceItemKey`). */
const sourceItemKey = (name: string): string => itemBaseName(name).toLowerCase()

const GLOBAL_MOBS = 10
const GLOBAL_TIES = 2

/** A catalog record as this reads it; `otherNames` is absent on a branch without it. */
interface CatalogMob {
  name: string
  page: string
  otherNames?: string[]
  drops?: string[]
}

/** Group name → its member items, as dropGroups.json states them. */
export type DropGroups = Readonly<Record<string, readonly string[]>>

/** Item key → the mobs its item page names; null for no page. Absent until main has answered. */
export type ItemMobs = ReadonlyMap<string, readonly string[] | null>

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
  group: boolean
  zone: string
  n: number
  /** the members seen, for a group */
  seen: Map<string, number>
}

/** The (mob, item or group) pairs no page of the mob lists, as Gaps rows, most looted first. */
export function dropGaps(loot: readonly LootEvent[], catalog: readonly CatalogMob[], groups: DropGroups, itemMobs?: ItemMobs): GapRow[] {
  const listed = dropsByMob(catalog)
  const inGroups = groupsByItem(groups)
  const missing = new Map<string, Missing>()
  for (const e of loot) {
    const filed = filedAs(e, listed, inGroups)
    if (filed === null || e.source === undefined) continue
    const key = `${mobKey(e.source)}|${sourceItemKey(filed.name)}`
    const m = missing.get(key) ?? { mob: e.source, name: filed.name, group: filed.group, zone: '', n: 0, seen: new Map<string, number>() }
    m.n += e.count ?? 1
    m.zone = e.zone ?? m.zone
    if (filed.group) m.seen.set(e.item, (m.seen.get(e.item) ?? 0) + (e.count ?? 1))
    missing.set(key, m)
  }
  const kept = itemMobs === undefined ? [...missing.values()] : withoutServerWide([...missing.values()], catalog, groups, itemMobs)
  return kept.map((m) => rowOf(m, itemMobs)).sort((a, b) => b.count - a.count || a.name.localeCompare(b.name))
}

/** What a looted item is filed as when its mob's page lists neither it nor a group holding it; null when listed or the mob is unknown. */
function filedAs(e: LootEvent, listed: ReadonlyMap<string, Set<string>>, inGroups: ReadonlyMap<string, string[]>): { name: string; group: boolean } | null {
  const page = e.source === undefined ? undefined : listed.get(mobKey(e.source))
  if (page === undefined || page.has(sourceItemKey(e.item))) return null
  const its = inGroups.get(sourceItemKey(e.item)) ?? []
  if (its.some((g) => page.has(sourceItemKey(g)))) return null
  // The item's own page is the base item's: `Barbed Legplates +4` is filed as `Barbed Legplates`.
  return its.length > 0 ? { name: its[0], group: true } : { name: itemBaseName(e.item), group: false }
}

/** The pairs less the server-wide drops (see the header): looted from many mobs, tied by the wiki to almost none. */
function withoutServerWide(pairs: Missing[], catalog: readonly CatalogMob[], groups: DropGroups, itemMobs: ItemMobs): Missing[] {
  const mobsOf = new Map<string, Set<string>>()
  for (const p of pairs) mobsOf.set(sourceItemKey(p.name), (mobsOf.get(sourceItemKey(p.name)) ?? new Set()).add(mobKey(p.mob)))
  const wide = new Set<string>()
  for (const [subject, mobs] of mobsOf) {
    if (mobs.size >= GLOBAL_MOBS && ties(subject, catalog, groups, itemMobs).size <= GLOBAL_TIES) wide.add(subject)
  }
  return pairs.filter((p) => !wide.has(sourceItemKey(p.name)))
}

/** Every mob the wiki ties a drop (an item or group key) to, on either side of the two pages. */
function ties(subject: string, catalog: readonly CatalogMob[], groups: DropGroups, itemMobs: ItemMobs): Set<string> {
  const entries = Object.entries(groups).map(([g, ms]) => [sourceItemKey(g), ms.map(sourceItemKey)] as const)
  const names = new Set([subject, ...(entries.find(([g]) => g === subject)?.[1] ?? [])])
  for (const [g, ms] of entries) if (ms.some((m) => names.has(m))) names.add(g)
  const out = new Set<string>()
  for (const m of catalog) if ((m.drops ?? []).some((d) => names.has(sourceItemKey(d)))) out.add(mobKey(m.name))
  for (const n of names) for (const mob of itemMobs.get(n) ?? []) out.add(mobKey(mob))
  return out
}

/** The served snapshot with the drop rows joined in and counted, so the tab treats them as a domain. */
export function withDropRows<S extends { rows: GapRow[]; totals: Record<string, number> }>(
  snap: S,
  loot: readonly LootEvent[],
  wiki: { catalog: readonly CatalogMob[]; groups: DropGroups; itemMobs?: ItemMobs }
): S {
  const rows = dropGaps(loot, wiki.catalog, wiki.groups, wiki.itemMobs)
  return { ...snap, rows: [...snap.rows, ...rows], totals: { ...snap.totals, drop: rows.length } }
}

/** Whether a single item's own page names the mob; absent for a group, a page the wiki lacks, or before main answers. */
function itemPageSide(m: Missing, itemMobs: ItemMobs | undefined): GapRow['itemPage'] {
  const mobs = m.group ? undefined : itemMobs?.get(sourceItemKey(m.name))
  if (mobs === undefined || mobs === null) return undefined
  return mobs.some((x) => mobKey(x) === mobKey(m.mob)) ? 'namesMob' : 'lacksMob'
}

function rowOf(m: Missing, itemMobs: ItemMobs | undefined): GapRow {
  const seen = [...m.seen].map(([name, n]) => ({ name, n }))
  const itemPage = itemPageSide(m, itemMobs)
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
    },
    ...(itemPage === undefined ? {} : { itemPage })
  }
}

/** The looted item names main should be asked about: one per item key. */
export function lootedItemNames(loot: readonly LootEvent[]): string[] {
  const out = new Map<string, string>()
  for (const e of loot) if (e.source !== undefined && !out.has(sourceItemKey(e.item))) out.set(sourceItemKey(e.item), itemBaseName(e.item))
  return [...out.values()]
}
