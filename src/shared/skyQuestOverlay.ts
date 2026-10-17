// skyQuestOverlay.ts — what the Sky quest overlay draws, and how it gets there (sky-quest-overlay).
//
// The main window already computes every Sky quest's progress (AppCelebrations' useProgress), so it
// writes the STARRED quests' rows to one localStorage key, and the overlay window, which shares
// that origin's storage, reads the key and follows its `storage` events (the Map pins overlay's
// `eq.maps.track` arrangement). No IPC and no second computation: the overlay shows the numbers
// the Sky tab shows. The key is the main window's data, not an overlay setting, so an overlay
// reset leaves it alone.

export const SKY_OVERLAY_KEY = 'eq.skyOverlay.rows'

export interface SkyOverlayItem {
  name: string
  have: number
  need: number
}

export interface SkyOverlayRow {
  /** the canonical `Class::Name` quest key, which the Sky tab reveals on */
  key: string
  className: string
  name: string
  reward?: string
  /** the NPC the items are handed to */
  giver?: string
  items: SkyOverlayItem[]
  /** holding every item the quest asks for (questCompletion.hasEveryItem) */
  ready: boolean
}

export interface SkyOverlayPayload {
  /** false until the main window holds the character's progress */
  loaded: boolean
  rows: SkyOverlayRow[]
}

export const EMPTY_SKY_OVERLAY: SkyOverlayPayload = { loaded: false, rows: [] }

/** Ready rows first, then by class and quest name, so a row moves only when it becomes ready. */
export function orderSkyOverlayRows(rows: readonly SkyOverlayRow[]): SkyOverlayRow[] {
  return [...rows].sort(
    (a, b) =>
      Number(b.ready) - Number(a.ready) ||
      a.className.localeCompare(b.className) ||
      a.name.localeCompare(b.name)
  )
}

function str(v: unknown): string | undefined {
  return typeof v === 'string' && v.length > 0 ? v : undefined
}

function count(v: unknown): number {
  return typeof v === 'number' && Number.isFinite(v) && v >= 0 ? Math.floor(v) : 0
}

function readItem(v: unknown): SkyOverlayItem | null {
  if (typeof v !== 'object' || v === null) return null
  const o = v as Record<string, unknown>
  const name = str(o.name)
  return name ? { name, have: count(o.have), need: Math.max(1, count(o.need)) } : null
}

function readRow(v: unknown): SkyOverlayRow | null {
  if (typeof v !== 'object' || v === null) return null
  const o = v as Record<string, unknown>
  const key = str(o.key)
  const className = str(o.className)
  const name = str(o.name)
  if (!key || !className || !name) return null
  const items = Array.isArray(o.items) ? o.items.map(readItem).filter((i) => i !== null) : []
  return { key, className, name, reward: str(o.reward), giver: str(o.giver), items, ready: o.ready === true }
}

/** The stored payload, rebuilt field by field; anything unreadable is the empty payload. */
export function parseSkyOverlay(raw: string | null): SkyOverlayPayload {
  if (!raw) return EMPTY_SKY_OVERLAY
  try {
    const o: unknown = JSON.parse(raw)
    if (typeof o !== 'object' || o === null) return EMPTY_SKY_OVERLAY
    const p = o as Record<string, unknown>
    const rows = Array.isArray(p.rows) ? p.rows.map(readRow).filter((r) => r !== null) : []
    return { loaded: p.loaded === true, rows }
  } catch {
    return EMPTY_SKY_OVERLAY
  }
}
