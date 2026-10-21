// The Wiki Gaps overlay (owner, 2026-10-20: "Just have it display the top 10 of whatever list they
// have on whatever tab they have showing. for me it would show the images tab"): what the main
// window writes (shared/gapsOverlayFeed.ts), what the overlay reads back (shared/gapsOverlay.ts),
// how often it may write, and the two Gaps tab choices now remembered so the writer knows them
// with the tab closed (shared/gapsViewPrefs.ts).

import { test } from 'node:test'
import assert from 'node:assert/strict'
import { DEFAULT_GAP_SORT, sortGaps, withoutDone, type GapRow } from '../src/shared/gaps'
import {
  EMPTY_GAPS_OVERLAY,
  GAPS_OVERLAY_MIN_GAP_MS,
  GAPS_OVERLAY_TOP,
  gapsOverlayPublishStep,
  parseGapsOverlay
} from '../src/shared/gapsOverlay'
import { gapsOverlayDetail, gapsOverlayPayload } from '../src/shared/gapsOverlayFeed'
import { gapDomainOf, gapSortOf, gapSortText } from '../src/shared/gapsViewPrefs'

function row(name: string, over: Partial<GapRow> = {}): GapRow {
  return { domain: 'image', name, kinds: ['considered'], count: 1, first: '2026-10-20 10:00:00', last: '2026-10-20 10:00:00', details: { samples: [] }, ...over }
}

const zoned = (name: string, zone: string, count = 1): GapRow =>
  row(name, { count, details: { samples: [], zones: { entries: [{ name: zone, n: 1 }], distinct: 1 } } })

// ---- the payload ----

test('the payload is the first ten rows in the order given, with the domain label and the full count', () => {
  const rows = Array.from({ length: 14 }, (_, i) => zoned(`a mob ${String(i)}`, 'Befallen'))
  const p = gapsOverlayPayload({ loaded: true, domain: 'image', rows })
  assert.equal(p.label, 'Images')
  assert.equal(p.total, 14, '"10 of 14"')
  assert.equal(p.rows.length, GAPS_OVERLAY_TOP)
  assert.deepEqual(
    p.rows.map((r) => r.name),
    rows.slice(0, 10).map((r) => r.name)
  )
  assert.deepEqual(p.rows[0], { key: 'image:a mob 0', name: 'a mob 0', detail: 'Befallen' })
})

test('fewer than ten rows are all listed; none is "Nothing to do here", not "not loaded"', () => {
  const two = gapsOverlayPayload({ loaded: true, domain: 'item', rows: [zoned('Moccasin Eggs', 'Misty'), zoned('Bone Chips', 'Befallen')] })
  assert.equal(two.total, 2)
  assert.equal(two.rows.length, 2)
  assert.equal(two.label, 'Items')
  const none = gapsOverlayPayload({ loaded: true, domain: 'image', rows: [] })
  assert.deepEqual(none, { loaded: true, label: 'Images', total: 0, rows: [] })
})

test('before the Gaps list lands the payload says so and lists nothing', () => {
  const p = gapsOverlayPayload({ loaded: false, domain: 'image', rows: [zoned('a mob', 'Befallen')] })
  assert.equal(p.loaded, false)
  assert.equal(p.total, 0)
  assert.deepEqual(p.rows, [])
})

test('the payload follows the order and the Done marks the tab applies', () => {
  const rows = [zoned('a rat', 'Qeynos', 1), zoned('a bat', 'Befallen', 9), zoned('a snake', 'Misty', 5)]
  const ordered = sortGaps(rows, DEFAULT_GAP_SORT)
  const p = gapsOverlayPayload({ loaded: true, domain: 'image', rows: ordered })
  assert.deepEqual(
    p.rows.map((r) => r.name),
    ['a bat', 'a snake', 'a rat'],
    'most mentioned first'
  )
  // A Done mark drops its row from the tab's list, and so from the next payload.
  const after = gapsOverlayPayload({ loaded: true, domain: 'image', rows: withoutDone(ordered, new Set(['image:a bat'])) })
  assert.deepEqual(
    after.rows.map((r) => r.name),
    ['a snake', 'a rat']
  )
  assert.equal(after.total, 2)
})

