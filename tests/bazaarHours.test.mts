// The Bazaar's time-of-day chart data (src/shared/bazaarHours.ts): four-hour periods of the
// player's clock, from the priced quotes, outliers left out as the switch says.

import { test } from 'node:test'
import assert from 'node:assert/strict'
import { summarizeBazaar, type BazaarRow, type Quote } from '../src/shared/bazaar'
import { HOUR_BUCKETS, bucketOf, hoursOf } from '../src/shared/bazaarHours'

const quote = (at: string, price: number | null, who = 'Leric'): Quote => ({ at, who, price, msg: 'WTS stuff' })

const row = (day: string, dir: BazaarRow['dir'], quotes: Quote[], tier = 0): BazaarRow => {
  const prices = quotes.flatMap((q) => (q.price === null ? [] : [q.price]))
  return {
    day,
    dir,
    item: 'Fleeting Quiver',
    tier,
    n: prices.length,
    unpriced: quotes.length - prices.length,
    min: prices.length > 0 ? Math.min(...prices) : null,
    max: prices.length > 0 ? Math.max(...prices) : null,
    sum: prices.reduce((s, p) => s + p, 0),
    prices,
    quotes
  }
}

const rows: BazaarRow[] = [
  row('2026-09-20', 'sell', [quote('03:59:59', 20000), quote('04:00:00', 22000, 'Bob'), quote('05:10:00', 100, 'Typo')]),
  row('2026-09-21', 'sell', [quote('21:00:00', 24000), quote('22:00:00', null, 'Mute')]),
  row('2026-09-21', 'buy', [quote('12:30:00', 18000, 'Ann')])
]

const all = { text: '', dir: 'all' as const, sort: { key: 'lastDay' as const, desc: true } }

test('a time of day falls in its four-hour period, with the edges on the hour', () => {
  assert.equal(bucketOf('00:00:00'), 0)
  assert.equal(bucketOf('03:59:59'), 0)
  assert.equal(bucketOf('04:00:00'), 1)
  assert.equal(bucketOf('23:59:59'), 5)
  assert.equal(bucketOf('24:00:00'), null)
  assert.equal(bucketOf(''), null)
  assert.equal(HOUR_BUCKETS.length, 6)
})

test('each period averages its priced quotes per direction, with the outlier left out', () => {
  const item = summarizeBazaar({ rows }, all).items[0]
  const h = hoursOf(item, true)
  assert.deepEqual(
    h.map((p) => p.bucket),
    ['00-04', '04-08', '08-12', '12-16', '16-20', '20-24']
  )
  assert.deepEqual(h[0].sell, { mean: 20000, median: 20000, n: 1 })
  assert.deepEqual(h[1].sell, { mean: 22000, median: 22000, n: 1 }, 'the 100pp typo is left out')
  assert.deepEqual(h[5].sell, { mean: 24000, median: 24000, n: 1 }, 'the unpriced quote does not count')
  assert.deepEqual(h[3].buy, { mean: 18000, median: 18000, n: 1 })
  assert.deepEqual(h[2].sell, { mean: null, median: null, n: 0 }, 'an empty period')
  assert.deepEqual(h[0].buy, { mean: null, median: null, n: 0 })
})

test('with Ignore outliers off, the typo counts in its period', () => {
  const item = summarizeBazaar({ rows }, all).items[0]
  const h = hoursOf(item, false)
  assert.deepEqual(h[1].sell, { mean: (22000 + 100) / 2, median: (22000 + 100) / 2, n: 2 })
})

test('an All-tiers-as-one item reads each quote at its price tier', () => {
  const tiered = [row('2026-09-20', 'sell', [quote('10:00:00', 1000)], 0), row('2026-09-21', 'sell', [quote('11:00:00', 2000, 'Bob')], 2)]
  const item = summarizeBazaar({ rows: tiered }, { ...all, combineTiers: true, priceTier: 2 }).items[0]
  const c = item.combined
  assert.ok(c !== undefined)
  const h = hoursOf(item, true)
  assert.equal(h[2].sell.n, 2)
  assert.equal(h[2].sell.mean, (1000 * c.rate ** 2 + 2000) / 2)
})
