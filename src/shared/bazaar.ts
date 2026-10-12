// shared/bazaar.ts — the Bazaar tab's data: what trade chat asked and offered, per item.
//
// The engine's `bazaar` module (engine/crates/fold/src/modules/bazaar.rs) keeps one row per day,
// item, upgrade tier and direction, with every priced offer's platinum per unit. This turns those
// rows into the tab: one entry per item and tier, its asking (WTS) and offered (WTB) prices side by
// side, day by day. Here rather than in the renderer because the renderer never filters or sorts
// served rows (owner ruling 4).
//
// MEDIANS, AND OUTLIERS LEFT OUT. Trade chat is noisy: a typo, a price for a stack read as a price
// for one, a joke. So every number here is a median, and a price more than OUTLIER times away from
// the median of all that item's prices in that direction is left out (counted in `outliers`), once
// there are at least three to judge by. The tab's "Ignore outliers" switch turns that off
// (`BazaarQuery.ignoreOutliers`), and every price counts.

import { averageNow, predictNow } from './bazaarForecast'
import { asBaseTier, tierRate, type BaseTierRow } from './bazaarTiers'

export const BAZAAR_MODULE_ID = 'bazaar'

export type BazaarDir = 'sell' | 'buy' | 'trade'

/** One day's offers for one item, tier and direction, as the engine serves it. Prices in platinum. */
export interface BazaarRow {
  /** `YYYY-MM-DD`, the log's own date. */
  day: string
  dir: BazaarDir
  item: string
  tier: number
  /** Offers that stated a price; a seller repeating one offer in a day counts once. */
  n: number
  /** Offers that stated none. */
  unpriced: number
  min: number | null
  max: number | null
  sum: number
  /** Every priced offer, platinum per unit. Absent in rows from before 2026-10-06. */
  prices?: number[]
  /** Who said it and what they said: one per person, their newest, the day's latest 20 people. Absent before 2026-10-07. */
  quotes?: Quote[]
}

/** One counted offer as it was said. */
export interface Quote {
  /** The log's time of day, `17:54:48`. */
  at: string
  who: string
  /** Platinum per unit; null when the offer stated none. */
  price: number | null
  msg: string
}

/** A quote with its day, direction, item and tier: the who's-offering list and the CSV. */
export interface DayQuote extends Quote {
  day: string
  dir: BazaarDir
  item: string
  tier: number
}

/** One offer heard live (bazaar.rs `LiveOffer`): what the watch alerts read. */
export interface LiveOffer {
  seq: number
  /** The log's stamp, `2026-09-23 17:54:48`. */
  at: string
  speaker: string
  dir: BazaarDir
  item: string
  tier: number
  /** Platinum per unit; null when the offer stated none. */
  price: number | null
}

export interface BazaarSnap {
  rows: BazaarRow[]
  /** The last offers heard after the replay caught up, newest last. Absent from older engines. */
  live?: LiveOffer[]
}

/** One direction on one day, outliers left out. */
export interface BazaarSide {
  median: number | null
  mean: number | null
  low: number | null
  high: number | null
  /** Priced offers counted. */
  n: number
  unpriced: number
  /** That day's offers as said, for the chart's hover. */
  quotes: Quote[]
}

export interface BazaarPoint {
  day: string
  sell: BazaarSide
  buy: BazaarSide
  trades: number
}

export interface BazaarItem {
  key: string
  item: string
  tier: number
  lastDay: string
  /** Median of the newest RECENT priced days. */
  asking: number | null
  offered: number | null
  /** Asking now against the RECENT priced days before them, as a fraction (0.1 = up 10%). */
  askingMove: number | null
  /** Mean of the last week's prices, and the trend's value on the log's newest day (bazaarForecast.ts). */
  askingAvg: number | null
  offeredAvg: number | null
  askingPredicted: number | null
  offeredPredicted: number | null
  sellOffers: number
  buyOffers: number
  trades: number
  outliers: number
  /** Days with any offer in the TREND_DAYS ending on the log's newest day: what the trend column sorts by. */
  activeDays: number
  /**
   * Platinum changing hands in the TREND_DAYS, roughly: the price now (asking, else offered) times
   * the offers seen. What "Popular" ranks by: a 5-gold item asked for a hundred times stays small.
   */
  volume: number | null
  /** Every day with any offer, oldest first. */
  points: BazaarPoint[]
  /** The offers as said, newest first. */
  quotes: DayQuote[]
  /** With "All tiers as one": every tier read as +0 (shared/bazaarTiers.ts), and each tier's own line. */
  combined?: CombinedTiers
}

