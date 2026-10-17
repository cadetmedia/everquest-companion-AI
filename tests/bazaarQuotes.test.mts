// The Bazaar offers list's order and its one-person filter (owner ask, 2026-10-13).

import { test } from 'node:test'
import assert from 'node:assert/strict'
import { DEFAULT_QUOTE_SORT, firstQuoteSortDir, quoteSpeakers, quotesBy, repeatSpeakers, sortQuotes, speakerAverages } from '../src/shared/bazaarQuotes'
import type { DayQuote } from '../src/shared/bazaar'

const q = (who: string, when: [day: string, at: string], price: number | null): DayQuote =>
  ({ who, day: when[0], at: when[1], price, msg: `WTS Fleeting Quiver (${who})`, dir: 'sell', item: 'Fleeting Quiver', tier: 0 }) as DayQuote

const A = q('Kazule', ['2026-10-13', '16:08:00'], 15000)
const B = q('apple', ['2026-10-12', '21:00:00'], 17000)
const C = q('Zed', ['2026-10-13', '09:00:00'], null)

test('the default is newest first', () => {
  assert.deepEqual(sortQuotes([B, C, A], DEFAULT_QUOTE_SORT).map((x) => x.who), ['Kazule', 'Zed', 'apple'])
})

test('who sorts A to Z ignoring case, and back', () => {
  assert.deepEqual(sortQuotes([A, B, C], { key: 'who', dir: 'asc' }).map((x) => x.who), ['apple', 'Kazule', 'Zed'])
  assert.deepEqual(sortQuotes([A, B, C], { key: 'who', dir: 'desc' }).map((x) => x.who), ['Zed', 'Kazule', 'apple'])
})

test('an unpriced line sorts after every priced one, either way', () => {
  assert.deepEqual(sortQuotes([C, A, B], { key: 'price', dir: 'desc' }).map((x) => x.who), ['apple', 'Kazule', 'Zed'])
  assert.deepEqual(sortQuotes([C, A, B], { key: 'price', dir: 'asc' }).map((x) => x.who), ['Kazule', 'apple', 'Zed'])
})

test('one person, case folded; empty is everyone', () => {
  assert.deepEqual(quotesBy([A, B, C], 'kazule').map((x) => x.who), ['Kazule'])
  assert.equal(quotesBy([A, B, C], '').length, 3)
  assert.equal(quotesBy([A, B, C], null).length, 3)
})

test('the people list puts the busiest first', () => {
  assert.deepEqual(quoteSpeakers([A, B, C, { ...B, at: '22:00:00' }]), ['apple', 'Kazule', 'Zed'])
  assert.equal(firstQuoteSortDir('price'), 'desc')
  assert.equal(firstQuoteSortDir('who'), 'asc')
})

test("a person's average is their newest ten priced quotes, selling and buying apart", () => {
  const sells = Array.from({ length: 12 }, (_, i) => q('Riskyb', [`2026-10-${String(i + 1).padStart(2, '0')}`, '12:00:00'], (i + 1) * 100))
  const buy = { ...q('Riskyb', ['2026-10-13', '13:00:00'], 50), dir: 'buy' } as DayQuote
  const unpriced = q('Riskyb', ['2026-10-14', '12:00:00'], null)
  const a = speakerAverages([...sells, buy, unpriced]).get('Riskyb')
  // Newest ten sells: days 3..12, prices 300..1200, mean 750.
  assert.deepEqual(a?.sell, { avg: 750, n: 10 })
  assert.deepEqual(a?.buy, { avg: 50, n: 1 })
  assert.equal(speakerAverages([C]).get('Zed'), undefined)
})

test('the Who list leaves out people who priced once or never', () => {
  const twice = [q('Mauxe', ['2026-10-01', '12:00:00'], 20000), q('Mauxe', ['2026-10-02', '12:00:00'], 21000)]
  const once = [q('Fyrdan', ['2026-10-03', '12:00:00'], 15000)]
  const never = [q('Darlantan', ['2026-10-03', '12:00:00'], null), q('Darlantan', ['2026-10-04', '12:00:00'], null)]
  assert.deepEqual(repeatSpeakers(speakerAverages([...twice, ...once, ...never])), ['Mauxe'])
})

test("on a combined item a person's average reads every tier at the price tier", () => {
  const plain = q('Bob', ['2026-10-01', '12:00:00'], 100)
  const plus2 = { ...q('Bob', ['2026-10-02', '12:00:00'], 400), tier: 2 } as DayQuote
  // Rate 2 per tier, priced as +0: the +2 ask of 400 reads as 100.
  assert.deepEqual(speakerAverages([plain, plus2], undefined, { rate: 2, at: 0 }).get('Bob')?.sell, { avg: 100, n: 2 })
  assert.deepEqual(speakerAverages([plain, plus2]).get('Bob')?.sell, { avg: 250, n: 2 })
})
