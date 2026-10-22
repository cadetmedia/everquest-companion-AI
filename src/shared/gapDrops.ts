// shared/gapDrops.ts — drops missing from a mob (owner asks, 2026-10-18): an item the player looted
// from a mob the wiki has, which no page of that mob's name lists. A mob page may list a GROUP
// (`[[Rusty Weapons]]`) instead of its items; dropGroups.json (scrape-drop-groups.ts) holds each
// group's members. The owner's rule: an item in a group is filed as the group, "Rusty Weapons
// (a bandit)", with the members the player saw, since a mob that drops one member drops the set.
// Drop groups are standardized (owner, 2026-10-21: "we really need the app to standardize rusty
// weapons vs listing all these random rusty weapons"): only the group line is ever offered, never a
// member's. A page that writes the group out member by member (A Cracked Skeleton, A lizard man
// scout) and lacks the member looted gets the group's row, which also names those lines as an
// optional while-you-edit cleanup, the group line rated by their own `[Overall: x%]` summed. A page
// that lacks nothing gets no row: collapsing lines alone is formatting (owner, same day: "we are not
// wiki admins ... as long as we aren't editing it for formatting sake alone").
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
import { spanStamps, widen, type Span } from './gapTimes'
import { commonLootNames, pagesByMob, pickPage } from './gapMobPage'
import { gapMobKey as mobKey, memoFold, perObject } from './gapMemo'
import { itemBaseName } from './itemStats'
import type { LootEvent } from './types'
import { mobSourceOf } from './rewardChest'

// SPEED (perf audit, 2026-10-20: each Gaps visit 400–500 ms): every index below that reads only the
// catalog or the groups is built once per object (gapMemo.ts `perObject`), and the two folds are
// remembered (`memoFold`). The server-wide rule's `ties` used to rebuild the groups' keys and rescan
// all ~7,900 pages per looted item; it now reads `catalogTies` and `groupTies`. The rows are the
// same, byte for byte: only where the work happens moved.

/** An item name as the catalog keys its drops: `+N` stripped, case folded (itemSources.ts `sourceItemKey`). */
const sourceItemKey = memoFold((name: string): string => itemBaseName(name).toLowerCase())

/**
 * The key with a leading article folded away, for matching a loot line to a page's list only (owner,
 * 2026-10-20): the game prints `an Alligator Tooth`, the loot reader drops the `an`, and the wiki's
 * page is `An Alligator Tooth`, while `Alligator Tooth` there is a disambiguation page whose
 * transclusion puts a list inside the mob's loot list.
 */
const bareItemKey = memoFold((name: string): string => sourceItemKey(name).replace(/^(a|an|the) /, ''))

const GLOBAL_MOBS = 10
const GLOBAL_TIES = 2

/** A catalog record as this reads it; `otherNames` is absent on a branch without it. */
interface CatalogMob {
  name: string
  page: string
  otherNames?: string[]
  zones?: string[]
  drops?: string[]
  /** the page's `|common_loot`, which lists a drop as surely as `|known_loot` (owner, 2026-10-19) */
  commonDrops?: string[]
  /** each `drops` entry's `[Overall: x%]`, null where its line states none; absent until the data carries it */
  dropRates?: readonly (number | null)[]
}

/** Group name → its member items, as dropGroups.json states them. */
export type DropGroups = Readonly<Record<string, readonly string[]>>

/** A drop-list link that redirects to an item page → that item (`A Wooden Heart` → `Wooden Heart`), from dropGroups.json. */
export type DropAliases = Readonly<Record<string, string>>

/** Item key → the mobs its item page names; null for no page. Absent until main has answered. */
export type ItemMobs = ReadonlyMap<string, readonly string[] | null>

/** A link to a qualified page, `Large Ruby (Eye of Toque)`, read also as the item it shows, `Large Ruby`. */
const QUALIFIED = /^(.+?)\s+\([^()]+\)$/

/**
 * Every drop a page lists, in both loot fields, with the item a redirect title stands for, and each
 * qualified link also without its qualifier (owner, 2026-10-19: Lynuga's page lists `[[Large Ruby
 * (Eye of Toque)|Large Ruby]]` and the tab still asked for Large Ruby). Both spellings count, since a
 * bracket is often the game's own name (`Salil's Writ Pg. 60 (Left)`, `Words of Collection (Azia)`).
 */
function listedDrops(m: CatalogMob, aliases: DropAliases): string[] {
  const named = [...(m.drops ?? []), ...(m.commonDrops ?? [])]
  const bare = named.flatMap((d) => QUALIFIED.exec(d)?.[1] ?? [])
  return [...named, ...bare, ...named.flatMap((d) => (aliases[d] === undefined ? [] : [aliases[d]]))]
}

