// shared/gapFactions.ts — factions a kill moved that the mob's wiki page does not name (owner ask,
// 2026-10-18). The engine pairs each kill with the faction lines printed just before it
// (gaps_trade.rs, `killFactions`); this checks each pair against the `factions` every catalog page
// of that mob's name lists (mobs.json, `|factions` and `|opposing_factions`). A mob the catalog
// does not have at all is a mob row already, so its pairs are not repeated here.

import type { GapRow, GapsSnap } from './gaps'
import { mobKey } from './mobKey'
import type { MobEntry } from './mobTypes'

/** A catalog record as this reads it; `otherNames` and `factions` are absent on a branch without them. */
type CatalogMob = Pick<MobEntry, 'name' | 'page'> & { otherNames?: string[]; factions?: string[] }

/** One kill and a faction its lines moved, how often, and the zone last seen in. */
export interface KillFaction {
  mob: string
  faction: string
  n: number
  zone: string
  /** the last amount a line stated (`-30`); absent for a capped standing */
  adjust?: number
}

/** The log and the wiki spell some factions apart: `Solusek Mining Co.` / `Solusek Mining Co`, `the Ebon Mask`. */
export function factionKey(name: string): string {
  return name.trim().toLowerCase().replace(/\.$/, '').replace(/^the /, '')
}

/** Every catalog name (its `|name`, page title and wiki redirects) → the factions its pages list. */
function factionsByMob(catalog: readonly CatalogMob[]): Map<string, Set<string>> {
  const out = new Map<string, Set<string>>()
  for (const m of catalog) {
    for (const name of [m.name, m.page, ...(m.otherNames ?? [])]) {
      const set = out.get(mobKey(name)) ?? new Set<string>()
      for (const f of m.factions ?? []) set.add(factionKey(f))
      out.set(mobKey(name), set)
    }
  }
  return out
}

/** The pairs no page of the mob's name lists, as Gaps rows: `Clurg (a goblin)`, most seen first. */
export function factionGaps(pairs: readonly KillFaction[], catalog: readonly CatalogMob[]): GapRow[] {
  const listed = factionsByMob(catalog)
  const rows: GapRow[] = []
  for (const p of pairs) {
    const known = listed.get(mobKey(p.mob))
    if (known === undefined || known.has(factionKey(p.faction))) continue
    rows.push({
      domain: 'faction',
      name: `${p.faction} (${p.mob})`,
      kinds: ['killed'],
      count: p.n,
      first: '',
      last: '',
      details: {
        samples: [],
        sources: { entries: [{ name: p.mob, n: p.n }], distinct: 1 },
        ...(p.zone === '' ? {} : { zones: { entries: [{ name: p.zone, n: p.n }], distinct: 1, all: [p.zone] } })
      }
    })
  }
  return rows.sort((a, b) => b.count - a.count || a.name.localeCompare(b.name))
}

/** The served snapshot with the faction rows joined in and counted, so the tab treats them as a domain. */
export function withFactionRows(snap: GapsSnap, catalog: readonly CatalogMob[]): GapsSnap {
  const rows = factionGaps(snap.killFactions ?? [], catalog)
  return { ...snap, rows: [...snap.rows, ...rows], totals: { ...snap.totals, faction: rows.length } }
}
