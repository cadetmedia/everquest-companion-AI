// shared/gapForage.ts — a foraged item's page that does not say so (owner, 2026-10-21: "if we can
// prove it was foraged lets make sure the item copy wiki code gets that information";
// plans/2026-10-20-gaps-item-page-facts.md, phase 2). The engine serves each KNOWN item the player
// foraged as a `forage` row with its forage zones (gaps_craft.rs); main answers what the item's own
// page states (`|foraged`, `[[Category:Foraged]]`, items.json through gaps:itemForage). An item
// whose page lacks a zone the log foraged it in, or the category, becomes an Items row whose copy
// is exactly the lines to add. Zones are spelled as the new-page copy spells them
// (gapWikiZone.ts), so the two never disagree.

import type { GapRow, GapsSnap } from './gaps'
import { catalogZoneCounts, wikiZoneLink, wikiZoneNamer } from './gapWikiZone'
import { perObject } from './gapMemo'
import { itemBaseName } from './itemStats'
import { zoneEntryFor, zoneKey } from './zones'

/** The engine's domain for a known item's forage proof; never shown as a domain of its own. */
export const FORAGE_PROOF = 'forage'

/** What an item's page states of foraging; null when the corpus has no page for it. */
export interface ItemPageForage {
  page: string
  /** the zones `|foraged` links, as the page shows them */
  zones: string[]
  /** `|foraged` lines naming no zone (`Various`, `?`) */
  note?: string
  /** the page files itself under `[[Category:Foraged]]` */
  category: boolean
}

/** Item key → its page's forage statement; absent until main has answered. */
export type ItemForage = ReadonlyMap<string, ItemPageForage | null>

/** What an Items row for an existing page asks to add (GapRow.forageUpdate). */
export interface ForageUpdate {
  /** the item's page title */
  page: string
  /** forage zones the page does not list, as the wiki spells them */
  zones: string[]
  /** the page lists no zone and no prose: the field itself may be absent */
  noField: boolean
  /** the page is not in `[[Category:Foraged]]` */
  category: boolean
}

export const forageKey = (name: string): string => itemBaseName(name).toLowerCase()

/** A page that forages "in most zones" or `Various` covers every zone (the plan's census rule). */
const ANY_ZONE = /\bvarious\b|\b(most|all|any) zones?\b/i

/**
 * COMMON FORAGE (owner, 2026-10-21: "the water, veggies, pork meat thing, berries, fruit, fishing
 * grubs are standard, those get dropped in any zone pretty much"): an item the log saw foraged in
 * `seenPlaces` or more places (tiers folded), or whose page already lists `pageZones` or more forage
 * zones, forages almost anywhere, so a zone its page lacks is no update; a missing
 * `[[Category:Foraged]]` still is. A named default the owner has not ruled on yet.
 */
export const COMMON_FORAGE = { seenPlaces: 5, pageZones: 10 } as const

/**
 * One key per place, whatever its spelling: the zone table's entry when it knows the name (item
 * pages write `Northern Karana` where the catalog writes `Northern Plains of Karana`), else the
 * name with tiers and a leading "the" folded.
 */
const placeKey = (zone: string): string => zoneKey(zoneEntryFor(zone)?.name ?? zone)

/** Is this item common forage by COMMON_FORAGE: seen in many places, or a page that lists many? */
export function isCommonForage(seenZones: readonly string[], page: ItemPageForage): boolean {
  return new Set(seenZones.map(placeKey)).size >= COMMON_FORAGE.seenPlaces || new Set(page.zones.map(placeKey)).size >= COMMON_FORAGE.pageZones
}

/** No zone line is owed: the page says it forages anywhere, or the item is common forage. */
const noZoneOwed = (page: ItemPageForage, seenZones: readonly string[]): boolean => (page.note !== undefined && ANY_ZONE.test(page.note)) || isCommonForage(seenZones, page)

const isProof = (r: GapRow): boolean => (r.domain as string) === FORAGE_PROOF

