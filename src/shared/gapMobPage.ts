// shared/gapMobPage.ts — which wiki page a faction or drop row's chip should open (review 2026-10-19,
// B2). The rows are matched to the catalog through every name a page goes by, but a link built from
// the log's name opens a page that does not exist (`a shadowknight` for `A shadowknight (Human)`) or
// a redirect. Several pages can share a name (`Orc Centurion (Crushbone)` / `(Deathfist)`): the one
// whose `|zone` is where the player met the mob wins; with no way to choose, none is picked.

import { mobKey } from './mobKey'
import { zoneKey } from './zones'

interface Paged {
  name: string
  page: string
  otherNames?: string[]
  zones?: string[]
}

/** Every name a page goes by → its pages. */
export function pagesByMob<M extends Paged>(catalog: readonly M[]): Map<string, M[]> {
  const out = new Map<string, M[]>()
  for (const m of catalog) {
    for (const key of new Set([m.name, m.page, ...(m.otherNames ?? [])].map(mobKey))) out.set(key, [...(out.get(key) ?? []), m])
  }
  return out
}

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
