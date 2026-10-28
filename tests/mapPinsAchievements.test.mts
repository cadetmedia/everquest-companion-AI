// The Map pins overlay's Achievements chip (map-waypoints, owner 2026-10-14): the picked Slayer
// counters' areas, worked out in the main window as the Maps tab works them out, handed to the
// overlay through shared storage, and drawn there with the Maps tab's words.

import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import {
  SLAYER_OVERLAY_KEY,
  areaText,
  parseSlayerOverlay,
  slayerOverlayAreasFor,
  type SlayerOverlayPayload
} from '../src/shared/slayerOverlay'
import { OVERLAY_LOCAL_KEY_PREFIXES } from '../src/shared/overlayReset'
import { areaLabel, toOverlayAreas, type SlayerArea } from '../src/renderer/src/features/slayer/slayerAreas'

const src = (rel: string): string => readFileSync(new URL(`../src/renderer/src/${rel}`, import.meta.url), 'utf8')

const area = (targets: string[], spawns: number): SlayerArea => ({ x: -150, y: -200, r: 120, spawns, targets, mobs: [] })
const NAMES = new Map([
  ['bats', 'Bat Country!'],
  ['crows', "You're Not Scaring Anyone"],
  ['alive', "It's Alive!"]
])

test('an area names two achievements and counts the rest, then its spawn points', () => {
  assert.equal(areaLabel(area(['bats'], 1), NAMES), 'Bat Country!')
  assert.equal(areaLabel(area(['bats', 'crows', 'alive'], 3), NAMES), "Bat Country!, You're Not Scaring Anyone +1")
  assert.equal(areaText('Bat Country!', 1), 'Bat Country! - 1 spawn')
  assert.equal(areaText('Bat Country!', 4), 'Bat Country! - 4 spawns')
})

test('the overlay gets each area in map units with the words the Maps tab writes on it', () => {
  const [a] = toOverlayAreas([area(['bats', 'crows'], 3)], NAMES)
  assert.deepEqual(a, { x: -150, y: -200, r: 120, text: "Bat Country!, You're Not Scaring Anyone - 3 spawns" })
})

test('the stored payload reads back, and junk reads as nothing', () => {
  const payload: SlayerOverlayPayload = { zone: 'qey2hh1', picks: 2, areas: toOverlayAreas([area(['bats'], 2)], NAMES) }
  assert.deepEqual(parseSlayerOverlay(JSON.stringify(payload)), payload)
  assert.equal(parseSlayerOverlay(null), null)
  assert.equal(parseSlayerOverlay('{not json'), null)
  assert.equal(parseSlayerOverlay('{"zone":"qey2hh1"}'), null)
  const mixed = parseSlayerOverlay('{"zone":null,"picks":1,"areas":[{"x":1,"y":2,"r":3,"text":"t"},{"x":"no"}]}')
  assert.deepEqual(mixed, { zone: null, picks: 1, areas: [{ x: 1, y: 2, r: 3, text: 't' }] })
})

test('areas are drawn only on the zone they were worked out for', () => {
  const payload: SlayerOverlayPayload = { zone: 'qey2hh1', picks: 1, areas: [{ x: 0, y: 0, r: 90, text: 't' }] }
  assert.equal(slayerOverlayAreasFor(payload, 'qey2hh1').length, 1)
  assert.deepEqual(slayerOverlayAreasFor(payload, 'befallen'), [], 'zoned since: the old zone\'s areas are not drawn')
  assert.deepEqual(slayerOverlayAreasFor(payload, null), [])
  assert.deepEqual(slayerOverlayAreasFor(null, 'qey2hh1'), [])
})

test('the chip is remembered with the other layer chips, which the Overlay menu reset clears', () => {
  const layers = src('overlay/mapPinsLayers.tsx')
  assert.match(layers, /const KEY = 'eq\.maps\.overlayLayers'/)
  assert.match(layers, /achievements: v\.achievements !== false/, 'on until switched off, like the others')
  assert.ok((OVERLAY_LOCAL_KEY_PREFIXES.mapPins ?? []).some((p) => 'eq.maps.overlayLayers'.startsWith(p)))
  // The areas themselves are the main window's data, rewritten only on change: a reset must keep them.
  assert.ok(!(OVERLAY_LOCAL_KEY_PREFIXES.mapPins ?? []).some((p) => SLAYER_OVERLAY_KEY.startsWith(p)))
})

test('the chip and the feed are behind the UNRELEASED gate the Maps tab layer is behind', () => {
  const gate = src('unreleasedSlayerMap.tsx')
  assert.match(gate, /const LazyOverlayPublisher = UNRELEASED \? lazy\(\(\) => import\('\.\/features\/slayer\/SlayerOverlayPublisher'\)\) : null/)
  assert.match(gate, /useOverlayOpen\('mapPins'\)/, 'fed only while the overlay is open')
  assert.match(src('overlay/MapPinsOverlay.tsx'), /const slayerChip = UNRELEASED && \(slayer\?\.picks \?\? 0\) > 0/)
  assert.match(src('overlay/MapPinsField.tsx'), /\{UNRELEASED && layers\.achievements && <AreaMarks/)
  // The overlay never imports the catalog-reading slayer code (the conCard bundle trap).
  for (const f of ['overlay/MapPinsOverlay.tsx', 'overlay/MapPinsField.tsx', 'overlay/useMapPinsData.ts', 'overlay/mapPinsLayers.tsx']) {
    assert.doesNotMatch(src(f), /features\/slayer\//, f)
  }
})
