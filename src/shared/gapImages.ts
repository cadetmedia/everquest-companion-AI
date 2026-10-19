// shared/gapImages.ts — mobs the player met whose wiki page has no image (owner ask, 2026-10-18:
// "Marda didn't have one ... So the page existed, but no npc_marda.png existed"). A mob is met when
// the kills ledger holds it or a loot line names it as the corpse; the catalog marks a page whose
// image is missing (mobs.json `noImage`, scrape-wiki-files.ts checks every named file against the
// wiki's file list). A name any page of which has an image is not a row. A mob the catalog does not
// have at all is a mob row already.

import type { GapRow } from './gaps'
import type { KillMap } from './kills'
import { mobKey } from './mobKey'
import type { MobEntry } from './mobTypes'
import type { LootEvent } from './types'
import { npcImageName } from './wikiPage'

/** A catalog record as this reads it; `otherNames` and the image fields are absent on a branch without them. */
type CatalogMob = Pick<MobEntry, 'name' | 'page'> & { otherNames?: string[]; image?: string; noImage?: true }

/** Every catalog name → its pages, all of them with no image; a name with one image anywhere is left out. */
function imagelessByMob(catalog: readonly CatalogMob[]): Map<string, CatalogMob> {
  const out = new Map<string, CatalogMob>()
  const pictured = new Set<string>()
  for (const m of catalog) {
    for (const key of [m.name, m.page, ...(m.otherNames ?? [])].map(mobKey)) {
      if (m.noImage !== true) pictured.add(key)
      else if (!out.has(key)) out.set(key, m)
    }
  }
  for (const key of pictured) out.delete(key)
  return out
}

interface Met {
  name: string
  kills: number
  loots: number
  zone: string
}

/** The mobs met, by key: kills from the ledger, loot sources with the zone last looted in. */
function metMobs(kills: KillMap, loot: readonly LootEvent[]): Map<string, Met> {
  const out = new Map<string, Met>()
  for (const k of Object.values(kills)) out.set(mobKey(k.display), { name: k.display, kills: k.count, loots: 0, zone: '' })
  for (const e of loot) {
    if (e.source === undefined) continue
    const m = out.get(mobKey(e.source)) ?? { name: e.source, kills: 0, loots: 0, zone: '' }
    m.loots++
    m.zone = e.zone ?? m.zone
    out.set(mobKey(e.source), m)
  }
  return out
}

/** The met mobs whose pages have no image, as Gaps rows filed under the page: `npc_marda.png (Marda)`. */
export function imageGaps(kills: KillMap, loot: readonly LootEvent[], catalog: readonly CatalogMob[]): GapRow[] {
  const imageless = imagelessByMob(catalog)
  const rows: GapRow[] = []
  for (const [key, met] of metMobs(kills, loot)) {
    const page = imageless.get(key)
    if (page === undefined) continue
    const n = Math.max(met.kills, met.loots)
    rows.push({
      domain: 'image',
      name: `${page.image ?? npcImageName(page.name)} (${page.page})`,
      kinds: met.kills > 0 ? ['killed'] : ['looted'],
      count: n,
      first: '',
      last: '',
      details: {
        samples: [],
        sources: { entries: [{ name: page.page, n }], distinct: 1 },
        ...(met.zone === '' ? {} : { zones: { entries: [{ name: met.zone, n }], distinct: 1, all: [met.zone] } })
      }
    })
  }
  return rows.sort((a, b) => b.count - a.count || a.name.localeCompare(b.name))
}

/** The served snapshot with the image rows joined in and counted, so the tab treats them as a domain. */
export function withImageRows<S extends { rows: GapRow[]; totals: Record<string, number> }>(
  snap: S,
  kills: KillMap,
  loot: readonly LootEvent[],
  catalog: readonly CatalogMob[]
): S {
  const rows = imageGaps(kills, loot, catalog)
  return { ...snap, rows: [...snap.rows, ...rows], totals: { ...snap.totals, image: rows.length } }
}
