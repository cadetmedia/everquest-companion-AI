// ============================================================================
// factionLedger.test.mts — the faction lines kept beside an archived log (shared/factionLedger.ts).
// ============================================================================
//
// Byte-identical on `log-archive` (which writes ledgers) and `faction-tab` (which reads them), like
// the module it tests. Times are built with `parseEqTimestamp` itself, so the tests hold on any host
// zone.

import { test } from 'node:test'
import assert from 'node:assert/strict'
import {
  FACTION_LEDGER_VERSION,
  LedgerBuilder,
  isLedgerFileName,
  ledgerEventOf,
  ledgerFileName,
  ledgerWindow,
  parseLedger,
  type FactionLedger,
  type LedgerEvent
} from '../src/shared/factionLedger'
import { parseEqTimestamp } from '../src/shared/spellKey'

const at = (hms: string): number => parseEqTimestamp(`Sun Aug 02 ${hms} 2026`)
const line = (hms: string, text: string): string => `[Sun Aug 02 ${hms} 2026] ${text}`
const adj = (who: string, n: number): string => `Your faction standing with ${who} has been adjusted by ${n}.`
const best = (who: string): string => `Your faction standing with ${who} could not possibly get any better.`
const worst = (who: string): string => `Your faction standing with ${who} could not possibly get any worse.`

function built(lines: string[]): FactionLedger {
  const b = new LedgerBuilder()
  for (const l of lines) b.add(l)
  return b.build('eqlog_Primitive_freeport.txt', 'seg-1')
}

test('the file name, and telling a ledger from a segment', () => {
  assert.equal(ledgerFileName('primitive_freeport-1'), 'primitive_freeport-1.factions.json')
  assert.ok(isLedgerFileName('x.factions.json'))
  assert.ok(!isLedgerFileName('x.segment.json'))
})

test('a line: an adjustment, a cap either way, and anything else', () => {
  assert.deepEqual(ledgerEventOf(adj('Heretics', -5), 1), { ts: 1, name: 'Heretics', kind: 'adjust', amount: -5 })
  assert.deepEqual(ledgerEventOf('Your faction standing with Kerra has been adjusted by (+12).', 2), { ts: 2, name: 'Kerra', kind: 'adjust', amount: 12 })
  assert.deepEqual(ledgerEventOf(best('Ring of Scale'), 3), { ts: 3, name: 'Ring of Scale', kind: 'cap', cap: 'high', n: 1 })
  assert.equal(ledgerEventOf(worst('Agents of Mistmoore'), 4)?.kind, 'cap')
  assert.equal(ledgerEventOf('You have slain a gnoll!', 5), null)
})

test('the builder: every faction line with its time, the first and last line of the file', () => {
  const l = built([
    line('10:00:00', 'You are hungry.'),
    line('10:00:05', adj('Heretics', -5)),
    'a line with no stamp',
    line('10:00:09', adj('Kerra', 3)),
    line('10:01:00', 'You have entered Freeport.')
  ])
  assert.equal(l.v, FACTION_LEDGER_VERSION)
  assert.equal(l.firstTs, at('10:00:00'))
  assert.equal(l.lastTs, at('10:01:00'))
  assert.deepEqual(l.events.map((e) => [e.name, e.ts]), [
    ['Heretics', at('10:00:05')],
    ['Kerra', at('10:00:09')]
  ])
})

test('the builder: a run of one cap is one entry at its last time, other factions in between or not', () => {
  const l = built([
    line('10:00:00', best('Ring of Scale')),
    line('10:00:10', adj('Heretics', -5)),
    line('10:00:20', best('Ring of Scale')),
    line('10:00:30', best('ring of scale')),
    line('10:00:40', adj('Ring of Scale', -2)),
    line('10:00:50', best('Ring of Scale')),
    line('10:01:00', worst('Ring of Scale'))
  ])
  const ring = l.events.filter((e) => e.name.toLowerCase() === 'ring of scale')
  assert.deepEqual(ring, [
    { ts: at('10:00:30'), name: 'Ring of Scale', kind: 'cap', cap: 'high', n: 3 },
    { ts: at('10:00:40'), name: 'Ring of Scale', kind: 'adjust', amount: -2 },
    { ts: at('10:00:50'), name: 'Ring of Scale', kind: 'cap', cap: 'high', n: 1 },
    { ts: at('10:01:00'), name: 'Ring of Scale', kind: 'cap', cap: 'low', n: 1 }
  ])
})

test('parse: a written ledger reads back; another version or a bad event is refused', () => {
  const l = built([line('10:00:00', adj('Heretics', -5))])
  assert.deepEqual(parseLedger(JSON.parse(JSON.stringify(l))), l)
  assert.equal(parseLedger({ ...l, v: 2 }), null)
  assert.equal(parseLedger({ ...l, events: [{ ts: 1, name: 'x', kind: 'cap', cap: 'up', n: 1 }] }), null)
  assert.equal(parseLedger('nope'), null)
})

function ledger(segment: string, first: number, last: number, events: LedgerEvent[]): FactionLedger {
  return { v: FACTION_LEDGER_VERSION, log: 'eqlog_Primitive_freeport.txt', segment, firstTs: first, lastTs: last, events }
}

const ev = (ts: number, amount = 1): LedgerEvent => ({ ts, name: 'Heretics', kind: 'adjust', amount })

test('window: only what the live read does not hold, after the dump, oldest ledger first', () => {
  const older = ledger('a', 100, 199, [ev(110), ev(150), ev(190)])
  const newer = ledger('b', 200, 299, [ev(210), ev(290)])
  const w = ledgerWindow([newer, older], 300, 140)
  assert.deepEqual(w.events.map((e) => e.ts), [150, 190, 210, 290])
  assert.equal(w.reachedTs, 100)
  assert.equal(w.used, 2)
})

test('window: two ledgers of the same log count once, and a backup of the live log gives only what the live read lost', () => {
  const backup = ledger('backup', 100, 150, [ev(110), ev(140)])
  const archive = ledger('archive', 100, 250, [ev(110), ev(140), ev(240)])
  assert.deepEqual(ledgerWindow([backup, archive], 300, 0).events.map((e) => e.ts), [110, 140, 240])
  // The live log still begins at 100 and its tail read starts at 130: the backup gives 110 only.
  assert.deepEqual(ledgerWindow([backup], 130, 0).events.map((e) => e.ts), [110])
  // An untruncated read of that live log reaches its first line, so the backup gives nothing.
  assert.deepEqual(ledgerWindow([backup], 100, 0).events, [])
})

test('window: the second the coverage starts in is left out, the safe way', () => {
  assert.deepEqual(ledgerWindow([ledger('a', 100, 200, [ev(150), ev(200)])], 200, 0).events.map((e) => e.ts), [150])
})

test('window: a dump newer than every ledger takes none of their lines, and the coverage still reaches it', () => {
  // The archive ended at 200 and the fresh log began at 300: nothing was written in between.
  const w = ledgerWindow([ledger('a', 100, 200, [ev(150)])], 300, 250)
  assert.deepEqual(w.events, [])
  assert.equal(w.reachedTs, 100)
})

test('window: no live line at all lets every ledger answer', () => {
  assert.deepEqual(ledgerWindow([ledger('a', 100, 200, [ev(150)])], Infinity, 0).events.map((e) => e.ts), [150])
})