/** The names main should be asked about: every forage proof row's item. */
export function forageProofNames(snap: GapsSnap): string[] {
  return snap.rows.filter(isProof).map((r) => r.name)
}

/** The log's zone → the wiki's spelling, one resolver per catalog (the one PAGE_EXTRAS builds). */
const namerFor = perObject((catalog: readonly { zones?: readonly string[] }[]) => wikiZoneNamer(catalogZoneCounts(catalog)))

/** What the page lacks for this proof row, or null when it says it all (or main has not answered). */
export function forageUpdateOf(row: GapRow, page: ItemPageForage | null | undefined, zoneName: (raw: string) => string): ForageUpdate | null {
  if (page === undefined || page === null) return null
  // The page's zone as written and as the catalog spells it (`Permafrost Keep` is the catalog's `Permafrost`).
  const listed = new Set(page.zones.flatMap((z) => [placeKey(z), placeKey(zoneName(z))]))
  const raw = row.details.forageZones?.all ?? row.details.forageZones?.entries.map((e) => e.name) ?? []
  const wiki = [...new Set(raw.map(zoneName).filter((z) => z !== ''))].sort((a, b) => a.localeCompare(b))
  const zones = noZoneOwed(page, wiki) ? [] : wiki.filter((z) => !listed.has(placeKey(z)))
  if (zones.length === 0 && page.category) return null
  return { page: page.page, zones, noField: page.zones.length === 0 && page.note === undefined, category: !page.category }
}

/**
 * The snapshot with the forage proof rows taken out and, for each page that lacks a zone or the
 * category, an Items row in their place, counted in the Items total.
 */
export function withForageRows<S extends GapsSnap>(snap: S, itemForage: ItemForage | undefined, catalog: readonly { zones?: readonly string[] }[]): S {
  if (!snap.rows.some(isProof)) return snap
  const zoneName = namerFor(catalog)
  const updates: GapRow[] = []
  for (const r of snap.rows.filter(isProof)) {
    const forageUpdate = forageUpdateOf(r, itemForage?.get(forageKey(r.name)), zoneName)
    if (forageUpdate !== null) updates.push({ ...r, domain: 'item', forageUpdate })
  }
  // An archive merge counts the proof rows as a domain of their own; that count is no gap.
  const totals = withoutProof(snap.totals)
  return {
    ...snap,
    rows: [...snap.rows.filter((r) => !isProof(r)), ...updates],
    totals: { ...totals, item: (totals.item ?? 0) + updates.length },
    seen: withoutProof(snap.seen)
  }
}

function withoutProof<T extends Record<string, number>>(counts: T): T {
  return Object.fromEntries(Object.entries(counts).filter(([k]) => k !== FORAGE_PROOF)) as T
}

/** The chip's words: what the page lacks. */
export function forageWhy(item: string, u: ForageUpdate): string {
  const zones = u.zones.length > 0 ? `does not list ${u.zones.join(', ')} under foraged` : ''
  const cat = u.category ? 'is not in Category:Foraged' : ''
  return `The page for ${item} ${[zones, cat].filter((s) => s !== '').join(' and ')}; your log shows it foraged${u.zones.length > 0 ? ' there' : ''}.`
}

/**
 * Exactly the lines to add: each missing zone's bullet (under `|foraged =`, written out when the
 * page lists nothing there), then the categories after `</onlyinclude>`: Foraged when missing, and
 * each new zone's (a category line the page already has can be left out).
 */
export function forageAddText(u: ForageUpdate): string {
  const bullets = u.zones.map((z) => `* ${wikiZoneLink(z)}`)
  const field = bullets.length === 0 ? '' : `${u.noField ? '|foraged = \n\n' : ''}${bullets.join('\n')}\n`
  const cats = [...(u.category ? ['Foraged'] : []), ...u.zones].map((c) => `[[Category:${c}]]`)
  return [field, `${cats.join('\n')}\n`].filter((s) => s.trim() !== '').join('\n')
}
