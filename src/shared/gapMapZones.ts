// shared/gapMapZones.ts — the zones a Gaps row's details can open on the Maps tab (review C7; owner,
// 2026-10-21: "sure you can do that", a map link on Gaps rows and zone headings). Only a spelling the
// zone table resolves (`zoneShortNameFromCatalog`, the Gear tab's Zone-cell rule) becomes a link; a
// refused one stays off, never a nearest guess. Instance tiers fold to one map (`zoneKey`).
//
// A hand edit's zone comes first (gapEdits.ts, a mob or merchant page's `zone` field): the player put
// it right, so it is the place the page will say (owner, 2026-10-25: "make sure that if a user changes
// the values it doesn't break anything"). A typed `[[Zone]]` or `[[Page|Shown]]` link reads as its
// page; a value the table refuses, a blank one or one that is no string adds nothing.

import type { ZoneShort } from './maps'
import type { GapRow } from './gaps'
import { zoneShortNameFromCatalog } from './zones'

/** One map a row can open: the zone's words, and the map stem. */
export interface GapMapZone {
  label: string
  short: ZoneShort
}

/** `[[Befallen]]` → `Befallen`, `[[Cazic Thule (Zone)|Cazic Thule]]` → `Cazic Thule (Zone)`; plain text as typed. */
function linkTarget(text: string): string {
  const m = /^\s*\[\[([^\]|]*)(?:\|[^\]]*)?\]\]\s*$/.exec(text)
  return (m ? (m[1] ?? '') : text).trim()
}

/** The edited `zone` field, as typed; undefined when there is none or it is no text. */
function editedZone(row: GapRow): string | undefined {
  const v: unknown = row.edit?.fields?.zone
  return typeof v === 'string' && v.trim() !== '' ? linkTarget(v) : undefined
}

/** A zone spelling's map stem, or null; anything that is no string has none. */
const shortOf = (zone: unknown): ZoneShort | null => (typeof zone === 'string' ? zoneShortNameFromCatalog(zone) : null)

/**
 * The maps a row's details offer: its edited zone first, then the zones it was named in, most first;
 * one per map. `zoneName` gives a log spelling its words (the wiki's, tiers folded); as printed without it.
 */
export function gapMapZones(row: GapRow, zoneName: (raw: string) => string = (z) => z): GapMapZone[] {
  const out: GapMapZone[] = []
  const add = (label: string, short: ZoneShort | null): void => {
    if (short !== null && !out.some((z) => z.short === short)) out.push({ label, short })
  }
  const edited = editedZone(row)
  if (edited !== undefined) add(edited, shortOf(edited))
  for (const e of row.details.zones?.entries ?? []) add(zoneName(e.name), shortOf(e.name))
  return out
}

/** A grouped list's zone heading: its map, or null when the table refuses the spelling. */
export const headingMapZone = (zone: string): ZoneShort | null => shortOf(zone)
