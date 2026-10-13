// mapTrack.ts — the TRACK LIST: the mobs and map labels a user picked out of a zone, and where
// each one is. Pure: no React, no DOM beyond a `getItem/setItem` pair it is HANDED, so every rule
// is node-testable (tests/mapTrack.test.mts), the locMarker.ts arrangement.
//
// THE ASK (vorpaldicepress via the owner, 2026-10-13; requirements/map-waypoints.md): pick the
// rares, NPCs, zone lines and points of interest you care about on the Maps tab, see them in
// their own colour, and have the same list on a small overlay over the game's own map.
//
// AN ENTRY CARRIES ITS OWN POSITIONS. The overlay window does not load the mob catalog or the map
// pack, and it should not have to: it draws dots. So a tracked entry is written with its name and
// its spawn points already in map coordinates, as the Maps tab knew them when you tracked it. The
// catalog is committed data, so a stored position goes stale only on a data refresh, and
// re-tracking the row rewrites it.
//
// THE ZONE'S EXTENT IS STORED BESIDE THE LIST for the same reason: the overlay's four corners are
// the map's own bounds (what the game's map window fits), and the Maps tab is what loaded them.
// It is written whenever the tab draws a zone, so every zone with a tracked entry has one.
//
// ONE KEY, `eq.maps.track`, beside `eq.maps.loc`. localStorage is shared by every window of the
// app's origin and a write fires `storage` in the others, which is how the overlay hears a change
// made on the Maps tab without a channel through main.

import type { MapBounds } from '@shared/maps'

export const TRACK_KEY = 'eq.maps.track'

/** The tracked colour, one hex for both surfaces (the overlay draws without MUI's theme). Apart from
 *  the pins' warning orange, the wish lane's green and the /loc crosshair's blue. */
export const TRACK_COLOR = '#d27cff'

/** One spawn point or label position, in MAP coordinates. `z` only when a source stated one. */
export interface TrackedPin {
  x: number
  y: number
  z?: number
}

/** A tracked mob or map label in one zone. `id` is the pane row's id, unique within the zone. */
export interface TrackedPoint {
  zone: string
  id: string
  kind: 'mob' | 'label'
  name: string
  pins: TrackedPin[]
  /** Tracked because it is watched on the Timers tab (watchTrack.ts). Derived, never stored. */
  auto?: boolean
}

/** The map's extent: the four corners the overlay draws. */
export type ZoneExtent = Pick<MapBounds, 'minX' | 'maxX' | 'minY' | 'maxY'>

export interface TrackState {
  points: TrackedPoint[]
  extents: Record<string, ZoneExtent>
}

export interface TrackStore {
  getItem(key: string): string | null
  setItem(key: string, value: string): void
}

export const EMPTY_TRACK: TrackState = { points: [], extents: {} }

function num(v: unknown): v is number {
  return typeof v === 'number' && Number.isFinite(v)
}

function readPin(v: unknown): TrackedPin | null {
  if (typeof v !== 'object' || v === null) return null
  const { x, y, z } = v as Record<string, unknown>
  if (!num(x) || !num(y)) return null
  return num(z) ? { x, y, z } : { x, y }
}

function readPoint(v: unknown): TrackedPoint | null {
  if (typeof v !== 'object' || v === null) return null
  const { zone, id, kind, name, pins } = v as Record<string, unknown>
  if (typeof zone !== 'string' || typeof id !== 'string' || typeof name !== 'string') return null
  if (kind !== 'mob' && kind !== 'label') return null
  if (!Array.isArray(pins)) return null
  const read = pins.map(readPin).filter((p): p is TrackedPin => p !== null)
  if (read.length === 0) return null
  return { zone, id, kind, name, pins: read }
}

function readExtent(v: unknown): ZoneExtent | null {
  if (typeof v !== 'object' || v === null) return null
  const { minX, maxX, minY, maxY } = v as Record<string, unknown>
  if (!num(minX) || !num(maxX) || !num(minY) || !num(maxY)) return null
  if (maxX <= minX || maxY <= minY) return null
  return { minX, maxX, minY, maxY }
}

