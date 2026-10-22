// shared/droppedBy.ts: the Loot drill-down's Dropped by. A Reward Chest payout is no mob's drop
// (owner, 2026-10-21), so it is neither a mob nor `unknown`; a line naming no source stays `unknown`.
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { rewardChestNote, tallyDroppedBy } from '../src/shared/droppedBy'

const chest = { source: 'Reward Chest' }

test('an item only ever paid by the chest lists no mob', () => {
  const t = tallyDroppedBy([chest, chest, { source: 'reward chest' }])
  assert.deepEqual(t, { sources: [], chest: 3 })
  assert.equal(rewardChestNote(t.chest), '3 from a Reward Chest (no mob)')
})

test('mob drops tally most-seen first beside chest payouts, a sourceless line under unknown', () => {
  const t = tallyDroppedBy([chest, { source: 'a skeleton' }, {}, { source: 'a skeleton' }, chest])
  assert.deepEqual(t, {
    sources: [
      { name: 'a skeleton', count: 2 },
      { name: 'unknown', count: 1 }
    ],
    chest: 2
  })
})

test('no chest payout, no note', () => {
  assert.equal(tallyDroppedBy([{ source: 'a skeleton' }]).chest, 0)
  assert.equal(rewardChestNote(0), undefined)
})
