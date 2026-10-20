// shared/gapFactions.ts — factions a kill moved that the mob's wiki page does not name (owner ask,
// 2026-10-18). The engine pairs each kill with the faction lines printed just before it
// (gaps_trade.rs, `killFactions`); this checks each pair against the `factions` every catalog page
// of that mob's name lists (mobs.json, `|factions` and `|opposing_factions`). A mob the catalog
// does not have at all is a mob row already, so its pairs are not repeated here.

import type { GapRow, GapsSnap } from './gaps'
import type { KillMap } from './kills'
import { spanStamps, widen, type Span } from './gapTimes'
import { pagesByMob, pickPage } from './gapMobPage'
import { mobKey } from './mobKey'
import type { MobEntry } from './mobTypes'

/** A catalog record as this reads it; `otherNames` and `factions` are absent on a branch without them. */
type CatalogMob = Pick<MobEntry, 'name' | 'page' | 'zones'> & { otherNames?: string[]; factions?: string[] }

/** One kill and a faction its lines moved, how often, and the zone last seen in. */
export interface KillFaction {
  mob: string
  faction: string
  n: number
  zone: string
  /** the amount most of its lines stated (`-30`); absent when only capped lines were seen */
  adjust?: number
  /** whether the kill raised it: the amount's sign, or a capped line's "better" (true) / "worse" (false) */
  raised?: boolean
  /**
   * The proof (owner, 2026-10-20: "how do I know it has Grobb Merchants?"): the last kills' raw log
   * lines, oldest first, each kill its faction line then its death line, stamps kept. Absent when none.
   */
  samples?: string[]
}

/**
 * The log and the wiki spell some factions apart: `Solusek Mining Co.` / `Solusek Mining Co`, `the
 * Ebon Mask`, `Opal Darkbriar` / `Opal Dark Briar`, `King Ak'Anon (Faction)`. Case, a leading
 * "the", a trailing "(Faction)" and everything but letters and digits are folded away.
 */
export function factionKey(name: string): string {
  return name
    .trim()
    .toLowerCase()
    .replace(/\s*\(faction\)\s*$/, '')
    .replace(/^the /, '')
    .replace(/[^a-z0-9]/g, '')
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
export function factionGaps(pairs: readonly KillFaction[], catalog: readonly CatalogMob[], kills: KillMap = {}): GapRow[] {
  // First and Last are the mob's first and last kill: the faction moves on its kills.
  const spans = new Map<string, Span | undefined>(Object.values(kills).map((k) => [mobKey(k.display), widen(widen(undefined, k.firstTs), k.lastTs)]))
  const listed = factionsByMob(catalog)
  const pages = pagesByMob(catalog)
  const rows: GapRow[] = []
  for (const p of pairs) {
    const known = listed.get(mobKey(p.mob))
    if (known === undefined || known.has(factionKey(p.faction))) continue
    const page = pickPage(pages.get(mobKey(p.mob)), p.zone)
    rows.push({
      domain: 'faction',
      name: `${p.faction} (${p.mob})`,
      kinds: ['killed'],
      count: p.n,
      ...spanStamps(spans.get(mobKey(p.mob))),
      details: {
        samples: p.samples ?? [],
        sources: { entries: [{ name: p.mob, n: p.n }], distinct: 1 },
        ...(p.zone === '' ? {} : { zones: { entries: [{ name: p.zone, n: p.n }], distinct: 1, all: [p.zone] } })
      },
      ...(page === undefined ? {} : { page }),
      ...(p.adjust === undefined ? {} : { adjust: p.adjust }),
      ...(p.raised === undefined ? {} : { raised: p.raised })
    })
  }
  return rows.sort((a, b) => b.count - a.count || a.name.localeCompare(b.name))
}

/** The served snapshot with the faction rows joined in and counted, so the tab treats them as a domain. */
export function withFactionRows(snap: GapsSnap, catalog: readonly CatalogMob[], kills: KillMap = {}): GapsSnap {
  const rows = factionGaps(snap.killFactions ?? [], catalog, kills)
  return { ...snap, rows: [...snap.rows, ...rows], totals: { ...snap.totals, faction: rows.length } }
}