/** The aliases when none are given: one object, so the per-(catalog, aliases) index below is found again. */
const NO_ALIASES: DropAliases = {}

/** Every catalog name → the drop names (item keys) its pages list. */
function dropsByMob(catalog: readonly CatalogMob[], aliases: DropAliases): ReadonlyMap<string, ReadonlySet<string>> {
  const out = new Map<string, Set<string>>()
  for (const m of catalog) {
    // One page's keys, once: the page's every name shares them.
    const keys = listedDrops(m, aliases).flatMap((d) => [sourceItemKey(d), bareItemKey(d)])
    for (const name of [m.name, m.page, ...(m.otherNames ?? [])]) {
      const set = out.get(mobKey(name)) ?? new Set<string>()
      for (const k of keys) set.add(k)
      out.set(mobKey(name), set)
    }
  }
  return out
}

/** `dropsByMob`, built once per (catalog, aliases). */
const listedFor = perObject((catalog: readonly CatalogMob[]) => perObject((aliases: DropAliases) => dropsByMob(catalog, aliases)))

/** Item key → the groups that list it; built once per groups table. */
const groupsByItem = perObject((groups: DropGroups): ReadonlyMap<string, readonly string[]> => {
  const out = new Map<string, string[]>()
  for (const [group, members] of Object.entries(groups)) {
    for (const m of members) out.set(sourceItemKey(m), [...(out.get(sourceItemKey(m)) ?? []), group])
  }
  return out
})

/** Group name → its members' keys; built once per groups table. */
const memberKeys = perObject((groups: DropGroups): ReadonlyMap<string, readonly string[]> => new Map(Object.entries(groups).map(([g, ms]) => [g, ms.map(sourceItemKey)])))

/** Each group as `ties` reads it, keys folded, in the table's order: (group key, member keys). Once per table. */
const groupTies = perObject((groups: DropGroups): readonly (readonly [string, readonly string[]])[] =>
  Object.entries(groups).map(([g, ms]) => [sourceItemKey(g), ms.map(sourceItemKey)] as const)
)

/**
 * Drop key → the mobs (`mobKey` of each page's `|name`) whose page lists it under either loot field,
 * raw names only (no aliases, no unqualified spellings: what `ties` always counted). Once per catalog.
 */
const catalogTies = perObject((catalog: readonly CatalogMob[]): ReadonlyMap<string, ReadonlySet<string>> => {
  const out = new Map<string, Set<string>>()
  for (const m of catalog) {
    for (const d of [...(m.drops ?? []), ...(m.commonDrops ?? [])]) {
      const mobs = out.get(sourceItemKey(d)) ?? new Set<string>()
      out.set(sourceItemKey(d), mobs.add(mobKey(m.name)))
    }
  }
  return out
})

interface Missing {
  mob: string
  /** the group it is filed as, or the item itself */
  name: string
  group: boolean
  /** the zone last looted in, and every zone it dropped in with its corpses */
  zone: string
  zones: Map<string, number>
  n: number
  /** the members seen, for a group */
  seen: Map<string, number>
  /** each corpse once: a line per copy of an item prints from one corpse in one second */
  corpses: Set<string>
  /** first and last looted, for the row's First and Last */
  span?: Span
}

/** A page's member lines and, when every one states it, their summed `[Overall: x%]`. */
type Replaces = NonNullable<GapRow['replaces']>

/** The (mob, item or group) pairs no page of the mob lists, as Gaps rows, most looted first. */
/** What the wiki says beside the mob pages: each item page's mobs (main's answer) and the redirect titles. */
export interface DropSide {
  itemMobs?: ItemMobs
  aliases?: DropAliases
}

/** One loot line into its (mob, item or group) pair: each corpse once, every zone, the members seen. */
function addDrop(missing: Map<string, Missing>, e: LootEvent, mob: string, filed: { name: string; group: boolean }): void {
  const key = `${mobKey(mob)}|${sourceItemKey(filed.name)}`
  const m = missing.get(key) ?? { mob, name: filed.name, group: filed.group, zone: '', zones: new Map<string, number>(), n: 0, seen: new Map<string, number>(), corpses: new Set<string>() }
  // Corpses, not stack sizes or lines: the count feeds a drop rate (drops per kill).
  m.corpses.add(`${String(e.ts)}|${mobKey(mob)}`)
  m.n = m.corpses.size
  m.zone = e.zone ?? m.zone
  m.span = widen(m.span, e.ts)
  if (e.zone !== undefined) m.zones.set(e.zone, (m.zones.get(e.zone) ?? 0) + 1)
  if (filed.group) m.seen.set(e.item, (m.seen.get(e.item) ?? 0) + 1)
  missing.set(key, m)
}

