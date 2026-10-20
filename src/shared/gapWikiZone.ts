// shared/gapWikiZone.ts — a zone as the wiki spells it, for the pages Gaps copies (owner, 2026-10-19:
// instance tiers are one place). The log prints `Befallen 4 (Refined)`, `The Plane of Hate - Group 4
// (Refined)` and `The Ruins of Old Paineel`; the wiki's links and categories say `Befallen`, `Plane of
// Hate` and `The Hole`, and a category never follows a redirect.
//
// The wiki's spelling is read off the mob catalog, which holds every mob page's `|zone`: the spelling
// most pages use for the place (`zoneKey` folds tiers and a leading "the"), else the most used of the
// zone table's other names for it (`The Hole` for Old Paineel), else the log's name with the tier cut.

import { zoneEntryFor, zoneKey } from './zones'

/** ` - Solo` / ` - Group 4 (Refined)`, ` 4 (Refined)`, ` (Awakened)`: the instance, never the place. */
const TIER_TAILS = [/\s*-\s*(Solo|Group)\b.*$/i, /\s+\d+\s*\([^)]*\)\s*$/, /\s+\([^)]*\)\s*$/]

/** The log's zone name without its instance tail, case kept: `The Plane of Hate`. */
export function zoneBaseName(raw: string): string {
  let out = raw.trim()
  for (const re of TIER_TAILS) out = out.replace(re, '')
  return out.trim()
}

/** A wiki abbreviation the catalog uses (`EC`, `WFP`): never a page title to link. */
const ABBREVIATION = /^[A-Z]{2,4}$/

/** Every catalog zone spelling with how many mob pages use it. */
export function catalogZoneCounts(catalog: readonly { zones?: readonly string[] }[]): Map<string, number> {
  const counts = new Map<string, number>()
  for (const m of catalog) for (const z of m.zones ?? []) counts.set(z, (counts.get(z) ?? 0) + 1)
  return counts
}

/** The resolver: log zone name → the wiki's spelling. Build it once per catalog. */
export function wikiZoneNamer(counts: ReadonlyMap<string, number>): (raw: string) => string {
  const byKey = new Map<string, { name: string; n: number }>()
  for (const [name, n] of counts) {
    if (ABBREVIATION.test(name)) continue
    const key = zoneKey(name)
    const had = byKey.get(key)
    if (key !== '' && (had === undefined || n > had.n)) byKey.set(key, { name, n })
  }
  const memo = new Map<string, string>()
  return (raw) => {
    const hit = memo.get(raw)
    if (hit !== undefined) return hit
    const entry = zoneEntryFor(raw)
    const others = entry ? [entry.name, ...(entry.aliases ?? []), ...(entry.mobCatalogNames ?? [])] : []
    const best = others
      .filter((s) => !ABBREVIATION.test(s))
      .map((name) => ({ name, n: counts.get(name) ?? 0 }))
      .filter((s) => s.n > 0)
      .sort((a, b) => b.n - a.n)[0]
    const name = raw === '' ? '' : (byKey.get(zoneKey(raw))?.name ?? best?.name ?? zoneBaseName(raw))
    memo.set(raw, name)
    return name
  }
}
