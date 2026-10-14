// markZones.ts — where the Map pins overlay's clickable marks are, as rectangles in its window's
// CSS px. Pinned, the window is click-through; main adds these to its hover zones, so the pointer
// over a point takes the mouse and a click copies its /waypoint, while everywhere else the click
// still reaches the game (owner, 2026-10-13). Pure, so a test can hold the shapes.

import type { MapPoint } from '@shared/maps'
import { placeInExtent, type ExtentFit, type TrackedPoint, type ZoneExtent } from '../features/maps/mapTrack'
import { timerPinLabels, type TimerPin } from '../features/maps/respawnPins'
import type { CatalogPin } from '../features/maps/overlayPoints'
import type { PinLayers } from './mapPinsLayers'

export interface Zone {
  x: number
  y: number
  width: number
  height: number
}

/** Half the side of a mark's square: a little larger than the biggest dot, so a hand can find it. */
const HALF = 8
/** The timer and tracked dots' sizes, as MapPinsField.tsx draws them. */
export const TIMER_SIZE = 8
export const TRACKED_SIZE = 9
/** A label's width at `font` px: one estimate, shared with the marks (MapPinsField.tsx). */
function labelWidth(text: string, font: number): number {
  return text.length * font * 0.56 + 6
}

/** Does a mark of `size` at `px` draw its `font` px label on its left, so it ends at the pin? */
export function labelFlips(px: number, w: number, mark: { size: number; text: string; font: number }): boolean {
  return px + mark.size + labelWidth(mark.text, mark.font) > w
}

/** What a timer mark's label reads: the name and its clock. */
export function timerLabel(t: TimerPin, nowMs: number): string {
  return `${t.display} ${timerPinLabels(t, nowMs).clock}`
}

export interface MarkZoneInput {
  ext: ZoneExtent
  fit: ExtentFit
  w: number
  h: number
  layers: PinLayers
  labels: readonly MapPoint[]
  mobs: readonly CatalogPin[]
  timers: readonly TimerPin[]
  tracked: readonly TrackedPoint[]
  /** The timer labels' clock: their text, and so their width, moves with it. */
  nowMs: number
}

function dot(at: { px: number; py: number }): Zone {
  return { x: at.px - HALF, y: at.py - HALF, width: HALF * 2, height: HALF * 2 }
}

/** The dot, and its always-shown label on whichever side the mark (of `size`) draws it. */
function labelled(at: { px: number; py: number }, text: string, w: number, size: number): Zone {
  const lw = labelWidth(text, 10)
  return labelFlips(at.px, w, { size, text, font: 10 })
    ? { x: at.px - HALF - lw, y: at.py - HALF, width: lw + HALF * 2, height: HALF * 2 }
    : { x: at.px - HALF, y: at.py - HALF, width: lw + HALF * 2, height: HALF * 2 }
}

function onScreen(z: Zone, w: number, h: number): boolean {
  return z.x + z.width > 0 && z.y + z.height > 0 && z.x < w && z.y < h
}

export function markZones(i: MarkZoneInput): Zone[] {
  const place = (p: { x: number; y: number }): { px: number; py: number } => placeInExtent(i.ext, i.fit, p)
  const out: Zone[] = []
  if (i.layers.poi) {
    for (const p of i.labels) out.push(dot(place(p)))
    for (const m of i.mobs) out.push(dot(place(m)))
  }
  if (i.layers.timers) for (const t of i.timers) for (const p of t.pins) out.push(labelled(place(p), timerLabel(t, i.nowMs), i.w, TIMER_SIZE))
  if (i.layers.tracked) for (const t of i.tracked) for (const p of t.pins) out.push(labelled(place(p), t.name, i.w, TRACKED_SIZE))
  return out.filter((z) => onScreen(z, i.w, i.h)).map((z) => ({ x: Math.round(z.x), y: Math.round(z.y), width: Math.round(z.width), height: Math.round(z.height) }))
}
