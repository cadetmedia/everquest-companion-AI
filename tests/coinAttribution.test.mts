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

test('one sale credits the oldest pending loot of the item, whole, at its loot time', () => {
  const loot = [sash(1 * MIN), sash(5 * MIN), sash(9 * MIN), { ts: 10 * MIN, item: 'Rusty Dagger' }]
  const s = attributeSales(snap([2 * MIN, 60 * MIN], [40, 3000], ['', 'bandit sash']), loot)
  assert.deepEqual(s.coinTs, [1 * MIN, 2 * MIN])
  assert.deepEqual(s.coinCopper, [3000, 40])
})

test('selling three swords one at a time credits each to its own loot, oldest first', () => {
  const sword = (ts: number): LootEvent => ({ ts, item: 'Fine Steel Long Sword', zone: 'Lower Guk' })
  const loot = [sword(1 * MIN), sword(5 * MIN), sword(9 * MIN)]
  const s = attributeSales(
    snap([60 * MIN, 61 * MIN, 62 * MIN], [100, 200, 300], ['Fine Steel Long Sword', 'Fine Steel Long Sword', 'Fine Steel Long Sword']),
    loot
  )
  assert.deepEqual(s.coinTs, [1 * MIN, 5 * MIN, 9 * MIN])
  assert.deepEqual(s.coinCopper, [100, 200, 300])
})

test('a sale with the queue empty again stays where it happened', () => {
  const loot = [sash(1 * MIN), sash(30 * MIN)]
  const s = attributeSales(snap([20 * MIN, 21 * MIN, 50 * MIN], [500, 600, 800], ['Bandit Sash', 'Bandit Sash', 'Bandit Sash']), loot)
  assert.deepEqual(s.coinTs, [1 * MIN, 21 * MIN, 30 * MIN])
  assert.deepEqual(s.coinCopper, [500, 600, 800])
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

test('a stack looted at once is one entry, consumed whole by one sale', () => {
  const loot = [sash(1 * MIN, { count: 3 }), sash(2 * MIN)]
  const s = attributeSales(snap([20 * MIN, 21 * MIN], [800, 300], ['Bandit Sash', 'Bandit Sash']), loot)
  assert.deepEqual(s.coinTs, [1 * MIN, 2 * MIN])
  assert.deepEqual(s.coinCopper, [800, 300])
})

test('a destroyed copy leaves the queue, so a later sale credits the next loot', () => {
  const loot = [sash(1 * MIN), sash(2 * MIN, { disposition: 'destroyed' }), sash(5 * MIN, { zone: 'Unrest' })]
  const s = attributeSales(snap([20 * MIN], [500], ['Bandit Sash']), loot)
  assert.deepEqual(s.coinTs, [5 * MIN])
  assert.deepEqual(s.coinCopper, [500])
})