/** One tier of a combined item: what it was asked and offered at, and what the estimate says. */
export interface TierLine {
  tier: number
  asking: number | null
  offered: number | null
  offers: number
  /** The combined asking price moved to this tier by the item's tier rate. */
  estimate: number | null
}

export interface CombinedTiers {
  /** How much one tier adds, as a factor (1.22 = 22% a tier). */
  rate: number
  tiers: TierLine[]
  /** The tier every price of this entry is read at: the "Price at" slider. */
  at: number
  /** Someone priced the item at that tier; false means every price here is an estimate from the rate. */
  atSeen: boolean
}

/** A column of the tab's list; every one sorts. */
export type BazaarSortKey =
  | 'item'
  | 'trend'
  | 'asking'
  | 'askingAvg'
  | 'askingPredicted'
  | 'move'
  | 'offered'
  | 'offers'
  | 'volume'
  | 'lastDay'

export interface BazaarSort {
  key: BazaarSortKey
  desc: boolean
}

export interface BazaarQuery {
  /** Part of an item name, any case. */
  text: string
  /** Keep items with offers in this direction. */
  dir: BazaarDir | 'all'
  sort: BazaarSort
  /** Keep only these items and tiers (the wish list, the watchlist). */
  keep?: (item: string, tier: number) => boolean
  /** Keep only items whose price now (asking, else offered) is at least this, in platinum. */
  minPrice?: number
  /** One entry per item, every tier read as one tier (shared/bazaarTiers.ts). */
  combineTiers?: boolean
  /** With combineTiers, the tier the prices are read at; +0 unless named. */
  priceTier?: number
  /** Only offers from the last this-many days, counted back from the log's newest day. */
  sinceDays?: number
  /** Leave out prices far from the item's median (the header); on unless false. */
  ignoreOutliers?: boolean
}

export interface BazaarSummary {
  items: BazaarItem[]
  /** Across the whole log, before the query. */
  days: number
  offers: number
  /** The newest day any offer was seen, where the sparklines end. */
  lastDay: string | null
}

const OUTLIER = 4
const RECENT = 3
export const TREND_DAYS = 30

export function median(xs: readonly number[]): number | null {
  if (xs.length === 0) return null
  const s = [...xs].sort((a, b) => a - b)
  const m = Math.floor(s.length / 2)
  return s.length % 2 === 1 ? s[m] : (s[m - 1] + s[m]) / 2
}

/** A row's prices; an older row without the list stands for its average, `n` times. */
function pricesOf(r: BazaarRow): number[] {
  if (r.prices !== undefined) return r.prices
  return r.n > 0 ? Array<number>(r.n).fill(r.sum / r.n) : []
}

const EMPTY: BazaarSide = { median: null, mean: null, low: null, high: null, n: 0, unpriced: 0, quotes: [] }

function sideOf(rows: readonly BazaarRow[], keep: (p: number) => boolean): BazaarSide {
  const ps = rows.flatMap(pricesOf).filter(keep)
  return {
    median: median(ps),
    mean: ps.length > 0 ? ps.reduce((a, b) => a + b, 0) / ps.length : null,
    low: ps.length > 0 ? Math.min(...ps) : null,
    high: ps.length > 0 ? Math.max(...ps) : null,
    n: ps.length,
    unpriced: rows.reduce((s, r) => s + r.unpriced, 0),
    quotes: rows.flatMap((r) => r.quotes ?? [])
  }
}

/** Keeps a price within OUTLIER times of the median of `all`, once there are three to judge by; every price when `on` is false. */
export function keeper(all: readonly number[], on: boolean): (p: number) => boolean {
  const m = median(all)
  if (!on || m === null || all.length < 3) return () => true
  return (p) => p >= m / OUTLIER && p <= m * OUTLIER
}

/** Median of the newest RECENT priced days, and of the RECENT before them. */
function recentAndBefore(points: readonly BazaarPoint[], dir: 'sell' | 'buy'): [number | null, number | null] {
  const priced = points.map((p) => p[dir].median).filter((m): m is number => m !== null)
  const now = priced.slice(-RECENT)
  const before = priced.slice(-2 * RECENT, -RECENT)
  return [median(now), median(before)]
}

