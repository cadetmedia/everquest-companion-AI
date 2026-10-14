// The Map pins overlay's clickable marks while pinned (map-waypoints): one small rectangle per
// visible point, a labelled one wide enough for its label, nothing for a layer that is off.

import { test } from 'node:test'
import assert from 'node:assert/strict'
import { markZones, timerLabel, type MarkZoneInput } from '../src/renderer/src/overlay/markZones'
import type { TimerPin } from '../src/renderer/src/features/maps/respawnPins'
import { fitExtent } from '../src/renderer/src/features/maps/mapTrack'

const ext = { minX: 0, maxX: 100, minY: 0, maxY: 100 }
const base: MarkZoneInput = {
  ext,
  fit: fitExtent(ext, 200, 200),
  w: 200,
  h: 200,
  layers: { lines: true, poi: true, timers: true, tracked: true },
  labels: [],
  mobs: [{ key: 'a#0', name: 'A', x: 50, y: 50 }],
  timers: [],
  tracked: [{ zone: 'z', id: 'T', kind: 'mob', name: 'Tracked One', pins: [{ x: 10, y: 10 }] }],
  nowMs: 0
}

test('a point is a 16 px square on its dot; a tracked mark also covers its label', () => {
  const z = markZones(base)
  assert.deepEqual(z[0], { x: 92, y: 92, width: 16, height: 16 })
  assert.equal(z[1].x, 12)
  assert.ok(z[1].width > 16, 'the label is clickable too')
})

test('a layer switched off takes no clicks', () => {
  const z = markZones({ ...base, layers: { ...base.layers, poi: false } })
  assert.equal(z.length, 1)
})

test('a label near the right edge is covered on the left, where it is drawn', () => {
  const z = markZones({ ...base, mobs: [], tracked: [{ ...base.tracked[0], pins: [{ x: 98, y: 10 }] }] })
  assert.ok(z[0].x + z[0].width <= 196 + 8, 'ends at the dot, not past the window')
})

test('a mark scrolled out of the window claims nothing', () => {
  const z = markZones({ ...base, tracked: [], mobs: [{ key: 'b#0', name: 'B', x: 500, y: 500 }] })
  assert.equal(z.length, 0)
})

test('a timer label is covered as drawn: name and clock, flipped by that whole width', () => {
  const row = { id: 'r', key: 'mob', display: 'Mob', zone: 'z', baseTs: 0, basis: 'death', estimateMs: 3_600_000, source: 'observed', samples: 1 } as unknown as TimerPin['row']
  const timer: TimerPin = { id: 'r', display: 'Mob', row, pins: [{ x: 80, y: 10 }] as TimerPin['pins'] }
  const text = timerLabel(timer, 0)
  assert.ok(text.length > 'Mob'.length + 1, 'the clock is part of the label')
  const [z] = markZones({ ...base, mobs: [], tracked: [], timers: [timer] })
  // At px 160 the name alone fits on the right; with its clock it does not, so the mark flips.
  assert.equal(z.x + z.width, 168, 'flipped: the zone ends at the dot')
  assert.equal(z.width, Math.round(text.length * 5.6 + 6 + 16))
})
