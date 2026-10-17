// A live fight's duration grows every snapshot; the timeline's zoom/pan must survive that.
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { viewOnDurChange } from '../src/renderer/src/features/combat/timelineGeometry'

test('a fitted view follows the growing duration', () => {
  assert.deepEqual(viewOnDurChange({ start: 0, end: 10_000 }, 10_000, 11_000), { start: 0, end: 11_000 })
})

test('a zoomed or panned view is kept as the duration grows', () => {
  const v = { start: 2_000, end: 6_000 }
  assert.equal(viewOnDurChange(v, 10_000, 11_000), v)
})

test('a view past a shrunken duration re-fits', () => {
  assert.deepEqual(viewOnDurChange({ start: 8_000, end: 10_000 }, 10_000, 9_000), { start: 0, end: 9_000 })
})