function pointOf(day: string, rows: readonly BazaarRow[], keep: Record<'sell' | 'buy', (p: number) => boolean>): BazaarPoint {
  const on = rows.filter((r) => r.day === day)
  const d = (dir: BazaarDir): BazaarRow[] => on.filter((r) => r.dir === dir)
  return {
    day,
    sell: d('sell').length > 0 ? sideOf(d('sell'), keep.sell) : EMPTY,
    buy: d('buy').length > 0 ? sideOf(d('buy'), keep.buy) : EMPTY,
    trades: d('trade').reduce((s, r) => s + r.unpriced + r.n, 0)
  }
}

/** One direction's average and predicted price on `endDay`. */
function forecast(points: readonly BazaarPoint[], dir: 'sell' | 'buy', endDay: string, recent: number | null): [number | null, number | null] {
  const days = points.map((p) => ({ day: p.day, median: p[dir].median, mean: p[dir].mean, n: p[dir].n }))
  return [averageNow(days, endDay), predictNow(days, endDay, recent)]
}

/** What every entry's fold shares: the log's newest day, and whether far-off prices are left out. */
interface Fold {
  endDay: string
  outliers: boolean
}

function itemOf(key: string, rows: readonly BazaarRow[], f: Fold): BazaarItem {
  const pricesIn = (d: BazaarDir): number[] => rows.filter((r) => r.dir === d).flatMap(pricesOf)
  const keep = { sell: keeper(pricesIn('sell'), f.outliers), buy: keeper(pricesIn('buy'), f.outliers) }
  const days = [...new Set(rows.map((r) => r.day))].sort()
  const points = days.map((day) => pointOf(day, rows, keep))
  const [asking, askedBefore] = recentAndBefore(points, 'sell')
  const [offered] = recentAndBefore(points, 'buy')
  const [askingAvg, askingPredicted] = forecast(points, 'sell', f.endDay, asking)
  const [offeredAvg, offeredPredicted] = forecast(points, 'buy', f.endDay, offered)
  const counted = (dir: 'sell' | 'buy'): number => points.reduce((s, p) => s + p[dir].n + p[dir].unpriced, 0)
  const kept = points.reduce((s, p) => s + p.sell.n + p.buy.n, 0)
  const recent = f.endDay === '' ? [] : points.filter((p) => (Date.parse(f.endDay) - Date.parse(p.day)) / 86_400_000 < TREND_DAYS)
  const recentOffers = recent.reduce((s, p) => s + p.sell.n + p.sell.unpriced + p.buy.n + p.buy.unpriced, 0)
  const ref = asking ?? offered
  return {
    key,
    item: rows[0].item,
    tier: rows[0].tier,
    lastDay: days[days.length - 1],
    asking,
    offered,
    askingMove: asking !== null && askedBefore !== null && askedBefore > 0 ? asking / askedBefore - 1 : null,
    askingAvg,
    offeredAvg,
    askingPredicted,
    offeredPredicted,
    sellOffers: counted('sell'),
    buyOffers: counted('buy'),
    trades: points.reduce((s, p) => s + p.trades, 0),
    outliers: pricesIn('sell').length + pricesIn('buy').length - kept,
    activeDays: recent.length,
    volume: ref === null || recentOffers === 0 ? null : ref * recentOffers,
    quotes: quotesOf(rows),
    points
  }
}

export const newestFirst = (a: DayQuote, b: DayQuote): number => `${b.day} ${b.at}`.localeCompare(`${a.day} ${a.at}`)

/** Every quote of these rows, newest first. */
function quotesOf(rows: readonly BazaarRow[]): DayQuote[] {
  return rows
    .flatMap((r) => (r.quotes ?? []).map((q) => ({ ...q, day: r.day, dir: r.dir, item: r.item, tier: (r as Partial<BaseTierRow>).fromTier ?? r.tier })))
    .sort(newestFirst)
}

/**
 * Every tier of one item as one entry, its prices read at tier `at`, with each tier's own line beside
 * the estimate. Traded 30d stays in platinum as offered: each tier's own volume, added up.
 */
