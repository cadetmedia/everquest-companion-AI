// ============================================================================
// logArchiveRotate.test.mts — capture, backup, rotation, recovery and restore (log archive, phases 2-3).
// ============================================================================
//
// Every test runs on a temp folder with a log written here. The rotation tests crash the sequence
// after each step and then run the launch recovery, and check the one promise the design makes:
// at every point the player's lines are either still in the live log or intact in the archive
// folder, and once recovery has run, the archive holds every byte the log held.

import { test } from 'node:test'
import assert from 'node:assert/strict'
import { createHash } from 'node:crypto'
import { appendFileSync, existsSync, mkdirSync, mkdtempSync, readFileSync, readdirSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { gunzipSync } from 'node:zlib'
import { readLogPrefix } from '../src/main/logArchive/logPrefix'
import { captureSegment, type CaptureDeps, type EngineHealth } from '../src/main/logArchive/capture'
import { archiveName, backupLog, sweepTemp } from '../src/main/logArchive/backup'
import { JOURNAL, readJournal, recoverRotation, restoreLog, rotateLog, type RotateDeps } from '../src/main/logArchive/rotate'
import { listSegments, writeSegment } from '../src/main/logArchive/segmentStore'
import { readHeadBytes } from '../src/main/logArchive/history'
import { eligibleSegments } from '../src/shared/logArchive/eligible'
import { driveOf, rotateBlockers } from '../src/shared/logArchive/preflight'
import { HEAD_BYTES, logStampKey, type Segment } from '../src/shared/logArchive/segment'

const sha = (b: Buffer | string): string => createHash('sha256').update(b).digest('hex')

const LINES = [
  '[Sun Aug 02 15:12:00 2026] You have gained a level! Welcome to level 18!',
  '[Sun Aug 02 15:12:05 2026] You have slain a gnoll!',
  '[Sun Aug 02 15:13:00 2026] You looted a Rusty Dagger from a gnoll\'s corpse.',
  '[Sun Aug 02 15:20:00 2026] You have slain a gnoll pup!'
]
const LOG_TEXT = LINES.join('\r\n') + '\r\n'

function fixture(): { root: string; logs: string; logPath: string; dir: string } {
  const root = mkdtempSync(join(tmpdir(), 'logrotate-'))
  const logs = join(root, 'Logs')
  const dir = join(root, 'archive')
  const logPath = join(logs, 'eqlog_Primitive_freeport.txt')
  mkdirSync(logs, { recursive: true })
  mkdirSync(dir, { recursive: true })
  writeFileSync(logPath, LOG_TEXT)
  return { root, logs, logPath, dir }
}

function captureDeps(logPath: string, over: Partial<CaptureDeps> = {}): CaptureDeps {
  const size = (): number => readFileSync(logPath).length
  return {
    on: () => true,
    attached: () => ({ character: 'primitive_freeport', logPath }),
    health: async () => ({ status: 'live', mark: { log: logPath, offset: size() }, events: 4 }),
    snapshot: async (m) => (m === 'loot' ? { seq: 4, state: [{ ts: 1, item: 'Rusty Dagger' }] } : m === 'nope' ? null : { seq: 1, state: {} }),
    fights: async () => [],
    readPrefix: readLogPrefix,
    producedBy: () => ({ app: '1.0.0', engine: '1.0.0' }),
    ...over
  }
}

const rotateDeps = (over: Partial<RotateDeps> = {}): RotateDeps => ({
  backup: backupLog,
  readPrefix: readLogPrefix,
  writeSegment,
  readSegment: (dir, id) => listSegments(dir).segments.find((s) => s.id === id) ?? null,
  ...over
})

async function captured(logPath: string): Promise<Segment> {
  const c = await captureSegment(captureDeps(logPath))
  assert.ok(c.ok, c.ok ? '' : c.reason)
  return c.segment
}

function archiveBytes(dir: string): Buffer {
  const gz = readdirSync(dir).filter((f) => f.endsWith('.log.gz'))
  assert.equal(gz.length, 1, `one archive in ${dir}: ${gz.join(', ')}`)
  return gunzipSync(readFileSync(join(dir, gz[0])))
}

// ── the prefix ──────────────────────────────────────────────────────────────────────────────────

test('prefix: hash, head and stamps of the first N bytes', async () => {
  const f = fixture()
  const p = await readLogPrefix(f.logPath, Buffer.byteLength(LOG_TEXT))
  assert.equal(p.sha256, sha(LOG_TEXT))
  assert.equal(p.headBytes, Buffer.byteLength(LOG_TEXT))
  assert.equal(p.headSha256, sha(LOG_TEXT))
  assert.equal(p.firstStamp, '2026-08-02 15:12:00')
  assert.equal(p.lastStamp, '2026-08-02 15:20:00')
})

test('prefix: lines added after the capture point change nothing', async () => {
  const f = fixture()
  const n = Buffer.byteLength(LOG_TEXT)
  appendFileSync(f.logPath, '[Sun Aug 02 16:00:00 2026] later\r\n')
  const p = await readLogPrefix(f.logPath, n)
  assert.equal(p.sha256, sha(LOG_TEXT))
  assert.equal(p.lastStamp, '2026-08-02 15:20:00')
})

test('prefix: a file shorter than the capture is refused', async () => {
  const f = fixture()
  await assert.rejects(readLogPrefix(f.logPath, 10_000), /shorter/)
})

test('prefix: a big log has a 64 KiB head', async () => {
  const f = fixture()
  writeFileSync(f.logPath, LOG_TEXT.repeat(2000))
  const p = await readLogPrefix(f.logPath, Buffer.byteLength(LOG_TEXT) * 2000)
  assert.equal(p.headBytes, HEAD_BYTES)
  assert.equal(p.headSha256, sha(readFileSync(f.logPath).subarray(0, HEAD_BYTES)))
})

// ── capture ─────────────────────────────────────────────────────────────────────────────────────

test('capture: every module the engine answers, at the engine read position, in state captured', async () => {
  const f = fixture()
  const s = await captured(f.logPath)
  assert.equal(s.state, 'captured')
  assert.equal(s.log.bytes, Buffer.byteLength(LOG_TEXT))
  assert.deepEqual(s.modules.loot, { seq: 4, state: [{ ts: 1, item: 'Rusty Dagger' }] })
  assert.ok(Object.keys(s.modules).length > 10)
  assert.match(s.id, /^primitive_freeport-20260802151200-\d+$/)
})

test('capture: refuses with the reason when off, unattached, folding, on another log, or empty', async () => {
  const f = fixture()
  const cases: [Partial<CaptureDeps>, RegExp][] = [
    [{ on: () => false }, /off/],
    [{ attached: () => null }, /no character/],
    [{ health: async () => ({ status: 'folding' }) }, /reading the log/],
    [{ health: async () => ({ status: 'live', mark: { log: 'C:/other.txt', offset: 5 } }) }, /not reading this/],
    [{ health: async () => ({ status: 'live', mark: { log: f.logPath, offset: 0 } }) }, /empty/]
  ]
  for (const [over, why] of cases) {
    const r = await captureSegment(captureDeps(f.logPath, over))
    assert.equal(r.ok, false)
    if (!r.ok) assert.match(r.reason, why)
  }
})

test('capture: a line landing mid-capture throws the capture away and takes it again', async () => {
  const f = fixture()
  let asks = 0
  const health = async (): Promise<EngineHealth> => {
    asks++
    return { status: 'live', mark: { log: f.logPath, offset: Buffer.byteLength(LOG_TEXT) }, events: asks < 3 ? asks : 9 }
  }
  const r = await captureSegment(captureDeps(f.logPath, { health }))
  assert.ok(r.ok)
  assert.equal(asks, 4, 'first pair differed, second pair agreed')
})

test('capture: a log that never holds still gives up and says so', async () => {
  const f = fixture()
  let n = 0
  const r = await captureSegment(captureDeps(f.logPath, { health: async () => ({ status: 'live', mark: { log: f.logPath, offset: 10 }, events: n++ }) }))
  assert.equal(r.ok, false)
  if (!r.ok) assert.match(r.reason, /kept growing/)
})

// ── backup ──────────────────────────────────────────────────────────────────────────────────────

test('backup: a verified compressed copy, with a name log discovery can never read as a character', async () => {
  const f = fixture()
  const s = await captured(f.logPath)
  const name = archiveName('eqlog_Primitive_freeport.txt', s.log.firstStamp, s.log.lastStamp)
  assert.equal(name, 'eqlog_Primitive_freeport_2026-08-02_to_2026-08-02.log.gz')
  assert.doesNotMatch(name, /\.txt$/i)
  const b = await backupLog({ source: f.logPath, bytes: s.log.bytes, expectSha256: s.log.sha256, dir: f.dir, name })
  assert.ok(b.ok)
  assert.equal(archiveBytes(f.dir).toString(), LOG_TEXT)
  assert.equal(readFileSync(f.logPath, 'utf8'), LOG_TEXT, 'the live log is untouched')
  const again = await backupLog({ source: f.logPath, bytes: s.log.bytes, expectSha256: s.log.sha256, dir: f.dir, name })
  assert.ok(again.ok && again.path.endsWith('_2.log.gz'), 'a taken name gets a number, never overwritten')
})

test('backup: bytes that do not match the capture leave nothing behind', async () => {
  const f = fixture()
  const b = await backupLog({ source: f.logPath, bytes: 20, expectSha256: sha('something else'), dir: f.dir, name: 'x.log.gz' })
  assert.equal(b.ok, false)
  assert.deepEqual(readdirSync(f.dir), [])
})

test('backup: a temporary file left by a crash is swept', () => {
  const f = fixture()
  writeFileSync(join(f.dir, 'x.log.gz.partial'), 'half')
  assert.equal(sweepTemp(f.dir), 1)
  assert.deepEqual(readdirSync(f.dir), [])
})

// ── rotation ────────────────────────────────────────────────────────────────────────────────────

test('rotate: the log moves into the archive, a fresh empty log is left, the history is sealed', async () => {
  const f = fixture()
  const s = await captured(f.logPath)
  const r = await rotateLog(f.logPath, f.dir, s, rotateDeps())
  assert.ok(r.ok, r.ok ? '' : r.reason)
  assert.equal(readFileSync(f.logPath).length, 0, 'fresh log')
  assert.equal(archiveBytes(f.dir).toString(), LOG_TEXT, 'every byte is in the archive')
  assert.equal(r.segment.state, 'sealed')
  assert.equal(r.segment.gapLines, 0)
  assert.equal(readJournal(f.dir), null)
  assert.deepEqual(readdirSync(f.dir).filter((x) => x.endsWith('.moving')), [], 'the moved file is gone once the archive is verified')
})

test('rotate: lines the game wrote between capture and move are archived and counted, not lost', async () => {
  const f = fixture()
  const s = await captured(f.logPath)
  appendFileSync(f.logPath, '[Sun Aug 02 15:20:01 2026] one\r\n[Sun Aug 02 15:20:01 2026] two\r\n')
  const r = await rotateLog(f.logPath, f.dir, s, rotateDeps())
  assert.ok(r.ok)
  assert.equal(r.segment.gapLines, 2)
  assert.match(archiveBytes(f.dir).toString(), /one\r\n.*two\r\n$/s)
})

test('rotate: a game that recreated the log first keeps its file; nothing is truncated', async () => {
  const f = fixture()
  const s = await captured(f.logPath)
  const deps = rotateDeps({
    crashAfter: (step) => {
      if (step === 'moved') writeFileSync(f.logPath, '[Sun Aug 02 15:21:00 2026] the game wrote first\r\n')
    }
  })
  const r = await rotateLog(f.logPath, f.dir, s, deps)
  assert.ok(r.ok)
  assert.match(readFileSync(f.logPath, 'utf8'), /the game wrote first/)
})

test('rotate: a log that cannot be moved changes nothing and says so', async () => {
  const f = fixture()
  const s = await captured(f.logPath)
  const r = await rotateLog(join(f.logs, 'missing.txt'), f.dir, s, rotateDeps())
  assert.equal(r.ok, false)
  if (!r.ok) {
    assert.equal(r.logTouched, false)
    assert.match(r.reason, /Nothing has changed/)
  }
  assert.equal(readJournal(f.dir), null)
  assert.equal(readFileSync(f.logPath, 'utf8'), LOG_TEXT)
})

test('rotate: a failed move leaves the history already kept from the same bytes as it was', async () => {
  const f = fixture()
  const s = await captured(f.logPath)
  const kept: Segment = { ...s, state: 'sealed', archivePath: join(f.dir, 'kept.log.gz') }
  writeSegment(f.dir, kept)
  const r = await rotateLog(join(f.logs, 'missing.txt'), f.dir, await captured(f.logPath), rotateDeps())
  assert.equal(r.ok, false)
  const after = listSegments(f.dir).segments.find((x) => x.id === s.id)
  assert.equal(after?.state, 'sealed')
  assert.equal(after?.archivePath, kept.archivePath)
})

for (const step of ['journal', 'moved', 'backed-up', 'sealed']) {
  test(`rotate: a crash after "${step}" is finished by the launch recovery, and no byte is lost`, async () => {
    const f = fixture()
    const s = await captured(f.logPath)
    const crashing = rotateDeps({
      crashAfter: (at) => {
        if (at === step) throw new Error(`simulated crash after ${at}`)
      }
    })
    await rotateLog(f.logPath, f.dir, s, crashing).catch(() => null)
    // Between the crash and the recovery, the lines are somewhere whole.
    const moving = readdirSync(f.dir).find((x) => x.endsWith('.moving'))
    const live = existsSync(f.logPath) ? readFileSync(f.logPath, 'utf8') : ''
    const held = moving !== undefined ? readFileSync(join(f.dir, moving), 'utf8') : ''
    const gz = readdirSync(f.dir).some((x) => x.endsWith('.log.gz'))
    assert.ok(live === LOG_TEXT || held === LOG_TEXT || gz, 'the lines are in the live log, the moved file, or a verified archive')

    const done = await recoverRotation(f.dir, rotateDeps())
    if (step === 'journal') {
      // Inside the process, a failure before the move is caught and the journal cleared.
      assert.equal(done, null)
      assert.equal(readFileSync(f.logPath, 'utf8'), LOG_TEXT)
      return
    }
    assert.match(done ?? '', /finished/)
    assert.equal(archiveBytes(f.dir).toString(), LOG_TEXT)
    assert.ok(existsSync(f.logPath), 'a live log exists again')
    assert.equal(readJournal(f.dir), null)
    assert.equal(listSegments(f.dir).segments[0].state, 'sealed')
  })
}

test('recovery: a process that died after the journal but before the move left the log untouched', async () => {
  const f = fixture()
  const j = { v: 1, logPath: f.logPath, movedPath: join(f.dir, 'x.moving'), segmentId: 'x', step: 'moving' }
  writeFileSync(join(f.dir, JOURNAL), JSON.stringify(j))
  assert.match((await recoverRotation(f.dir, rotateDeps())) ?? '', /nothing had changed/)
  assert.equal(readJournal(f.dir), null)
  assert.equal(readFileSync(f.logPath, 'utf8'), LOG_TEXT)
})

test('recovery: no journal means nothing to do', async () => {
  const f = fixture()
  assert.equal(await recoverRotation(f.dir, rotateDeps()), null)
  assert.ok(!existsSync(join(f.dir, JOURNAL)))
})

// ── after a rotation, the history is eligible ─────────────────────────────────────────────────────

test('after rotation: the sealed segment is shown against the fresh log, and held back in the session that sealed it', async () => {
  const f = fixture()
  const s = await captured(f.logPath)
  const r = await rotateLog(f.logPath, f.dir, s, rotateDeps())
  assert.ok(r.ok)
  appendFileSync(f.logPath, '[Mon Aug 03 09:00:00 2026] next day\r\n')
  const head = readHeadBytes(f.logPath, HEAD_BYTES)!
  const live = {
    headSha256: (n: number) => (head.length < n ? null : createHash('sha256').update(head.subarray(0, n)).digest('hex')),
    firstStamp: logStampKey(head.toString('latin1'))
  }
  const segments = listSegments(f.dir).segments
  const later = eligibleSegments({ segments, character: 'primitive_freeport', live, sealedThisAttach: new Set() })
  assert.deepEqual(later.shown.map((x) => x.id), [s.id])
  const now = eligibleSegments({ segments, character: 'primitive_freeport', live, sealedThisAttach: new Set([s.id]) })
  assert.deepEqual(now.held, [{ id: s.id, reason: 'sealed-this-attach' }])
})

// ── restore ─────────────────────────────────────────────────────────────────────────────────────

test('restore: the archive goes back in front of the fresh log, oldest first, byte for byte', async () => {
  const f = fixture()
  const s = await captured(f.logPath)
  const r = await rotateLog(f.logPath, f.dir, s, rotateDeps())
  assert.ok(r.ok)
  const fresh = '[Mon Aug 03 09:00:00 2026] after the archive\r\n'
  writeFileSync(f.logPath, fresh)
  const back = await restoreLog(f.logPath, f.dir, r.segment)
  assert.ok(back.ok, back.reason)
  assert.equal(readFileSync(f.logPath, 'utf8'), LOG_TEXT + fresh)
  assert.deepEqual(readdirSync(f.dir).filter((x) => x.endsWith('.restoring') || x.endsWith('.part')), [])
})

test('restore: an archive that does not unpack to its recorded bytes is refused', async () => {
  const f = fixture()
  const s = await captured(f.logPath)
  const r = await rotateLog(f.logPath, f.dir, s, rotateDeps())
  assert.ok(r.ok)
  const back = await restoreLog(f.logPath, f.dir, { ...r.segment, archiveSource: { bytes: 1, sha256: sha('x') } })
  assert.equal(back.ok, false)
  assert.equal(readFileSync(f.logPath).length, 0, 'the live log is left alone')
})

// ── preflight ───────────────────────────────────────────────────────────────────────────────────

test('preflight: every reason is stated, and none when all is well', () => {
  const ok = { on: true, hasLog: true, engineLive: true, sameDrive: true, freeBytes: 10, logBytes: 5, interrupted: false, busy: false }
  assert.deepEqual(rotateBlockers(ok), [])
  assert.equal(rotateBlockers({ ...ok, on: false, engineLive: false, sameDrive: false, freeBytes: 1, interrupted: true, busy: true }).length, 6)
  assert.equal(rotateBlockers({ ...ok, freeBytes: null }).length, 0, 'unknown free space does not block')
  assert.equal(rotateBlockers({ ...ok, archivedThisRun: true }).length, 1, 'one archive per app run')
})

test('preflight: drive of a path', () => {
  assert.equal(driveOf('c:\\Users\\x'), 'C:')
  assert.equal(driveOf('C:/Users/Public/Logs'), 'C:')
  assert.equal(driveOf('\\\\server\\share\\x'), '\\\\server\\share')
  assert.equal(driveOf('/home/x'), '/')
})