test("a row's detail is where it was named most, else the words of its To-do chips", () => {
  assert.equal(gapsOverlayDetail(row('a bat', { details: { samples: [], zones: { entries: [{ name: 'Befallen', n: 3 }, { name: 'Misty', n: 1 }], distinct: 2 } } })), 'Befallen +1')
  assert.equal(gapsOverlayDetail(row('a bat')), 'Upload image')
  assert.equal(gapsOverlayDetail(row('Moccasin Eggs', { domain: 'item' }), { 'Moccasin Eggs': 'noPage' }), 'Add to wiki')
  assert.equal(gapsOverlayDetail(row('Moccasin Eggs', { domain: 'item' })), 'Check wiki', 'unchecked until the caches answer')
})

// ---- reading it back ----

test('the overlay reads back exactly what was written', () => {
  const p = gapsOverlayPayload({ loaded: true, domain: 'image', rows: [zoned('a bat', 'Befallen'), zoned('a rat', 'Qeynos')] })
  assert.deepEqual(parseGapsOverlay(JSON.stringify(p)), p)
})

test('anything unreadable is the empty payload, and a stored row is rebuilt field by field', () => {
  assert.deepEqual(parseGapsOverlay(null), EMPTY_GAPS_OVERLAY)
  assert.deepEqual(parseGapsOverlay('not json'), EMPTY_GAPS_OVERLAY)
  assert.deepEqual(parseGapsOverlay('[1,2]'), { loaded: false, label: '', total: 0, rows: [] })
  const odd = JSON.stringify({ loaded: true, label: 'Images', total: 'many', rows: [{ name: 'a bat', detail: 4, extra: 'x' }, { key: 'k' }, null] })
  assert.deepEqual(parseGapsOverlay(odd), { loaded: true, label: 'Images', total: 1, rows: [{ key: 'a bat', name: 'a bat', detail: '' }] })
  // A hand-edited store cannot make the window list more than the top ten.
  const many = JSON.stringify({ loaded: true, label: 'Items', total: 50, rows: Array.from({ length: 30 }, (_, i) => ({ key: String(i), name: `n${String(i)}`, detail: '' })) })
  const back = parseGapsOverlay(many)
  assert.equal(back.rows.length, GAPS_OVERLAY_TOP)
  assert.equal(back.total, 50)
})

// ---- the throttle ----

test('a payload the store already holds is never written again', () => {
  assert.deepEqual(gapsOverlayPublishStep('{"a":1}', '{"a":1}', { now: 10_000, lastAt: 0 }), { kind: 'skip' })
  assert.deepEqual(gapsOverlayPublishStep('{"a":1}', '{"a":1}', { now: 10_000, lastAt: 9_999 }), { kind: 'skip' })
})

test('a changed payload is written at once when the last write was a second or more ago', () => {
  assert.deepEqual(gapsOverlayPublishStep('new', 'old', { now: 5_000, lastAt: 4_000 }), { kind: 'now' })
  assert.deepEqual(gapsOverlayPublishStep('new', null, { now: 5_000, lastAt: Number.NEGATIVE_INFINITY }), { kind: 'now' }, 'the first write')
})

test('a change inside the gap waits out the rest of it, measured from the last write', () => {
  assert.deepEqual(gapsOverlayPublishStep('new', 'old', { now: 4_300, lastAt: 4_000 }), { kind: 'wait', ms: GAPS_OVERLAY_MIN_GAP_MS - 300 })
  // A list changing every 200 ms is still written once per second: each newer change waits for the
  // same moment instead of pushing it back.
  const due = [4_200, 4_400, 4_600, 4_800].map((now) => {
    const step = gapsOverlayPublishStep(`v${String(now)}`, 'old', { now, lastAt: 4_000 })
    return step.kind === 'wait' ? now + step.ms : now
  })
  assert.deepEqual(due, [5_000, 5_000, 5_000, 5_000])
})

// ---- the tab's remembered choices ----

test('the domain tab reads back, and anything else is Items', () => {
  assert.equal(gapDomainOf('image'), 'image')
  assert.equal(gapDomainOf('drop'), 'drop')
  assert.equal(gapDomainOf(null), 'item')
  assert.equal(gapDomainOf('pictures'), 'item')
})

test('the sort order round-trips, and anything unreadable is the engine order', () => {
  for (const sort of [{ key: 'zone', dir: 'asc' }, { key: 'todo', dir: 'desc' }, DEFAULT_GAP_SORT] as const) {
    assert.deepEqual(gapSortOf(gapSortText(sort)), sort)
  }
  assert.deepEqual(gapSortOf(null), DEFAULT_GAP_SORT)
  assert.deepEqual(gapSortOf('zone sideways'), DEFAULT_GAP_SORT)
  assert.deepEqual(gapSortOf('colour asc'), DEFAULT_GAP_SORT)
})