export function dropGaps(loot: readonly LootEvent[], catalog: readonly CatalogMob[], groups: DropGroups, side: DropSide = {}): GapRow[] {
  const { itemMobs, aliases = NO_ALIASES } = side
  const listed = listedFor(catalog)(aliases)
  const pages = pagesByMob(catalog)
  const common = commonLootNames(catalog)
  const inGroups = groupsByItem(groups)
  const missing = new Map<string, Missing>()
  const listedMembers: [LootEvent, string, Filed][] = []
  for (const e of loot) {
    const filed = filedAs(e, listed, inGroups)
    const mob = mobSourceOf(e)
    if (filed === null || mob === undefined) continue
    if (filed.listed === true) listedMembers.push([e, mob, filed])
    else addDrop(missing, e, mob, filed)
  }
  // A member the page lists makes no row, but counts toward a group row the page lacks: its rate is any member.
  for (const [e, mob, filed] of listedMembers) if (missing.has(`${mobKey(mob)}|${sourceItemKey(filed.name)}`)) addDrop(missing, e, mob, filed)
  const kept = itemMobs === undefined ? [...missing.values()] : withoutServerWide([...missing.values()], catalog, groups, itemMobs)
  const field = (m: Missing): Partial<GapRow> => (common.has(m.name.toLowerCase()) ? { lootField: 'common_loot' } : {})
  const members = memberKeys(groups)
  const rowFor = (m: Missing): GapRow => {
    const mobPages = pages.get(mobKey(m.mob))
    const page = pickPage(mobPages, m.zone)
    const replaces = m.group ? memberLines(mobPages?.filter((p) => page === undefined || p.page === page) ?? [], new Set(members.get(m.name))) : undefined
    return { ...rowOf(m, itemMobs, page), ...field(m), ...(replaces === undefined ? {} : { replaces }) }
  }
  return kept.map(rowFor).sort((a, b) => b.count - a.count || a.name.localeCompare(b.name))
}

/** What a loot line is filed as; `listed` for a group member the page lists by itself. */
interface Filed {
  name: string
  group: boolean
  listed?: true
}

/**
 * What a looted item is filed as when its mob's page lists neither it nor a group holding it; null
 * when listed, the mob is unknown or it was a chest payout. An item in a group the page lacks is
 * filed as the group, even when the page lists other members one by one (never a member's line).
 */
function filedAs(e: LootEvent, listed: ReadonlyMap<string, ReadonlySet<string>>, inGroups: ReadonlyMap<string, readonly string[]>): Filed | null {
  const mob = mobSourceOf(e)
  const page = mob === undefined ? undefined : listed.get(mobKey(mob))
  if (page === undefined) return null
  const its = inGroups.get(sourceItemKey(e.item)) ?? []
  if (its.some((g) => page.has(sourceItemKey(g)))) return null
  const onPage = page.has(sourceItemKey(e.item)) || page.has(bareItemKey(e.item))
  if (its.length > 0) return onPage ? { name: its[0], group: true, listed: true } : { name: its[0], group: true }
  // The item's own page is the base item's: `Barbed Legplates +4` is filed as `Barbed Legplates`.
  return onPage ? null : { name: itemBaseName(e.item), group: false }
}

/**
 * The lines of a mob's pages naming a group member by itself (`{{:Rusty Mace}}`), as the page spells
 * them, and their `[Overall: x%]` summed when every one states it; undefined when the page has none.
 */
function memberLines(pages: readonly CatalogMob[], keys: ReadonlySet<string>): Replaces | undefined {
  const names = new Map<string, string>()
  const rates = new Map<string, number | null>()
  for (const p of pages) {
    ;(p.drops ?? []).forEach((d, i) => {
      if (keys.has(sourceItemKey(d)) && !rates.has(sourceItemKey(d))) rates.set(sourceItemKey(d), p.dropRates?.[i] ?? null)
    })
    for (const d of [...(p.drops ?? []), ...(p.commonDrops ?? [])]) if (keys.has(sourceItemKey(d)) && !names.has(sourceItemKey(d))) names.set(sourceItemKey(d), d)
  }
  if (names.size === 0) return undefined
  const stated = [...names.keys()].map((k) => rates.get(k) ?? null)
  if (stated.some((r) => r === null)) return { lines: [...names.values()] }
  return { lines: [...names.values()], rate: Math.round(stated.reduce((a: number, r) => a + (r ?? 0), 0) * 10) / 10 }
}

/** The optional cleanup beside a group's row: the page's member lines, and the one group line that stands for them. */
export function replaceWhy(group: string, lines: readonly string[]): string {
  const n = lines.length
  return `While you're editing (optional): ${n === 1 ? 'this line' : `these ${String(n)} lines`} (${lines.join(', ')}) can become the one [[${group}]] line.`
}

