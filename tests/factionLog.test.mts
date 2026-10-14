// THE LOG'S FACTION RECEIPTS (shared/factionLog.ts) — the two measured line shapes, the
// compressed fold, and the stale-dump correction they exist for. The line texts are the real
// log's own shapes (measured 2026-09-05: 21,354 lines, two dialects, zero "got better/worse" on
// Legends); the lines below are synthetic instances of those shapes, per the fixture-scrub law.

import { test } from 'node:test'
import assert from 'node:assert/strict'
import {
  applyEvidence,
  foldFactionEvidence,
  foldRecentFactions,
  parseFactionLogLine,
  type FactionLogEvent
} from '../src/shared/factionLog'

const at = (line: string): string => `[Wed Aug 12 19:03:54 2026] ${line}`

test('the two measured line shapes parse; everything else is null', () => {
  assert.deepEqual(
    parseFactionLogLine(at('Your faction standing with Heretics has been adjusted by -5.')),
    { name: 'Heretics', kind: 'adjust', amount: -5 }
  )
  assert.deepEqual(
    parseFactionLogLine(at('Your faction standing with Miners Guild 249 has been adjusted by 7.')),
    { name: 'Miners Guild 249', kind: 'adjust', amount: 7 }
  )
  assert.deepEqual(
    parseFactionLogLine(at('Your faction standing with Ring of Scale could not possibly get any better.')),
    { name: 'Ring of Scale', kind: 'cap', cap: 'high' }
  )
  assert.deepEqual(
    parseFactionLogLine(at('Your faction standing with Agents of Mistmoore could not possibly get any worse.')),
    { name: 'Agents of Mistmoore', kind: 'cap', cap: 'low' }
  )
  // The wiki's parenthesised spelling, tolerated for the one regex to serve both readers.
  assert.deepEqual(
    parseFactionLogLine('Your faction standing with Deepwater Knights has been adjusted by (+7).'),
    { name: 'Deepwater Knights', kind: 'adjust', amount: 7 }
  )
  assert.equal(parseFactionLogLine(at('You gain experience!!')), null)
  assert.equal(parseFactionLogLine(at('Your faction standing with somebody got better.')), null)
})

test('the fold compresses: a cap resets the sum, later adjustments ride on the pin', () => {
  const ev = (line: string): FactionLogEvent => {
    const e = parseFactionLogLine(line)
    assert.ok(e, line)
    return e
  }
  const rows = foldFactionEvidence([
    ev('Your faction standing with Kerra Isle has been adjusted by 5.'),
    ev('Your faction standing with Kerra Isle has been adjusted by 5.'),
    ev('Your faction standing with Kerra Isle could not possibly get any better.'),
    ev('Your faction standing with Kerra Isle has been adjusted by -2.'),
    ev('Your faction standing with Heretics has been adjusted by -5.')
  ])
  assert.deepEqual(rows, [
    { name: 'Kerra Isle', cap: 'high', sum: -2, hits: 4 },
    { name: 'Heretics', cap: null, sum: -5, hits: 1 }
  ])
})

test('the fold keys a faction as the dump join does: two spellings of one faction are one row', () => {
  const rows = foldFactionEvidence([
    { name: 'Freeport Militia', kind: 'adjust', amount: 5 },
    { name: 'The Freeport Militia', kind: 'adjust', amount: 3 }
  ])
  assert.deepEqual(rows, [{ name: 'Freeport Militia', cap: null, sum: 8, hits: 2 }])
})

test('applyEvidence corrects a stale dump: sums ride the number, caps override it', () => {
  // Unpinned + complete window: the sum is the whole story.
  assert.deepEqual(applyEvidence(690, 2000, { name: 'x', cap: null, sum: 35, hits: 7 }, true), {
    value: 725,
    drift: 35,
    exact: true
  })
  // Unpinned + INCOMPLETE window: same arithmetic, honestly marked "at least".
  assert.equal(applyEvidence(690, 2000, { name: 'x', cap: null, sum: 35, hits: 7 }, false).exact, false)
  // A cap pin makes a stale file irrelevant — and is exact even through a short window.
  assert.deepEqual(applyEvidence(0, 2000, { name: 'x', cap: 'high', sum: 0, hits: 9 }, false), {
    value: 2000,
    drift: 2000,
    exact: true
  })
  assert.deepEqual(applyEvidence(500, 2000, { name: 'x', cap: 'low', sum: 10, hits: 3 }, false), {
    value: -1990,
    drift: -2490,
    exact: true
  })
  // The clamp: no sum may carry the value past the faction's own scale.
  assert.equal(applyEvidence(1990, 2000, { name: 'x', cap: null, sum: 500, hits: 1 }, true).value, 2000)
  assert.equal(applyEvidence(-1990, 2000, { name: 'x', cap: null, sum: -500, hits: 1 }, true).value, -2000)
})

test('the recent tally counts each faction inside the window, nets its adjustments, and keeps its last time', () => {
  const ev = (name: string, amount: number | 'cap'): FactionLogEvent =>
    amount === 'cap' ? { name, kind: 'cap', cap: 'high' } : { name, kind: 'adjust', amount }
  const recent = foldRecentFactions(
    [
      { ts: 100, ev: ev('Heretics', -5) },
      { ts: 200, ev: ev('Heretics', -5) },
      { ts: 210, ev: ev('Miners Guild 249', 7) },
      { ts: 300, ev: ev('heretics', -5) },
      { ts: 310, ev: ev('Ring of Scale', 'cap') }
    ],
    150
  )
  assert.deepEqual(recent, [
    { name: 'Heretics', hits: 2, net: -10, lastTs: 300 },
    { name: 'Miners Guild 249', hits: 1, net: 7, lastTs: 210 },
    { name: 'Ring of Scale', hits: 1, net: 0, lastTs: 310 }
  ])
})
