// slayerOverlay.ts — the Achievements (Slayer) areas the Map pins overlay draws, and how they get
// there (owner, 2026-10-14: "An Achievements chip on the Map pins overlay").
//
// The areas are worked out in the MAIN window (features/slayer/SlayerOverlayPublisher.tsx) for the
// zone the log last named, and written here, to the storage the overlay window shares with it: the
// overlay must not import the mob catalog that reading needs (BRANCH_NOTES, the overlay bundle
// trap). The key is the main window's data, not an overlay setting, so an overlay reset leaves it.

export const SLAYER_OVERLAY_KEY = 'eq.slayer.overlayAreas'

/** One area, in map units, with the text the Maps tab writes on it. */
export interface SlayerOverlayArea {
  x: number
  y: number
  r: number
  text: string
}

export interface SlayerOverlayPayload {
  /** the zone the areas belong to (a ZoneShort), or null before the log names one */
  zone: string | null
  /** how many open counters are picked; none means the overlay offers no chip */
  picks: number
  areas: SlayerOverlayArea[]
}

/** What an area's label reads: what it serves, then how many spawn points it holds. The Maps tab
 *  and the overlay write the same words. */
export function areaText(label: string, spawns: number): string {
  return `${label} - ${String(spawns)} ${spawns === 1 ? 'spawn' : 'spawns'}`
}

function isArea(v: unknown): v is SlayerOverlayArea {
  if (v == null || typeof v !== 'object') return false
  const a = v as Record<string, unknown>
  return typeof a.x === 'number' && typeof a.y === 'number' && typeof a.r === 'number' && typeof a.text === 'string'
}

/** The stored payload, or null when there is none or it does not read. */
export function parseSlayerOverlay(raw: string | null): SlayerOverlayPayload | null {
  if (raw == null) return null
  try {
    const v = JSON.parse(raw) as Record<string, unknown>
    if (typeof v.picks !== 'number' || !Array.isArray(v.areas)) return null
    return { zone: typeof v.zone === 'string' ? v.zone : null, picks: v.picks, areas: v.areas.filter(isArea) }
  } catch {
    return null
  }
}

/** The areas to draw on `zone`: none when the payload was written for another zone. */
export function slayerOverlayAreasFor(payload: SlayerOverlayPayload | null, zone: string | null): SlayerOverlayArea[] {
  return payload != null && zone != null && payload.zone === zone ? payload.areas : []
}
