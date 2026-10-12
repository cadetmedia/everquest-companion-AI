// shared/bazaarHours.ts — the Bazaar's time-of-day chart: the average asking and offered price per
// four-hour period, to see whether an item goes cheaper at night when fewer people are on.
//
// Built from the quotes (one per person per day, the day's latest 20), the only prices that carry
// a time of day; the per-day `prices[]` do not. A quote's `at` is the log's own clock, and
// EverQuest writes the log in the player's local time, so the periods are already the user's.

import { keeper, median, type BazaarItem, type DayQuote } from './bazaar'

/** The six periods in order from midnight, labelled as the owner reads a clock (owner ask, 2026-10-12: am/pm, not 24-hour). */
export const HOUR_BUCKETS = ['12-4am', '4-8am', '8am-12pm', '12-4pm', '4-8pm', '8pm-12am'] as const
export type HourBucket = (typeof HOUR_BUCKETS)[number]

/** One direction in one period, outliers left out as the switch says. */
export interface HourSide {
  mean: number | null
  median: number | null
  /** Priced quotes counted. */
  n: number
}

export interface HourPoint {
  bucket: HourBucket
  sell: HourSide
  buy: HourSide
}

/** Which period an `HH:MM:SS` falls in (0 to 5); null when unreadable. */
export function bucketOf(at: string): number | null {
  const m = /^(\d\d):/.exec(at)
  if (m === null) return null
  const h = Number(m[1])
  return h < 24 ? Math.floor(h / 4) : null
}

/** A priced quote's platinum, read at the combined item's price tier when it has one. */
function priceAt(item: BazaarItem, q: DayQuote): number | null {
  if (q.price === null) return null
  const c = item.combined
  return c === undefined ? q.price : q.price * c.rate ** (c.at - q.tier)
}

/** Each period's priced quotes in one direction, after the outlier keep. */
function perBucket(item: BazaarItem, dir: 'sell' | 'buy', ignoreOutliers: boolean): number[][] {
  const out: number[][] = HOUR_BUCKETS.map(() => [])
  const placed: [number, number][] = []
  for (const q of item.quotes) {
    const b = bucketOf(q.at)
    const p = priceAt(item, q)
    if (q.dir === dir && b !== null && p !== null) placed.push([b, p])
  }
  const keep = keeper(
    placed.map(([, p]) => p),
    ignoreOutliers
  )
  for (const [b, p] of placed) if (keep(p)) out[b].push(p)
  return out
}

function sideOf(ps: readonly number[]): HourSide {
  return {
    mean: ps.length > 0 ? ps.reduce((a, b) => a + b, 0) / ps.length : null,
    median: median(ps),
    n: ps.length
  }
}

/** The six periods, each direction's mean, median and count; empty periods read null and 0. */
export function hoursOf(item: BazaarItem, ignoreOutliers: boolean): HourPoint[] {
  const sell = perBucket(item, 'sell', ignoreOutliers)
  const buy = perBucket(item, 'buy', ignoreOutliers)
  return HOUR_BUCKETS.map((bucket, i) => ({ bucket, sell: sideOf(sell[i]), buy: sideOf(buy[i]) }))
}
