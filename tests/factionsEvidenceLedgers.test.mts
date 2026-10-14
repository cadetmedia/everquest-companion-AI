// ============================================================================
// factionsEvidenceLedgers.test.mts — the Factions tab reads an archived log's faction lines from
// the ledgers the log archive leaves (log archive step 4.16, shared/factionLedger.ts).
// ============================================================================
//
// A real folder laid out as the game's: `Logs/eqlog_….txt` and `Logs/companion-archive/`. Times are
// built with `parseEqTimestamp` itself, so the tests hold on any host zone.

import { test } from 'node:test'
import assert from 'node:assert/strict'
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { readFactionEvidence, readLedgers } from '../src/main/factionsEvidence'
import { parseFactionLogLine } from '../src/shared/factionLog'
import { FACTION_LEDGER_DIR, LedgerBuilder, ledgerEventOf, ledgerFileName, type FactionLedger } from '../src/shared/factionLedger'
import { parseEqTimestamp } from '../src/shared/spellKey'

const at = (hms: string): number => parseEqTimestamp(`Sun Aug 02 ${hms} 2026`)
const line = (hms: string, text: string): string => `[Sun Aug 02 ${hms} 2026] ${text}`
const adj = (who: string, n: number): string => `Your faction standing with ${who} has been adjusted by ${n}.`
const best = (who: string): string => `Your faction standing with ${who} could not possibly get any better.`

const LOG = 'eqlog_Primitive_freeport.txt'

function ledgerOf(lines: string[], segment: string, log = LOG): FactionLedger {
  const b = new LedgerBuilder()
  for (const l of lines) b.add(l)
  return b.build(log, segment)
}

/** A game folder with a live log and the given ledgers beside it. */
function install(live: string[], ledgers: FactionLedger[]): string {
  const logs = join(mkdtempSync(join(tmpdir(), 'factionledgers-')), 'Logs')
  mkdirSync(join(logs, FACTION_LEDGER_DIR), { recursive: true })
  const logPath = join(logs, LOG)
  writeFileSync(logPath, live.map((l) => `${l}\r\n`).join(''))
  for (const l of ledgers) writeFileSync(join(logs, FACTION_LEDGER_DIR, ledgerFileName(l.segment)), JSON.stringify(l))
  return logPath
}

const ARCHIVED = [
  line('10:00:00', 'You are hungry.'),
  line('10:05:00', adj('Heretics', -5)),
  line('10:06:00', adj('Heretics', -5)),
  line('10:07:00', best('Ring of Scale'))
]

test('an archived stretch after the dump is joined to the live log, and the window reaches the dump', async () => {
  const logPath = install([line('11:00:00', 'You are hungry.'), line('11:01:00', adj('Heretics', -2))], [ledgerOf(ARCHIVED, 'seg-1')])
  const r = await readFactionEvidence(logPath, at('10:05:30'))
  assert.ok(r)
  assert.equal(r.complete, true)
  const by = new Map(r.rows.map((x) => [x.name, x]))
  assert.deepEqual(by.get('Heretics'), { name: 'Heretics', cap: null, sum: -7, hits: 2 })
  assert.equal(by.get('Ring of Scale')?.cap, 'high')
})

test('a dump older than every archive is not complete: the lines before the first archive are gone', async () => {
  const logPath = install([line('11:00:00', 'You are hungry.')], [ledgerOf(ARCHIVED, 'seg-1')])
  const r = await readFactionEvidence(logPath, at('09:00:00'))
  assert.equal(r?.complete, false)
})

test('with no ledger the reader is what it was: an untruncated live log is complete', async () => {
  const logPath = install([line('11:00:00', adj('Heretics', 1))], [])
  const r = await readFactionEvidence(logPath, at('09:00:00'))
  assert.equal(r?.complete, true)
  assert.deepEqual(r?.rows, [{ name: 'Heretics', cap: null, sum: 1, hits: 1 }])
})

test('a ledger of another character, or one that does not parse, is skipped', () => {
  const logPath = install([], [ledgerOf(ARCHIVED, 'seg-mine'), ledgerOf(ARCHIVED, 'seg-other', 'eqlog_Someone_else.txt')])
  writeFileSync(join(logPath, '..', FACTION_LEDGER_DIR, 'broken.factions.json'), '{ not json')
  assert.deepEqual(readLedgers(logPath).map((l) => l.segment), ['seg-mine'])
})

test('a backup of the live log beside the live log counts nothing twice', async () => {
  const live = [line('10:00:00', 'You are hungry.'), line('10:05:00', adj('Heretics', -5))]
  const logPath = install(live, [ledgerOf(live, 'backup')])
  const r = await readFactionEvidence(logPath, at('09:00:00'))
  assert.deepEqual(r?.rows, [{ name: 'Heretics', cap: null, sum: -5, hits: 1 }])
})

test('the ledger reads a line exactly as the tab does (the reading is restated there)', () => {
  const lines = [
    adj('Heretics', -5),
    'Your faction standing with Kerra has been adjusted by (+12).',
    best('Ring of Scale'),
    'Your faction standing with Agents of Mistmoore could not possibly get any worse.',
    'You have slain a gnoll!'
  ]
  for (const l of lines) {
    const a = parseFactionLogLine(l)
    const b = ledgerEventOf(l, 1)
    if (a === null) assert.equal(b, null, l)
    else assert.deepEqual(a, b === null ? null : b.kind === 'adjust' ? { name: b.name, kind: b.kind, amount: b.amount } : { name: b.name, kind: b.kind, cap: b.cap }, l)
  }
})

test('a live log just archived (empty, or not yet recreated) still reads the ledgers', async () => {
  const logPath = install([], [ledgerOf(ARCHIVED, 'seg-1')])
  const empty = await readFactionEvidence(logPath, at('10:05:30'))
  assert.equal(empty?.complete, true)
  assert.deepEqual(empty?.rows.find((x) => x.name === 'Heretics'), { name: 'Heretics', cap: null, sum: -5, hits: 1 })
  rmSync(logPath)
  const missing = await readFactionEvidence(logPath, at('10:05:30'))
  assert.deepEqual(missing, empty)
})

test('with neither a live log nor a ledger there is nothing to report', async () => {
  const logPath = install([], [])
  assert.equal(await readFactionEvidence(logPath, at('09:00:00')), null)
})

test('the recent tally reads the live log from its own start, whatever the dump age, and only when asked', async () => {
  const logPath = install(
    [line('11:00:00', adj('Heretics', -2)), line('11:20:00', adj('Heretics', -3)), line('11:21:00', best('Ring of Scale'))],
    []
  )
  // The dump was written after every line: nothing corrects it, yet the last half hour still moved.
  const r = await readFactionEvidence(logPath, at('12:00:00'), at('11:10:00'))
  assert.ok(r)
  assert.deepEqual(r.rows, [])
  assert.equal(r.recentFromMs, at('11:10:00'))
  assert.deepEqual(r.recent, [
    { name: 'Heretics', hits: 1, net: -3, lastTs: at('11:20:00') },
    { name: 'Ring of Scale', hits: 1, net: 0, lastTs: at('11:21:00') }
  ])
  assert.equal((await readFactionEvidence(logPath, at('12:00:00')))?.recent, undefined)
})
