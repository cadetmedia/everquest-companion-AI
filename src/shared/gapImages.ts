// shared/gapImages.ts — mobs the player met whose wiki page has no image (owner ask, 2026-10-18:
// "Marda didn't have one ... So the page existed, but no npc_marda.png existed"). A mob is met when
// the kills ledger holds it, a loot line names it as the corpse, or the player conned it (Marda was
// conned and hailed, never killed: review 2026-10-19); the catalog marks a page whose
// image is missing (mobs.json `noImage`, scrape-wiki-files.ts checks every named file against the
// wiki's file list). A name any page of which has an image is not a row. A mob the catalog does not
// have at all is a mob row already.

import type { GapRow } from './gaps'
import { spanStamps, widen, type Span } from './gapTimes'
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
  cons: number
  zone: string
  /** first and last met by a kill or a loot (a con carries no time here) */
  span?: Span
}

/** A /con as this reads it (the consider module's row): who, where, how often. */
export interface ConMet {
  mob: string
  zone?: string
  cons: number
}

/** The mobs met, by key: kills from the ledger, loot sources with the zone last looted in, cons with theirs. */
function metMobs(kills: KillMap, loot: readonly LootEvent[], cons: readonly ConMet[]): Map<string, Met> {
  const out = new Map<string, Met>()
  for (const k of Object.values(kills)) out.set(mobKey(k.display), { name: k.display, kills: k.count, loots: 0, cons: 0, zone: '', span: widen(widen(undefined, k.firstTs), k.lastTs) })
  for (const e of loot) {
    if (e.source === undefined) continue
    const m = out.get(mobKey(e.source)) ?? { name: e.source, kills: 0, loots: 0, cons: 0, zone: '' }
    m.loots++
    m.zone = e.zone ?? m.zone
    m.span = widen(m.span, e.ts)
    out.set(mobKey(e.source), m)
  }
  // A con places a mob the player only killed (kills carry no zone) or only looked at.
  for (const c of cons) {
    const m = out.get(mobKey(c.mob)) ?? { name: c.mob, kills: 0, loots: 0, cons: 0, zone: '' }
    m.cons += c.cons
    if (m.zone === '') m.zone = c.zone ?? ''
    out.set(mobKey(c.mob), m)
  }
  return out
}

/** The met mobs whose pages have no image, as Gaps rows named by the page, the file on the row. */
export function imageGaps(kills: KillMap, loot: readonly LootEvent[], catalog: readonly CatalogMob[], cons: readonly ConMet[] = []): GapRow[] {
  const imageless = imagelessByMob(catalog)
  // One row per PAGE: two spellings met (a name and a redirect, say) can lead to one page, and two
  // rows of one name broke the table (owner, 2026-10-19). The busiest spelling's tallies stand.
  const byPage = new Map<string, GapRow>()
  for (const [key, met] of metMobs(kills, loot, cons)) {
    const page = imageless.get(key)
    if (page === undefined) continue
    const n = Math.max(met.kills, met.loots, met.cons)
    if ((byPage.get(page.page)?.count ?? -1) >= n) continue
    byPage.set(page.page, {
      domain: 'image',
      name: page.page,
      image: page.image ?? npcImageName(page.name),
      kinds: met.kills > 0 ? ['killed'] : met.loots > 0 ? ['looted'] : ['considered'],
      count: n,
      ...spanStamps(met.span),
      details: {
        samples: [],
        sources: { entries: [{ name: page.page, n }], distinct: 1 },
        ...(met.zone === '' ? {} : { zones: { entries: [{ name: met.zone, n }], distinct: 1, all: [met.zone] } })
      }
    })
  }
  return [...byPage.values()].sort((a, b) => b.count - a.count || a.name.localeCompare(b.name))
}

/** The served snapshot with the image rows joined in and counted, so the tab treats them as a domain. */
export function withImageRows<S extends { rows: GapRow[]; totals: Record<string, number> }>(
  snap: S,
  met: { kills: KillMap; loot: readonly LootEvent[]; cons?: readonly ConMet[] },
  catalog: readonly CatalogMob[]
): S {
  const rows = imageGaps(met.kills, met.loot, catalog, met.cons ?? [])
  return { ...snap, rows: [...snap.rows, ...rows], totals: { ...snap.totals, image: rows.length } }
}