function combinedOf(key: string, rows: readonly BazaarRow[], f: Fold, asked: number): BazaarItem {
  // An item nobody offered above +0 (a quest item, a gem, a tradeskill part) is not upgraded:
  // read at its own price, never grown to the slider's tier by a rate it has no tiers to show.
  const at = rows.some((r) => r.tier > 0) ? asked : 0
  const rate = tierRate(rows)
  const x = itemOf(key, asBaseTier(rows, rate, at), f)
  const perTier = [...new Set(rows.map((r) => r.tier))].sort((a, b) => a - b).map((tier) => itemOf(`${key}|${tier}`, rows.filter((r) => r.tier === tier), f))
  const tiers = perTier.map(
    (t): TierLine => ({
      tier: t.tier,
      asking: t.asking,
      offered: t.offered,
      offers: t.sellOffers + t.buyOffers + t.trades,
      estimate: x.asking === null ? null : x.asking * rate ** (t.tier - at)
    })
  )
  const volumes = perTier.flatMap((t) => (t.volume === null ? [] : [t.volume]))
  const atSeen = tiers.some((t) => t.tier === at && (t.asking !== null || t.offered !== null))
  return {
    ...x,
    volume: volumes.length > 0 ? volumes.reduce((a, b) => a + b, 0) : null,
    combined: { rate, tiers, at, atSeen }
  }
}

/** Rows within the last `days` days of `endDay`; every row when `days` is absent. */
function within(rows: readonly BazaarRow[], endDay: string, days: number | undefined): readonly BazaarRow[] {
  if (days === undefined || days <= 0 || endDay === '') return rows
  const end = Date.parse(endDay)
  return rows.filter((r) => (end - Date.parse(r.day)) / 86_400_000 < days)
}

/** Each column's value; null sorts last whichever way the column is turned. */
const COLUMN: Record<BazaarSortKey, (x: BazaarItem) => number | string | null> = {
  item: (x) => `${x.item.toLowerCase()} ${String(x.tier).padStart(2, '0')}`,
  trend: (x) => x.activeDays,
  asking: (x) => x.asking,
  askingAvg: (x) => x.askingAvg,
  askingPredicted: (x) => x.askingPredicted,
  move: (x) => x.askingMove,
  offered: (x) => x.offered,
  offers: (x) => x.sellOffers + x.buyOffers + x.trades,
  volume: (x) => x.volume,
  lastDay: (x) => x.lastDay
}

function byValue(a: number | string, b: number | string): number {
  return typeof a === 'number' && typeof b === 'number' ? a - b : String(a).localeCompare(String(b))
}

function compare(sort: BazaarSort): (a: BazaarItem, b: BazaarItem) => number {
  const value = COLUMN[sort.key]
  return (a, b) => {
    const va = value(a)
    const vb = value(b)
    const nulls = (va === null ? 1 : 0) - (vb === null ? 1 : 0)
    if (nulls !== 0) return nulls
    const c = va === null || vb === null ? 0 : byValue(va, vb)
    return (sort.desc ? -c : c) || b.lastDay.localeCompare(a.lastDay) || a.item.localeCompare(b.item) || a.tier - b.tier
  }
}

/** Offers an entry has in a direction: a direction filter keeps entries with any. */
const DIR_OFFERS: Record<BazaarDir, (x: BazaarItem) => number> = { sell: (x) => x.sellOffers, buy: (x) => x.buyOffers, trade: (x) => x.trades }

function matches(x: BazaarItem, q: BazaarQuery, text: string): boolean {
  if (text !== '' && !x.item.toLowerCase().includes(text)) return false
  const keep = q.keep
  const tiers = x.combined === undefined ? [x.tier] : x.combined.tiers.map((t) => t.tier)
  if (keep !== undefined && !tiers.some((tier) => keep(x.item, tier))) return false
  return q.dir === 'all' || DIR_OFFERS[q.dir](x) > 0
}

function pricedEnough(x: BazaarItem, min: number | undefined): boolean {
  if (min === undefined || min <= 0) return true
  const ref = x.asking ?? x.offered
  return ref !== null && ref >= min
}

/** The query fields that change an entry's numbers; the rest only pick and order entries. */
export type BazaarShape = Pick<BazaarQuery, 'combineTiers' | 'priceTier' | 'sinceDays' | 'ignoreOutliers'>

