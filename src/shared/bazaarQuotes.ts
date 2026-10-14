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
