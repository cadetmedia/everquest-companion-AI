// The /waypoint copy and the map track list (map-waypoints): the command text, the list's rules,
// and where the overlay places a pin.

import { test } from 'node:test'
import assert from 'node:assert/strict'
import { waypointCommand } from '../src/renderer/src/features/maps/waypoint'
import {
  EMPTY_TRACK,
  TRACK_KEY,
  clearZone,
  isTracked,
  loadTrack,
  parseTrack,
  placeInExtent,
  saveTrack,
  toggleTracked,
  trackedIn,
  withExtent,
  type TrackStore,
  type TrackedPoint
} from '../src/renderer/src/features/maps/mapTrack'

function memStore(): TrackStore & { data: Map<string, string> } {
  const data = new Map<string, string>()
  return { data, getItem: (k) => data.get(k) ?? null, setItem: (k, v) => void data.set(k, v) }
}

const TRANSAN: TrackedPoint = { zone: 'oasis', id: 'Transan', kind: 'mob', name: 'Transan', pins: [{ x: -51, y: -613 }] }

test('a waypoint reads in /loc order: the wiki states Transan at /loc (613, 51), map (-51, -613)', () => {
  // The landmark tests/mapLocMarker.test.mts pins: the wiki's /loc and Brewall's map label agree.
  assert.equal(waypointCommand({ x: -51, y: -613 }), '/waypoint 613, 51')
})

test('a waypoint rounds to whole numbers and writes elevation only when it is known', () => {
  assert.equal(waypointCommand({ x: 10.6, y: -20.4 }), '/waypoint 20, -11')
  assert.equal(waypointCommand({ x: 10, y: 20, z: 3.7 }), '/waypoint -20, -10, 4')
  assert.equal(waypointCommand({ x: 0.2, y: -0.3 }), '/waypoint 0, 0')
})

test('track toggles on and off, per zone', () => {
  const on = toggleTracked(EMPTY_TRACK, TRANSAN)
  assert.ok(isTracked(on, 'oasis', 'Transan'))
  assert.ok(!isTracked(on, 'befallen', 'Transan'))
  assert.deepEqual(trackedIn(on, 'oasis'), [TRANSAN])
  assert.deepEqual(trackedIn(on, null), [])
  const off = toggleTracked(on, TRANSAN)
  assert.equal(off.points.length, 0)
})

test('a row with no position is never tracked', () => {
  const none = toggleTracked(EMPTY_TRACK, { ...TRANSAN, pins: [] })
  assert.equal(none, EMPTY_TRACK)
})

test('clearing a zone leaves the others', () => {
  const two = toggleTracked(toggleTracked(EMPTY_TRACK, TRANSAN), { ...TRANSAN, zone: 'befallen' })
  const left = clearZone(two, 'oasis')
  assert.deepEqual(left.points.map((p) => p.zone), ['befallen'])
  assert.equal(clearZone(left, 'oasis'), left)
})

test('an unchanged extent is the same state, so nothing is written', () => {
  const ext = { minX: -100, maxX: 100, minY: -50, maxY: 50 }
  const once = withExtent(EMPTY_TRACK, 'oasis', ext)
  assert.notEqual(once, EMPTY_TRACK)
  assert.equal(withExtent(once, 'oasis', { ...ext }), once)
  // A degenerate extent places nothing.
  assert.equal(withExtent(EMPTY_TRACK, 'oasis', { minX: 0, maxX: 0, minY: 0, maxY: 1 }), EMPTY_TRACK)
})

test('the list survives a round trip and drops bad entries one by one', () => {
  const store = memStore()
  saveTrack(withExtent(toggleTracked(EMPTY_TRACK, TRANSAN), 'oasis', { minX: 0, maxX: 10, minY: 0, maxY: 10 }), store)
  assert.deepEqual(loadTrack(store).points, [TRANSAN])
  store.setItem(
    TRACK_KEY,
    JSON.stringify({ points: [TRANSAN, { zone: 'x', id: 'y', kind: 'npc', name: 'z', pins: [] }, null], extents: { a: { minX: 'no' } } })
  )
  const read = loadTrack(store)
  assert.deepEqual(read.points, [TRANSAN])
  assert.deepEqual(read.extents, {})
  assert.deepEqual(parseTrack('not json'), EMPTY_TRACK)
  assert.deepEqual(parseTrack(null), EMPTY_TRACK)
})

test('the overlay stretches each axis on its own, corners to corners', () => {
  const ext = { minX: -200, maxX: 200, minY: -100, maxY: 300 }
  assert.deepEqual(placeInExtent(ext, 400, 200, { x: -200, y: -100 }), { px: 0, py: 0 })
  assert.deepEqual(placeInExtent(ext, 400, 200, { x: 200, y: 300 }), { px: 400, py: 200 })
  assert.deepEqual(placeInExtent(ext, 400, 200, { x: 0, y: 100 }), { px: 200, py: 100 })
})