function readExtents(v: unknown): Record<string, ZoneExtent> {
  const out: Record<string, ZoneExtent> = {}
  if (typeof v !== 'object' || v === null) return out
  for (const [zone, e] of Object.entries(v as Record<string, unknown>)) {
    const ext = readExtent(e)
    if (ext != null) out[zone] = ext
  }
  return out
}

/** Parse the stored text. Anything unreadable folds away entry by entry, never the whole list. */
export function parseTrack(raw: string | null): TrackState {
  if (raw == null || raw === '') return EMPTY_TRACK
  try {
    const parsed: unknown = JSON.parse(raw)
    if (typeof parsed !== 'object' || parsed === null) return EMPTY_TRACK
    const { points, extents } = parsed as Record<string, unknown>
    const out: TrackState = { points: [], extents: {} }
    if (Array.isArray(points)) out.points = points.map(readPoint).filter((p): p is TrackedPoint => p !== null)
    out.extents = readExtents(extents)
    return out
  } catch {
    return EMPTY_TRACK
  }
}

export function loadTrack(store: TrackStore = localStorage): TrackState {
  return parseTrack(store.getItem(TRACK_KEY))
}

export function saveTrack(state: TrackState, store: TrackStore = localStorage): TrackState {
  store.setItem(TRACK_KEY, JSON.stringify(state))
  return state
}

export function isTracked(state: TrackState, zone: string, id: string): boolean {
  return state.points.some((p) => p.zone === zone && p.id === id)
}

/** Add the entry, or remove it when it is already tracked. Order is the order tracked. */
export function toggleTracked(state: TrackState, point: TrackedPoint): TrackState {
  if (isTracked(state, point.zone, point.id))
    return { ...state, points: state.points.filter((p) => !(p.zone === point.zone && p.id === point.id)) }
  if (point.pins.length === 0) return state
  return { ...state, points: [...state.points, point] }
}

/** Forget every tracked entry in one zone, leaving the others alone. */
export function clearZone(state: TrackState, zone: string): TrackState {
  if (!state.points.some((p) => p.zone === zone)) return state
  return { ...state, points: state.points.filter((p) => p.zone !== zone) }
}

export function trackedIn(state: TrackState, zone: string | null): TrackedPoint[] {
  if (zone == null) return []
  return state.points.filter((p) => p.zone === zone)
}

/** Record a zone's extent. The same state back when nothing changed, so a caller can skip the write. */
export function withExtent(state: TrackState, zone: string, b: ZoneExtent): TrackState {
  const ext = readExtent(b)
  if (ext == null) return state
  const was = state.extents[zone]
  if (was?.minX === ext.minX && was.maxX === ext.maxX && was.minY === ext.minY && was.maxY === ext.maxY)
    return state
  return { ...state, extents: { ...state.extents, [zone]: ext } }
}

/** Where the zone lands in a w x h window: its top-left pixel, its size, and the scale. */
export interface ExtentFit {
  left: number
  top: number
  width: number
  height: number
  scale: number
}

/**
 * The zone fitted the way the game's map shows a whole zone: ONE scale, the larger that fits both
 * ways, centred (owner's screenshots, 2026-10-13: a tall zone fills the height and leaves parchment
 * either side). Sized to the map window's parchment, the overlay then matches the game's
 * whole-zone view; the old per-axis stretch put the pins off to the side.
 */
export function fitExtent(ext: ZoneExtent, w: number, h: number): ExtentFit {
  const ew = ext.maxX - ext.minX
  const eh = ext.maxY - ext.minY
  const scale = Math.min(w / ew, h / eh)
  const width = ew * scale
  const height = eh * scale
  return { left: (w - width) / 2, top: (h - height) / 2, width, height, scale }
}

/** A map position → a pixel in the overlay, through the fit. */
export function placeInExtent(ext: ZoneExtent, fit: ExtentFit, p: { x: number; y: number }): { px: number; py: number } {
  return { px: fit.left + (p.x - ext.minX) * fit.scale, py: fit.top + (p.y - ext.minY) * fit.scale }
}
