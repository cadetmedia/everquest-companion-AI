// shared/gapMobPage.ts — which wiki page a faction or drop row's chip should open (review 2026-10-19,
// B2). The rows are matched to the catalog through every name a page goes by, but a link built from
// the log's name opens a page that does not exist (`a shadowknight` for `A shadowknight (Human)`) or
// a redirect. Several pages can share a name (`Orc Centurion (Crushbone)` / `(Deathfist)`): the one
// whose `|zone` is where the player met the mob wins; with no way to choose, none is picked. An item
// page's `|soldby` row finds its vendor the same way (`vendorFinder`, review D1).

import { gapMobKey, perObject } from './gapMemo'
import { mobKey } from './mobKey'
import { zoneKey } from './zones'

interface Paged {
  name: string
  page: string
  otherNames?: string[]
  zones?: string[]
}

/** Every name a page goes by → its pages; built once per catalog (gapMemo.ts), so it is read-only. */
export function pagesByMob<M extends Paged>(catalog: readonly M[]): ReadonlyMap<string, readonly M[]> {
  // Sound: every page in the index is an element of `catalog`, so it is an M.
  return pagesIndex(catalog) as ReadonlyMap<string, readonly M[]>
}

const pagesIndex = perObject((catalog: readonly Paged[]): ReadonlyMap<string, readonly Paged[]> => {
  const out = new Map<string, Paged[]>()
  for (const m of catalog) {
    for (const key of new Set([m.name, m.page, ...(m.otherNames ?? [])].map(gapMobKey))) {
      const pages = out.get(key)
      if (pages === undefined) out.set(key, [m])
      else pages.push(m)
    }
  }
  return out
})

/** Whether the catalog has a mob of this name (any of its names, `mobKey`-folded). */
export function catalogNameTest(catalog: readonly Paged[]): (name: string) => boolean {
  const names = new Set(catalog.flatMap((m) => [m.name, m.page, ...(m.otherNames ?? [])].map(mobKey)))
  return (name) => names.has(mobKey(name))
}

/** The page for a mob met in a zone: the only one, the one in that zone, or none when it cannot tell. */
export function pickPage(pages: readonly Paged[] | undefined, zone: string): string | undefined {
  if (pages === undefined || pages.length === 0) return undefined
  if (pages.length === 1) return pages[0].page
  const here = zoneKey(zone)
  const inZone = here === '' ? [] : pages.filter((p) => (p.zones ?? []).some((z) => zoneKey(z) === here))
  return inZone.length === 1 ? inZone[0].page : undefined
}

/**
 * The drop names the wiki files under a mob page's `|common_loot` (review 2026-10-19): on 195 of
 * 7,954 pages that field holds loot shared across mobs (Classic Raid Tier Treasures on 58 pages,
 * a plane's set loot), and `|known_loot` the mob's own. A name counts as common loot when at least
 * three pages list it there and more pages list it there than under `|known_loot`. Lower-cased.
 * Built once per catalog (gapMemo.ts), so it is read-only.
 */
export const commonLootNames = perObject((catalog: readonly { drops?: string[]; commonDrops?: string[] }[]): ReadonlySet<string> => {
  const common = new Map<string, number>()
  const known = new Map<string, number>()
  for (const m of catalog) {
    for (const d of m.commonDrops ?? []) common.set(d.toLowerCase(), (common.get(d.toLowerCase()) ?? 0) + 1)
    for (const d of m.drops ?? []) known.set(d.toLowerCase(), (known.get(d.toLowerCase()) ?? 0) + 1)
  }
  return new Set([...common].filter(([name, n]) => n >= 3 && n > (known.get(name) ?? 0)).map(([name]) => name))
})

/** A vendor as an item page's `|soldby` row names it (review D1): its page, its zone, its one spawn point. */
export interface VendorPlace {
  page: string
  /** The page's zone, as the page spells it; absent when it names none or several and the log cannot choose. */
  zone?: string
  /** `/loc` order (ns, ew); absent unless the page states exactly one point (a vendor with several is not placed). */
  loc?: readonly [number, number]
}

export type VendorFinder = (vendor: string, zones: readonly string[]) => VendorPlace | undefined

type Placed = Paged & { loc?: readonly { ns: number; ew: number }[] }

/**
 * Where a vendor the player bought from stands, by the catalog: the only page of that name, else
 * the one page whose `|zone` is among the zones the item was seen in; none when that cannot tell.
 * Build it once per catalog.
 */
export function vendorFinder(catalog: readonly Placed[]): VendorFinder {
  const pages = pagesByMob(catalog)
  return (vendor, zones) => {
    const all = pages.get(mobKey(vendor)) ?? []
    const keys = new Set(zones.map(zoneKey).filter((k) => k !== ''))
    const inZone = (p: Placed): boolean => (p.zones ?? []).some((z) => keys.has(zoneKey(z)))
    const page = all.length === 1 ? all[0] : all.filter(inZone).length === 1 ? all.find(inZone) : undefined
    if (page === undefined) return undefined
    const named = (page.zones ?? []).filter((z) => z !== 'Various')
    const zone = named.find((z) => keys.has(zoneKey(z))) ?? (named.length === 1 ? named[0] : undefined)
    const one = page.loc?.length === 1 ? page.loc[0] : undefined
    return { page: page.page, ...(zone === undefined ? {} : { zone }), ...(one === undefined ? {} : { loc: [one.ns, one.ew] as const }) }
  }
}
