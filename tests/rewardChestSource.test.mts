// shared/rewardChest.ts: a Dungeon Crawl's Reward Chest is no mob (owner, 2026-10-21), so a loot
// line from it names no mob. Byte-identical on every branch that carries the predicate.
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { isRewardChest, mobSourceOf } from '../src/shared/rewardChest'

test('the chest is told apart from a mob, whatever its case or spacing', () => {
  assert.deepEqual(['Reward Chest', ' reward chest ', 'a reward chest guardian', undefined].map(isRewardChest), [true, true, false, false])
})

test('a loot line from the chest names no mob; one from a corpse names its mob', () => {
  const lines = [{ source: 'Reward Chest' }, { source: 'a skeleton' }, {}]
  assert.deepEqual(lines.map(mobSourceOf), [undefined, 'a skeleton', undefined])
})
