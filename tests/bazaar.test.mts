// The Bazaar tab's summary, from the engine's per-day rows (src/shared/bazaar.ts).

import { test } from 'node:test'
import assert from 'node:assert/strict'
import {
  formatMove,
  formatPlat,
  median,
  sparkline,
  summarizeBazaar,
  type BazaarItem,
  type BazaarRow,
  type BazaarSortKey
} from '../src/shared/bazaar'

type Where = [day: string, dir: BazaarRow['dir'], item: string]
const row = ([day, dir, item]: Where, prices: number[], more: Partial<BazaarRow> = {}): BazaarRow => ({
  day,
  dir,
  item,
  tier: 0,
  n: prices.length,
  unpriced: 0,
  min: prices.length > 0 ? Math.min(...prices) : null,
  max: prices.length > 0 ? Math.max(...prices) : null,
  sum: prices.reduce((s, p) => s + p, 0),
  prices,
  ...more
})

const rows: BazaarRow[] = [
  row(['2026-09-20', 'sell', 'Fleeting Quiver'], [20000, 22000]),
  row(['2026-09-21', 'sell', 'Fleeting Quiver'], [20000]),
  row(['2026-09-22', 'sell', 'Fleeting Quiver'], [21000, 100]),
  row(['2026-09-23', 'sell', 'Fleeting Quiver'], [24000]),
  row(['2026-09-24', 'sell', 'Fleeting Quiver'], [24000, 26000]),
  row(['2026-09-25', 'sell', 'Fleeting Quiver'], [24000]),
  row(['2026-09-25', 'buy', 'Fleeting Quiver'], [18000], { unpriced: 2 }),
  row(['2026-09-25', 'trade', 'Fleeting Quiver'], [], { unpriced: 1 }),
  row(['2026-09-21', 'sell', 'Bone-Clasped Girdle'], [3000], { tier: 3 }),
  row(['2026-09-20', 'sell', 'Bone-Clasped Girdle'], [5000], { tier: 4 })
]

const all = { text: '', dir: 'all' as const, sort: { key: 'lastDay' as const, desc: true } }

test('one entry per item and tier, asking and offered side by side, outliers left out', () => {
  const s = summarizeBazaar({ rows }, all)
  assert.deepEqual(s.items.map((i) => [i.item, i.tier]), [
    ['Fleeting Quiver', 0],
    ['Bone-Clasped Girdle', 3],
    ['Bone-Clasped Girdle', 4]
  ])
  const q = s.items[0]
  assert.equal(q.outliers, 1, 'the 100pp quiver is a typo, not a price')
  assert.equal(q.points.find((p) => p.day === '2026-09-22')?.sell.median, 21000)
  assert.equal(q.asking, 24000, 'median of the newest three priced days')
  assert.equal(q.askingMove, 24000 / 21000 - 1, 'against the three days before them')
  assert.equal(q.offered, 18000)
  assert.deepEqual([q.sellOffers, q.buyOffers, q.trades], [8, 3, 1])
  assert.deepEqual([s.days, s.lastDay], [6, '2026-09-25'])
  assert.equal(q.activeDays, 6)
})

test('with Ignore outliers off, the 100pp quiver counts like any price', () => {
  const q = summarizeBazaar({ rows }, { ...all, ignoreOutliers: false }).items[0]
  assert.equal(q.outliers, 0)
  assert.equal(q.points.find((p) => p.day === '2026-09-22')?.sell.median, (21000 + 100) / 2)
  assert.equal(q.asking, 24000, 'the newest three days had no outlier either way')
  assert.deepEqual([q.sellOffers, q.buyOffers], [9, 3], 'the ninth selling offer is back')
  // All tiers as one folds the same way: the 100pp price is in, so the day's low is 100.
  const c = summarizeBazaar({ rows }, { ...all, ignoreOutliers: false, combineTiers: true }).items[0]
  assert.equal(c.outliers, 0)
  assert.equal(c.points.find((p) => p.day === '2026-09-22')?.sell.low, 100)
  assert.equal(summarizeBazaar({ rows }, { ...all, ignoreOutliers: true }).items[0].outliers, 1)
})

test('search, direction and sort', () => {
  assert.deepEqual(summarizeBazaar({ rows }, { ...all, text: 'girdle' }).items.map((i) => i.tier), [3, 4])
  assert.deepEqual(summarizeBazaar({ rows }, { ...all, dir: 'buy' }).items.map((i) => i.item), ['Fleeting Quiver'])
  const by = (key: BazaarSortKey, desc: boolean): BazaarItem[] => summarizeBazaar({ rows }, { ...all, sort: { key, desc } }).items
  assert.deepEqual(by('asking', true).map((i) => i.asking), [24000, 5000, 3000])
  assert.deepEqual(by('asking', false).map((i) => i.asking), [3000, 5000, 24000])
  assert.deepEqual(by('item', false).map((i) => [i.item, i.tier]), [['Bone-Clasped Girdle', 3], ['Bone-Clasped Girdle', 4], ['Fleeting Quiver', 0]])
  assert.deepEqual(by('offers', true).map((i) => i.item), ['Fleeting Quiver', 'Bone-Clasped Girdle', 'Bone-Clasped Girdle'])
  // An item with no value in the column sorts last, whichever way the column is turned.
  for (const desc of [true, false]) assert.equal(by('offered', desc).at(0)?.item, 'Fleeting Quiver')
  assert.equal(by('offered', false).at(-1)?.offered, null)
  assert.deepEqual(summarizeBazaar(null, all).items, [])
})

test('an older row without its price list stands for its average', () => {
  const old = { ...row(['2026-09-20', 'sell', 'Fruit'], [10, 30]), prices: undefined }
  assert.equal(summarizeBazaar({ rows: [old] }, all).items[0].asking, 20)
})

test('the sparkline is one value per calendar day, null where none', () => {
  const q = summarizeBazaar({ rows }, all).items[0]
  const s = sparkline(q.points, '2026-09-26', 4)
  assert.deepEqual(s.sell, [24000, 25000, 24000, null])
  assert.deepEqual(s.buy, [null, null, 18000, null])
})

test('numbers read the way trade chat writes them', () => {
  assert.equal(median([3, 1, 2]), 2)
  assert.equal(median([]), null)
  assert.equal(formatPlat(20000), '20k')
  assert.equal(formatPlat(2500), '2.5k')
  assert.equal(formatPlat(75), '75p')
  assert.equal(formatPlat(0.5), '5g')
  assert.equal(formatPlat(null), '-')
  assert.equal(formatMove(0.123), '+12%')
  assert.equal(formatMove(-0.05), '-5%')
})
