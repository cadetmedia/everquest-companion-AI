// factionLadder.test.mts — the /con ladder as an equal-width strip (factionTiers.ts).

import { test } from 'node:test'
import assert from 'node:assert/strict'
import {
  TIER_BANDS,
  factionTier,
  ladderPosition,
  nextTier
} from '../src/renderer/src/features/factions/factionTiers'

test('the bands run hostile to friendly, edge to edge, over the whole scale', () => {
  assert.equal(TIER_BANDS[0].faction, 'scowls')
  assert.equal(TIER_BANDS[0].floor, -2000)
  assert.equal(TIER_BANDS[TIER_BANDS.length - 1].faction, 'ally')
  assert.equal(TIER_BANDS[TIER_BANDS.length - 1].ceiling, 2000)
  for (let i = 1; i < TIER_BANDS.length; i++) {
    assert.equal(TIER_BANDS[i].floor, TIER_BANDS[i - 1].ceiling + 1)
  }
  for (const b of TIER_BANDS) assert.equal(factionTier(b.floor), b.faction)
})

test('a standing sits inside its own band, each band the same width', () => {
  const w = 1 / TIER_BANDS.length
  TIER_BANDS.forEach((b, i) => {
    const p = ladderPosition(b.floor)
    assert.ok(Math.abs(p - i * w) < 1e-9, `${b.faction} starts its band`)
    assert.ok(ladderPosition(b.ceiling) < (i + 1) * w)
  })
  assert.equal(ladderPosition(-5000), 0)
  assert.ok(ladderPosition(5000) <= 1)
})

test('the next rung up, and none at ally', () => {
  assert.deepEqual(nextTier(268)?.faction, 'kindly')
  assert.equal(nextTier(268)?.floor, 500)
  assert.equal(nextTier(-1)?.faction, 'indifferent')
  assert.equal(nextTier(1500), null)
})
