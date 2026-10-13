// coinAttribution.test.mts — a merchant sale is credited to where its items dropped.

import { test } from 'node:test'
import assert from 'node:assert/strict'
import type { ProgressionSnap } from '../src/shared/progressionTypes'
import type { LootEvent } from '../src/shared/types'
import { attributeSales } from '../src/shared/coinAttribution'

const MIN = 60_000

function snap(coinTs: number[], coinCopper: number[], coinSold: string[]): ProgressionSnap {
  return {
    expTs: [], expPct: [], expFlag: [], killTs: [], killZone: [], killCredit: [],
    witnessTs: [], recentKills: [], lootTs: [], zoneStart: [], zoneEnd: [], zoneName: [],
    offlineStart: [], offlineEnd: [], offlineCamped: [],
    levelTs: [], levelValue: [], aaGainTs: [], aaGainAmount: [],
    coinTs, coinCopper, coinSold, lastTs: 0, windowStart: 0, dropped: 0
  }
}

const sash = (ts: number, more: Partial<LootEvent> = {}): LootEvent => ({ ts, item: 'Bandit Sash', zone: 'The Rathe Mountains', ...more })

test('a stack sold in town is spread over the loots it paid for, at their own times', () => {
  const loot = [sash(1 * MIN), sash(5 * MIN), sash(9 * MIN), { ts: 10 * MIN, item: 'Rusty Dagger' }]
  const s = attributeSales(snap([2 * MIN, 60 * MIN], [40, 3000], ['', 'bandit sash']), loot)
  assert.deepEqual(s.coinTs, [1 * MIN, 2 * MIN, 5 * MIN, 9 * MIN])
  assert.deepEqual(s.coinCopper, [1000, 40, 1000, 1000])
})

test('each sale takes only the loots since the last sale of that item', () => {
  const loot = [sash(1 * MIN), sash(30 * MIN), sash(31 * MIN)]
  const s = attributeSales(snap([20 * MIN, 50 * MIN], [500, 800], ['Bandit Sash', 'Bandit Sash']), loot)
  assert.deepEqual(s.coinTs, [1 * MIN, 30 * MIN, 31 * MIN])
  assert.deepEqual(s.coinCopper, [500, 400, 400])
})

test('a sale with no kept loot of the item stays where it happened', () => {
  const loot = [sash(1 * MIN, { disposition: 'sold' }), sash(2 * MIN, { disposition: 'destroyed' })]
  const s = attributeSales(snap([20 * MIN], [500], ['Bandit Sash']), loot)
  assert.deepEqual(s.coinTs, [20 * MIN])
  assert.deepEqual(s.coinCopper, [500])
})

test('a snapshot with no merchant sale is returned as it is', () => {
  const s = snap([MIN], [10], [''])
  assert.equal(attributeSales(s, []), s)
  const bare = snap([MIN], [10], [])
  assert.equal(attributeSales(bare, []), bare)
})

test('a stack looted at once counts by its size', () => {
  const loot = [sash(1 * MIN, { count: 3 }), sash(2 * MIN)]
  const s = attributeSales(snap([20 * MIN], [800], ['Bandit Sash']), loot)
  assert.deepEqual(s.coinCopper, [600, 200])
})