/** Every entry the shape gives, in no order, with the log's totals: computed once, then picked from. */
export interface BazaarItems extends Omit<BazaarSummary, 'items'> {
  items: BazaarItem[]
}

/**
 * The expensive half: every entry's points, forecasts and quotes. The tab keeps the result while
 * the snapshot and shape stand, so a keystroke in the search does not rebuild two thousand entries.
 */
export function summarizeBazaarItems(snap: BazaarSnap | null, s: BazaarShape): BazaarItems {
  const rows = snap?.rows ?? []
  const days = [...new Set(rows.map((r) => r.day))].sort()
  const endDay = days.length > 0 ? days[days.length - 1] : ''
  const groups = new Map<string, BazaarRow[]>()
  for (const r of within(rows, endDay, s.sinceDays)) {
    const key = s.combineTiers === true ? r.item : `${r.item}|${r.tier}`
    const g = groups.get(key)
    if (g === undefined) groups.set(key, [r])
    else g.push(r)
  }
  const f: Fold = { endDay, outliers: s.ignoreOutliers !== false }
  return {
    items: [...groups].map(([key, g]) => (s.combineTiers === true ? combinedOf(key, g, f, s.priceTier ?? 0) : itemOf(key, g, f))),
    days: days.length,
    offers: rows.reduce((s, r) => s + r.n + r.unpriced, 0),
    lastDay: days.length > 0 ? days[days.length - 1] : null
  }
}

/** The cheap half: the entries that match the text, direction, keep and price floor, in the asked order. The entries are the same objects. */
export function selectBazaarItems(all: BazaarItems, q: BazaarQuery): BazaarSummary {
  const text = q.text.trim().toLowerCase()
  return { ...all, items: all.items.filter((x) => matches(x, q, text) && pricedEnough(x, q.minPrice)).sort(compare(q.sort)) }
}

/** The tab: one entry per item and tier that matches, in the asked order, with the log's totals. Both halves at once. */
export function summarizeBazaar(snap: BazaarSnap | null, q: BazaarQuery): BazaarSummary {
  return selectBazaarItems(summarizeBazaarItems(snap, q), q)
}

export interface Spark {
  sell: (number | null)[]
  buy: (number | null)[]
}

/** The `n` calendar days ending `endDay`, one median per day per direction (null where none). */
export function sparkline(points: readonly BazaarPoint[], endDay: string, n: number): Spark {
  const end = Date.parse(`${endDay}T00:00:00Z`)
  const at = new Map(points.map((p) => [p.day, p]))
  const out: Spark = { sell: [], buy: [] }
  for (let i = n - 1; i >= 0; i--) {
    const p = at.get(new Date(end - i * 86_400_000).toISOString().slice(0, 10))
    out.sell.push(p?.sell.median ?? null)
    out.buy.push(p?.buy.median ?? null)
  }
  return out
}

/** `20000` → `20k`, `2500` → `2.5k`, `75` → `75p`, `0.5` → `5g`: platinum as trade chat writes it. */
export function formatPlat(pp: number | null): string {
  if (pp === null) return '-'
  if (pp >= 1_000_000) return `${Number((pp / 1_000_000).toFixed(pp >= 10_000_000 ? 0 : 1))}M`
  if (pp >= 1000) return `${Number((pp / 1000).toFixed(pp >= 10000 ? 0 : 1))}k`
  if (pp >= 1) return `${Math.round(pp)}p`
  return `${Number((pp * 10).toFixed(1))}g`
}

const PLAT_SCALE: Record<string, number> = { k: 1000, m: 1_000_000 }

/** `5k`, `2.5k`, `1.5M`, `500`, `500p`, `500pp` → platinum; blank or unreadable → null. */
export function parsePlat(s: string): number | null {
  const m = /^\s*(\d+(?:\.\d+)?)\s*(k|m|pp|p)?\s*$/i.exec(s)
  if (m === null) return null
  const n = Number(m[1]) * (PLAT_SCALE[m[2]?.toLowerCase() ?? ''] ?? 1)
  return n > 0 ? n : null
}

/** `0.12` → `+12%`, `-0.05` → `-5%`. */
export function formatMove(f: number | null): string {
  if (f === null) return ''
  const pct = Math.round(f * 100)
  return pct === 0 ? '0%' : `${pct > 0 ? '+' : ''}${pct}%`
}
