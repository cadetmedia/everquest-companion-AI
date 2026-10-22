// gapsOverlay.ts — what the Wiki Gaps overlay draws, and how it gets there (owner, 2026-10-20:
// "can we add a wiki gaps overlay too? Tired of alt tabbing to see what i need to take a screenshot
// of. Just have it display the top 10 of whatever list they have on whatever tab they have showing").
//
// The main window works the list out (the Gaps tab's own pipeline, features/gaps/useGapsList.ts,
// run by the tab or, with the tab closed, by a headless publisher) and writes its first ten rows to
// one localStorage key; the overlay window shares that origin's storage, reads the key and follows
// its `storage` event (the Sky quest overlay's arrangement). No IPC, and the overlay shows the rows
// the tab shows. The rows are built in gapsOverlayFeed.ts; this file is what the overlay bundle
// imports, so it carries nothing of the Gaps data model beyond the payload's shape.

export const GAPS_OVERLAY_KEY = 'eq.gapsOverlay.list'

/** How many rows the overlay lists (the owner's "top 10"). */
export const GAPS_OVERLAY_TOP = 10

/** The fewest milliseconds between two writes: a busy fight moves the list on every kill and con. */
export const GAPS_OVERLAY_MIN_GAP_MS = 1000

export interface GapsOverlayRow {
  /** the row's Done-mark key (`image:a froglok gaz warrior` spelled as the row is) */
  key: string
  name: string
  /** where it was named most (`Befallen +2`), or what to do when no zone is known */
  detail: string
}

export interface GapsOverlayPayload {
  /** false until the main window holds the Gaps list */
  loaded: boolean
  /** the domain tab's label, `Images` */
  label: string
  /** how many rows the tab lists with its filters, of which `rows` are the first */
  total: number
  rows: GapsOverlayRow[]
}

export const EMPTY_GAPS_OVERLAY: GapsOverlayPayload = { loaded: false, label: '', total: 0, rows: [] }

function str(v: unknown): string {
  return typeof v === 'string' ? v : ''
}

function readRow(v: unknown): GapsOverlayRow | null {
  if (typeof v !== 'object' || v === null) return null
  const o = v as Record<string, unknown>
  const name = str(o.name)
  return name === '' ? null : { key: str(o.key) || name, name, detail: str(o.detail) }
}

/** The stored payload, rebuilt field by field; anything unreadable is the empty payload. */
export function parseGapsOverlay(raw: string | null): GapsOverlayPayload {
  if (!raw) return EMPTY_GAPS_OVERLAY
  try {
    const o: unknown = JSON.parse(raw)
    if (typeof o !== 'object' || o === null) return EMPTY_GAPS_OVERLAY
    const p = o as Record<string, unknown>
    const rows = Array.isArray(p.rows) ? p.rows.map(readRow).filter((r) => r !== null).slice(0, GAPS_OVERLAY_TOP) : []
    const total = typeof p.total === 'number' && Number.isFinite(p.total) ? Math.max(rows.length, Math.floor(p.total)) : rows.length
    return { loaded: p.loaded === true, label: str(p.label), total, rows }
  } catch {
    return EMPTY_GAPS_OVERLAY
  }
}

/** What a publisher does with a new payload: nothing, write it now, or write it after `ms`. */
export type GapsOverlayPublishStep = { kind: 'skip' } | { kind: 'now' } | { kind: 'wait'; ms: number }

/**
 * THE THROTTLE, as a function of its clocks. A payload the store already holds is never written
 * again (a push that moved nothing in the first ten rows costs no write and no `storage` event in
 * the overlay); a changed one is written at once unless the last write was under `minGapMs` ago,
 * when it waits out the rest of the gap. The wait is measured from the LAST WRITE, not from this
 * change, so a list that changes faster than the gap is still written once per gap instead of being
 * pushed back forever. A Done mark therefore lands at once, or within a second.
 */
export function gapsOverlayPublishStep(
  raw: string,
  stored: string | null,
  timing: { now: number; lastAt: number; minGapMs?: number }
): GapsOverlayPublishStep {
  if (raw === stored) return { kind: 'skip' }
  const gap = timing.minGapMs ?? GAPS_OVERLAY_MIN_GAP_MS
  const since = timing.now - timing.lastAt
  return since >= gap ? { kind: 'now' } : { kind: 'wait', ms: gap - since }
}
