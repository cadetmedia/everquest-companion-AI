// bazaarQuotes.ts — the Bazaar's offers list ordered and narrowed (owner ask, 2026-10-13: sort by
// every column, and view one person's offers). Pure, so the order is held by tests.

import type { DayQuote } from './bazaar'

export type QuoteSortKey = 'when' | 'who' | 'dir' | 'item' | 'price' | 'msg'
export interface QuoteSort {
  key: QuoteSortKey
  dir: 'asc' | 'desc'
}
/** The list's own order: newest first. */
export const DEFAULT_QUOTE_SORT: QuoteSort = { key: 'when', dir: 'desc' }

/** A column's first click: times and prices newest or dearest first, words A to Z. */
export function firstQuoteSortDir(key: QuoteSortKey): QuoteSort['dir'] {
  return key === 'when' || key === 'price' ? 'desc' : 'asc'
}

function value(q: DayQuote, key: QuoteSortKey): string | number | null {
  if (key === 'when') return `${q.day} ${q.at}`
  if (key === 'who') return q.who.toLowerCase()
  if (key === 'dir') return q.dir
  if (key === 'item') return `${q.item.toLowerCase()} ${String(q.tier).padStart(2, '0')}`
  if (key === 'price') return q.price ?? null
  return q.msg.toLowerCase()
}

/**
 * The quotes in the chosen order. A quote with no price (unpriced, or listed but not counted) sorts
 * after every priced one whichever way prices run; a tie keeps the given order.
 */
export function sortQuotes(quotes: readonly DayQuote[], sort: QuoteSort): DayQuote[] {
  const sign = sort.dir === 'asc' ? 1 : -1
  return quotes
    .map((q, i) => ({ q, i, v: value(q, sort.key) }))
    .sort((a, b) => {
      if (a.v === null || b.v === null) return a.v === b.v ? a.i - b.i : a.v === null ? 1 : -1
      const c = typeof a.v === 'number' && typeof b.v === 'number' ? a.v - b.v : String(a.v).localeCompare(String(b.v))
      return c !== 0 ? c * sign : a.i - b.i
    })
    .map((x) => x.q)
}

/** Everyone who posted in these quotes, most offers first, then A to Z. */
export function quoteSpeakers(quotes: readonly DayQuote[]): string[] {
  const n = new Map<string, number>()
  for (const q of quotes) n.set(q.who, (n.get(q.who) ?? 0) + 1)
  return [...n.entries()].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0])).map(([who]) => who)
}

/** One person's quotes (case folded), or all of them when `who` is empty. */
export function quotesBy(quotes: readonly DayQuote[], who: string | null): DayQuote[] {
  const w = (who ?? '').trim().toLowerCase()
  return w === '' ? [...quotes] : quotes.filter((q) => q.who.toLowerCase() === w)
}

/** One side of a person's recent prices: the mean of their newest priced quotes, and how many. */
export interface SideAverage {
  avg: number
  n: number
}
export interface SpeakerAverage {
  sell?: SideAverage
  buy?: SideAverage
}

/** How many of a person's newest priced quotes the Who list averages (owner ask, 2026-10-13). */
export const SPEAKER_AVG_LAST = 10

/**
 * Each person's mean price over their newest `last` priced quotes, selling and buying apart. For
 * ONE item's quotes only: across items a mean means nothing. A quote with no price (unpriced, or
 * listed but not counted) is skipped. The engine keeps one quote per person per day, so "the last
 * ten times" is their last ten days of posting. On a combined item, pass its tier `scale` so each
 * price is read at the price tier first, as the hours chart does; raw +0 and +5 asks never mix.
 */
export function speakerAverages(
  quotes: readonly DayQuote[],
  last = SPEAKER_AVG_LAST,
  scale?: { rate: number; at: number }
): Map<string, SpeakerAverage> {
  const newest = sortQuotes(quotes, DEFAULT_QUOTE_SORT)
  const sums = new Map<string, Record<'sell' | 'buy', number[]>>()
  for (const q of newest) {
    if (q.price == null || (q.dir !== 'sell' && q.dir !== 'buy')) continue
    const s = sums.get(q.who) ?? { sell: [], buy: [] }
    sums.set(q.who, s)
    if (s[q.dir].length < last) s[q.dir].push(scale ? q.price * scale.rate ** (scale.at - q.tier) : q.price)
  }
  const side = (xs: number[]): SideAverage | undefined =>
    xs.length === 0 ? undefined : { avg: xs.reduce((a, b) => a + b, 0) / xs.length, n: xs.length }
  const out = new Map<string, SpeakerAverage>()
  for (const [who, s] of sums) {
    const sell = side(s.sell)
    const buy = side(s.buy)
    out.set(who, { ...(sell ? { sell } : {}), ...(buy ? { buy } : {}) })
  }
  return out
}

/** The fewest priced offers that put a person in the Who list (owner ask, 2026-10-13). */
export const MIN_SPEAKER_OFFERS = 2

/**
 * The Who list on one item: only people with at least MIN_SPEAKER_OFFERS priced offers (selling
 * and buying together), most offers first, then A to Z. Someone who never priced, or priced once,
 * is left out of the list; their lines still show in the table.
 */
export function repeatSpeakers(averages: ReadonlyMap<string, SpeakerAverage>, min = MIN_SPEAKER_OFFERS): string[] {
  const total = (a: SpeakerAverage): number => (a.sell?.n ?? 0) + (a.buy?.n ?? 0)
  return [...averages.entries()]
    .filter(([, a]) => total(a) >= min)
    .sort((x, y) => total(y[1]) - total(x[1]) || x[0].localeCompare(y[0]))
    .map(([who]) => who)
}