/** The pairs less the server-wide drops (see the header): looted from many mobs, tied by the wiki to almost none. */
function withoutServerWide(pairs: Missing[], catalog: readonly CatalogMob[], groups: DropGroups, itemMobs: ItemMobs): Missing[] {
  const mobsOf = new Map<string, Set<string>>()
  for (const p of pairs) mobsOf.set(sourceItemKey(p.name), (mobsOf.get(sourceItemKey(p.name)) ?? new Set()).add(mobKey(p.mob)))
  const wide = new Set<string>()
  const wiki = { byDrop: catalogTies(catalog), entries: groupTies(groups), itemMobs }
  for (const [subject, mobs] of mobsOf) {
    if (mobs.size >= GLOBAL_MOBS && ties(subject, wiki).size <= GLOBAL_TIES) wide.add(subject)
  }
  return pairs.filter((p) => !wide.has(sourceItemKey(p.name)))
}

/** Every mob the wiki ties a drop (an item or group key) to, on either side of the two pages. */
function ties(
  subject: string,
  wiki: { byDrop: ReadonlyMap<string, ReadonlySet<string>>; entries: ReturnType<typeof groupTies>; itemMobs: ItemMobs }
): Set<string> {
  const { byDrop, entries, itemMobs } = wiki
  const names = new Set([subject, ...(entries.find(([g]) => g === subject)?.[1] ?? [])])
  // In the table's order, as before: a group added here can be a later group's member.
  for (const [g, ms] of entries) if (ms.some((m) => names.has(m))) names.add(g)
  const out = new Set<string>()
  for (const n of names) for (const mob of byDrop.get(n) ?? []) out.add(mob)
  for (const n of names) for (const mob of itemMobs.get(n) ?? []) out.add(mobKey(mob))
  return out
}

/** The served snapshot with the drop rows joined in and counted, so the tab treats them as a domain. */
export function withDropRows<S extends { rows: GapRow[]; totals: Record<string, number> }>(
  snap: S,
  loot: readonly LootEvent[],
  wiki: { catalog: readonly CatalogMob[]; groups: DropGroups; itemMobs?: ItemMobs; aliases?: DropAliases }
): S {
  const rows = dropGaps(loot, wiki.catalog, wiki.groups, { itemMobs: wiki.itemMobs, aliases: wiki.aliases })
  return { ...snap, rows: [...snap.rows, ...rows], totals: { ...snap.totals, drop: rows.length } }
}

/** Whether a single item's own page names the mob; absent for a group, a page the wiki lacks, or before main answers. */
function itemPageSide(m: Missing, itemMobs: ItemMobs | undefined): GapRow['itemPage'] {
  const mobs = m.group ? undefined : itemMobs?.get(sourceItemKey(m.name))
  if (mobs === undefined || mobs === null) return undefined
  return mobs.some((x) => mobKey(x) === mobKey(m.mob)) ? 'namesMob' : 'lacksMob'
}

/** Every zone it dropped in, most first: the Zone I'm in filter finds it in any of them. */
function zoneTally(zones: ReadonlyMap<string, number>): NonNullable<GapRow['details']['zones']> {
  const entries = [...zones].map(([name, n]) => ({ name, n })).sort((a, b) => b.n - a.n || a.name.localeCompare(b.name))
  return { entries: entries.slice(0, 8), distinct: entries.length, all: entries.map((e) => e.name) }
}

function rowOf(m: Missing, itemMobs: ItemMobs | undefined, page: string | undefined): GapRow {
  const seen = [...m.seen].map(([name, n]) => ({ name, n }))
  const itemPage = itemPageSide(m, itemMobs)
  return {
    domain: 'drop',
    name: `${m.name} (${m.mob})`,
    kinds: ['looted'],
    count: m.n,
    ...spanStamps(m.span),
    details: {
      samples: [],
      sources: { entries: [{ name: m.mob, n: m.n }], distinct: 1 },
      ...(m.zones.size === 0 ? {} : { zones: zoneTally(m.zones) }),
      ...(seen.length > 0 ? { drops: { entries: seen, distinct: seen.length } } : {})
    },
    ...(itemPage === undefined ? {} : { itemPage }),
    ...(page === undefined ? {} : { page })
  }
}

/** The looted item names main should be asked about: one per item key. */
export function lootedItemNames(loot: readonly LootEvent[]): string[] {
  const out = new Map<string, string>()
  for (const e of loot) if (mobSourceOf(e) !== undefined && !out.has(sourceItemKey(e.item))) out.set(sourceItemKey(e.item), itemBaseName(e.item))
  return [...out.values()]
}
