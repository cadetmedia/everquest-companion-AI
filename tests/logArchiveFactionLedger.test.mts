// ============================================================================
// logArchiveFactionLedger.test.mts — the archive step keeps the moved log's faction lines beside
// the segment (log archive, step 4.16). The format and the window rule are tested in
// factionLedger.test.mts; this is the fs half and its place in the rotation.
// ============================================================================

import { test } from 'node:test'
import assert from 'node:assert/strict'
import { appendFileSync, existsSync, mkdirSync, mkdtempSync, readFileSync, readdirSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { gzipSync } from 'node:zlib'
import { readLogPrefix } from '../src/main/logArchive/logPrefix'
import { captureSegment } from '../src/main/logArchive/capture'
import { backupLog } from '../src/main/logArchive/backup'
import { buildFactionLedger, logNameOf, writeFactionLedger } from '../src/main/logArchive/factionLedgerFile'
import { recoverRotation, rotateLog, type RotateDeps } from '../src/main/logArchive/rotate'
import { listSegments, writeSegment } from '../src/main/logArchive/segmentStore'
import { ledgerFileName, parseLedger } from '../src/shared/factionLedger'
import type { Segment } from '../src/shared/logArchive/segment'

const LINES = [
  '[Sun Aug 02 15:12:00 2026] You have slain a gnoll!',
  '[Sun Aug 02 15:12:01 2026] Your faction standing with Heretics has been adjusted by -5.',
  '[Sun Aug 02 15:12:01 2026] Your faction standing with Ring of Scale could not possibly get any better.',
  '[Sun Aug 02 15:13:00 2026] Your faction standing with Ring of Scale could not possibly get any better.'
]
const LOG_TEXT = LINES.join('\r\n') + '\r\n'

function fixture(): { logPath: string; dir: string } {
  const root = mkdtempSync(join(tmpdir(), 'logledger-'))
  const logs = join(root, 'Logs')
  const dir = join(root, 'archive')
  mkdirSync(logs, { recursive: true })
  mkdirSync(dir, { recursive: true })
  const logPath = join(logs, 'eqlog_Primitive_freeport.txt')
  writeFileSync(logPath, LOG_TEXT)
  return { logPath, dir }
}

async function captured(logPath: string): Promise<Segment> {
  const c = await captureSegment({
    on: () => true,
    attached: () => ({ character: 'primitive_freeport', logPath }),
    health: async () => ({ status: 'live', mark: { log: logPath, offset: readFileSync(logPath).length }, events: 4 }),
    snapshot: async () => ({ seq: 1, state: {} }),
    fights: async () => [],
    readPrefix: readLogPrefix,
    producedBy: () => ({ app: '1.0.0', engine: '1.0.0' })
  })
  assert.ok(c.ok)
  return c.segment
}

const deps = (over: Partial<RotateDeps> = {}): RotateDeps => ({
  backup: backupLog,
  readPrefix: readLogPrefix,
  writeSegment,
  readSegment: (dir, id) => listSegments(dir).segments.find((s) => s.id === id) ?? null,
  factionLedger: async (dir, id, source) => {
    await writeFactionLedger(dir, id, source)
  },
  ...over
})

function ledgerOf(dir: string, id: string) {
  return parseLedger(JSON.parse(readFileSync(join(dir, ledgerFileName(id)), 'utf8')))
}

test('rotate: the moved log\u2019s faction lines are kept beside the segment, the lines written during the move too', async () => {
  const f = fixture()
  const s = await captured(f.logPath)
  appendFileSync(f.logPath, '[Sun Aug 02 15:20:01 2026] Your faction standing with Kerra has been adjusted by 3.\r\n')
  const r = await rotateLog(f.logPath, f.dir, s, deps())
  assert.ok(r.ok)
  const l = ledgerOf(f.dir, s.id)
  assert.ok(l)
  assert.equal(l.log, 'eqlog_Primitive_freeport.txt')
  assert.equal(l.segment, s.id)
  assert.deepEqual(l.events.map((e) => [e.name, e.kind]), [
    ['Heretics', 'adjust'],
    ['Ring of Scale', 'cap'],
    ['Kerra', 'adjust']
  ])
})

test('rotate: a ledger that cannot be written never stops the archive', async () => {
  const f = fixture()
  const s = await captured(f.logPath)
  const r = await rotateLog(f.logPath, f.dir, s, deps({ factionLedger: () => Promise.reject(new Error('disk full')) }))
  assert.ok(r.ok)
  assert.equal(listSegments(f.dir).segments[0].state, 'sealed')
  assert.equal(existsSync(join(f.dir, ledgerFileName(s.id))), false)
})

test('recovery: an archive interrupted after sealing still keeps the ledger from the moved file', async () => {
  const f = fixture()
  const s = await captured(f.logPath)
  const crashing = deps({
    crashAfter: (at) => {
      if (at === 'sealed') throw new Error('simulated crash')
    }
  })
  await rotateLog(f.logPath, f.dir, s, crashing).catch(() => null)
  assert.equal(existsSync(join(f.dir, ledgerFileName(s.id))), false)
  await recoverRotation(f.dir, deps())
  assert.equal(ledgerOf(f.dir, s.id)?.events.length, 2)
  assert.deepEqual(readdirSync(f.dir).filter((x) => x.endsWith('.moving')), [])
})

test('the compressed archive gives the same ledger as the moved file, as Refresh reads it', async () => {
  const root = mkdtempSync(join(tmpdir(), 'logledger-'))
  const plain = join(root, 'moved.txt')
  const gz = join(root, 'archive.log.gz')
  writeFileSync(plain, LOG_TEXT)
  writeFileSync(gz, gzipSync(Buffer.from(LOG_TEXT)))
  const a = await buildFactionLedger({ path: plain, gz: false, logName: 'eqlog_Primitive_freeport.txt' }, 'seg')
  const b = await buildFactionLedger({ path: gz, gz: true, logName: 'eqlog_Primitive_freeport.txt' }, 'seg')
  assert.deepEqual(a, b)
  assert.equal(a.events.length, 2)
})

test('the live log name, either slash', () => {
  assert.equal(logNameOf('C:\\EQ\\Logs\\eqlog_Primitive_freeport.txt'), 'eqlog_Primitive_freeport.txt')
  assert.equal(logNameOf('/eq/Logs/eqlog_Primitive_freeport.txt'), 'eqlog_Primitive_freeport.txt')
})
