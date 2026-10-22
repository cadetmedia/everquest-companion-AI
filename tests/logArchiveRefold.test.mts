// ============================================================================
// logArchiveRefold.test.mts — folding a segment's archive again (log archive, steps 5.4 and 5.5).
// ============================================================================
//
// The comparison, the staging of an archive as an install, and the refresh's write, read back and
// swap. The second engine itself is exercised by `tests/e2e/log-archive-refold-trial.mts` against
// the real binary; here a refold that cannot start is enough to prove the temp folder goes.

import { after, test } from 'node:test'
import assert from 'node:assert/strict'
import { createHash } from 'node:crypto'
import { existsSync, mkdirSync, mkdtempSync, readFileSync, readdirSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { gzipSync } from 'node:zlib'
import { liveLogName, refoldSegment, stageSegmentLog, type RefoldResult } from '../src/main/logArchive/refold'
import { refreshSegment, sweepRefreshLeftovers } from '../src/main/logArchive/refresh'
import { listSegments, segmentPath, writeSegment } from '../src/main/logArchive/segmentStore'
import { compareModules, keepIdentity, stateDifference } from '../src/shared/logArchive/refoldCompare'
import { SEGMENT_VERSION, type Segment } from '../src/shared/logArchive/segment'

const sha = (b: Buffer | string): string => createHash('sha256').update(b).digest('hex')

const TOTALS = '[Sun Aug 02 15:12:05 2026] You have slain a gnoll!\r\n'
const GAP = '[Sun Aug 02 15:12:09 2026] You have slain a gnoll pup!\r\n'

function segmentWith(archivePath: string | null, over: Partial<Segment> = {}): Segment {
  return {
    v: SEGMENT_VERSION,
    id: 'primitive_freeport-20260802151205-52',
    character: 'primitive_freeport',
    state: 'sealed',
    log: {
      bytes: Buffer.byteLength(TOTALS),
      sha256: sha(TOTALS),
      headBytes: Buffer.byteLength(TOTALS),
      headSha256: sha(TOTALS),
      firstStamp: '2026-08-02 15:12:05',
      lastStamp: '2026-08-02 15:12:05'
    },
    producedBy: { app: '1.0.0', engine: '1.0.0' },
    archivePath,
    modules: {},
    ...over
  }
}

const roots: string[] = []
after(() => {
  for (const r of roots) rmSync(r, { recursive: true, force: true })
})

/** An archive holding the segment's lines followed by a line written during the move. */
function archiveFixture(): { root: string; archive: string } {
  const root = mkdtempSync(join(tmpdir(), 'logrefold-'))
  roots.push(root)
  const archive = join(root, 'eqlog_Primitive_freeport_2026-08-02_to_2026-08-02.log.gz')
  writeFileSync(archive, gzipSync(Buffer.from(TOTALS + GAP)))
  return { root, archive }
}

test('compare: the same states in another key order match', () => {
  const v = compareModules(
    { kills: { seq: 1, state: { mobs: { a: { count: 2 }, b: { count: 1 } } } } },
    { kills: { seq: 9, state: { mobs: { b: { count: 1 }, a: { count: 2 } } } } }
  )
  assert.deepEqual(v, [{ module: 'kills', same: true, detail: 'same' }])
})

test('compare: a difference names the first place and counts every value', () => {
  const d = stateDifference('loot', [{ item: 'Dagger', n: 1 }, { item: 'Rag', n: 1 }], [{ item: 'Dagger', n: 2 }, { item: 'Rag', n: 3 }, { item: 'X', n: 1 }])
  assert.equal(d?.first, '.length (2 vs 3)')
  assert.equal(d?.count, 3)
  const v = compareModules({ kills: { seq: 1, state: {} } }, { loot: { seq: 1, state: [] } })
  assert.deepEqual(v.map((x) => x.detail), ['only in the segment', 'only in the refold'])
})

test('compare: a key on one side only is a difference', () => {
  const d = stateDifference('kills', { mobs: {} }, { mobs: {}, extra: 1 })
  assert.equal(d?.first, 'extra (only in the refolded state)')
})

test('compare: the character module may name another log file', () => {
  const a = { character: { name: 'Primitive', logPath: 'C:/EQ/Logs/eqlog_Primitive_freeport.txt' } }
  const b = { character: { name: 'Primitive', logPath: 'C:/Temp/refold-1/Logs/eqlog_Primitive_freeport.txt' } }
  assert.equal(stateDifference('character', a, b), null)
  assert.notEqual(stateDifference('kills', a, b), null)
})

test('the live log name is read back off the archive name', () => {
  assert.equal(liveLogName(segmentWith('C:/a/eqlog_Primitive_freeport_2026-08-02_to_2026-08-03_2.log.gz')), 'eqlog_Primitive_freeport.txt')
  assert.equal(liveLogName(segmentWith('C:/a/eqlog_Some_Body_server_unknown_to_unknown.log.gz')), 'eqlog_Some_Body_server.txt')
  assert.equal(liveLogName(segmentWith('C:/a/odd.gz')), 'eqlog_primitive_freeport.txt')
})

test('staging keeps exactly the lines the totals were taken from', async () => {
  const { root, archive } = archiveFixture()
  const tables = join(root, 'eq')
  mkdirSync(tables)
  writeFileSync(join(tables, 'spells_us.txt'), 'x')
  const staged = await stageSegmentLog(segmentWith(archive), join(root, 'stage'), tables)
  assert.ok('logPath' in staged)
  assert.equal(readFileSync(staged.logPath, 'utf8'), TOTALS)
  assert.match(staged.logPath, /Logs[\\/]eqlog_Primitive_freeport\.txt$/)
  assert.equal(staged.tables, 1)
  assert.ok(existsSync(join(root, 'stage', 'spells_us.txt')))
})

test('staging refuses an archive that does not hold the captured lines', async () => {
  const { root, archive } = archiveFixture()
  const wrong = segmentWith(archive, { log: { ...segmentWith(archive).log, sha256: sha('something else') } })
  assert.deepEqual(await stageSegmentLog(wrong, join(root, 'stage'), null), { reason: 'its archive does not hold the lines its totals were taken from' })
  assert.deepEqual(await stageSegmentLog(segmentWith(join(root, 'gone.log.gz')), join(root, 'stage2'), null), { reason: 'its archive is missing' })
})

test('a refold that cannot start says why and leaves no temp folder', async () => {
  const { root, archive } = archiveFixture()
  const work = join(root, 'work')
  const r = await refoldSegment(segmentWith(archive), {
    bin: join(root, 'no-such-engine.exe'),
    spawn: () => {
      throw new Error('spawn failed')
    },
    tablesRoot: null,
    defines: [],
    clock: { utcOffsetMin: 0 },
    workRoot: work
  })
  assert.equal(r.ok, false)
  assert.equal(existsSync(work), false)
})

// ---- step 5.5: refresh ----

const STORED_LOG = 'C:/EQ/Logs/eqlog_Primitive_freeport.txt'

/** A sealed segment from an older build whose loot module lacks the one row its log holds. */
function olderSegment(): { dir: string; segment: Segment } {
  const { root, archive } = archiveFixture()
  const dir = join(root, 'archive')
  const segment = segmentWith(archive, {
    producedBy: { app: '0.9.0', engine: '0.9.0' },
    modules: {
      kills: { seq: 1, state: { mobs: { 'a gnoll': { count: 1 } } } },
      loot: { seq: 1, state: [] },
      character: { seq: 1, state: { character: { name: 'Primitive', logPath: STORED_LOG } } }
    }
  })
  writeSegment(dir, segment)
  return { dir, segment }
}

function refoldGiving(modules: Record<string, { seq: number; state: unknown }>): () => Promise<RefoldResult> {
  return async () => ({ ok: true, fold: { modules, foldMs: 1, events: 2 }, stageMs: 1, tables: 0 })
}

const NOW = { app: '1.0.0', engine: '1.0.0' }

const REFOLDED = {
  kills: { seq: 2, state: { mobs: { 'a gnoll': { count: 1 } } } },
  loot: { seq: 2, state: [{ ts: 1, item: 'Rusty Dagger' }] },
  character: { seq: 2, state: { character: { name: 'Primitive', logPath: 'C:/Temp/refold-1/Logs/eqlog_Primitive_freeport.txt' } } }
}

test('refresh: an older segment gains the event kind its build did not read', async () => {
  const { dir, segment } = olderSegment()
  const r = await refreshSegment(dir, segment.id, { refold: refoldGiving(REFOLDED), producedBy: () => NOW })
  assert.equal(r.ok, true)
  assert.deepEqual(r.ok && r.changed, ['loot'])
  const back = listSegments(dir).segments[0]
  assert.deepEqual(back.modules.loot.state, [{ ts: 1, item: 'Rusty Dagger' }])
  assert.deepEqual(back.producedBy, NOW)
  assert.equal((back.modules.character.state as { character: { logPath: string } }).character.logPath, STORED_LOG)
  assert.equal(back.extrasTriedBy, NOW.app)
  assert.deepEqual({ ...back, modules: {}, producedBy: segment.producedBy, extrasTriedBy: undefined }, { ...segment, modules: {}, extrasTriedBy: undefined })
  // The old file is kept beside it until the next launch, and only the swapped one is listed.
  const old = JSON.parse(readFileSync(`${segmentPath(dir, segment.id)}.old`, 'utf8')) as Segment
  assert.deepEqual(old, segment)
  assert.equal(listSegments(dir).segments.length, 1)
  assert.equal(sweepRefreshLeftovers(dir), 1)
  assert.equal(existsSync(`${segmentPath(dir, segment.id)}.old`), false)
})

test('refresh: allowed for a segment this version produced, refused with no archive', async () => {
  const { dir, segment } = olderSegment()
  const deps = { refold: refoldGiving(REFOLDED), producedBy: () => segment.producedBy }
  // A reading can change without the version moving, so the same version may read it again.
  assert.equal((await refreshSegment(dir, segment.id, deps)).ok, true)
  writeSegment(dir, { ...segment, id: 'no-archive', archivePath: null })
  assert.deepEqual(await refreshSegment(dir, 'no-archive', { ...deps, producedBy: () => NOW }), { ok: false, reason: 'it has no archive to read again' })
  assert.deepEqual(await refreshSegment(dir, 'missing', { ...deps, producedBy: () => NOW }), { ok: false, reason: 'that history was not found' })
})

test('refresh: this version may refresh its own segment when the segment lacks a module the engine has', async () => {
  const { dir, segment } = olderSegment()
  const r = await refreshSegment(dir, segment.id, { refold: refoldGiving(REFOLDED), producedBy: () => segment.producedBy })
  assert.equal(r.ok, true)
})

test('refresh: a refold that fails or loses a module leaves the segment as it was', async () => {
  const { dir, segment } = olderSegment()
  const before = readFileSync(segmentPath(dir, segment.id), 'utf8')
  const failing = async (): Promise<RefoldResult> => ({ ok: false, reason: 'the engine has not started' })
  assert.deepEqual(await refreshSegment(dir, segment.id, { refold: failing, producedBy: () => NOW }), { ok: false, reason: 'the engine has not started' })
  const lacking = refoldGiving({ kills: REFOLDED.kills, character: REFOLDED.character })
  assert.deepEqual(await refreshSegment(dir, segment.id, { refold: lacking, producedBy: () => NOW }), { ok: false, reason: 'the refold did not give back loot' })
  assert.equal(readFileSync(segmentPath(dir, segment.id), 'utf8'), before)
  assert.deepEqual(readdirSync(dir).sort(), [`${segment.id}.segment.json`])
})

test('keepIdentity puts the stored path back and changes neither input', () => {
  const stored = { character: { seq: 1, state: { character: { logPath: 'a' } } } }
  const refolded = { character: { seq: 2, state: { character: { logPath: 'b', level: 3 } } } }
  const out = keepIdentity(stored, refolded)
  assert.deepEqual(out.character.state, { character: { logPath: 'a', level: 3 } })
  assert.equal(refolded.character.state.character.logPath, 'b')
  assert.deepEqual(keepIdentity({}, { kills: { seq: 1, state: {} } }), { kills: { seq: 1, state: {} } })
})

test('refresh: the respawn history is taken again with the totals, and kept when the refold could not read it (step 4.14)', async () => {
  const { dir, segment } = olderSegment()
  const history = [{ id: 'guk::a gnoll', key: 'a gnoll', samples: 2 }]
  const giving = (h: unknown) => async (): Promise<RefoldResult> =>
    ({ ok: true, fold: { modules: REFOLDED, foldMs: 1, events: 2, respawnHistory: h }, stageMs: 1, tables: 0 }) as RefoldResult
  const r = await refreshSegment(dir, segment.id, { refold: giving(history), producedBy: () => NOW })
  assert.deepEqual(r.ok && r.changed, ['loot', 'respawn history'])
  assert.deepEqual(listSegments(dir).segments[0].respawnHistory, history)
  await refreshSegment(dir, segment.id, { refold: giving(null), producedBy: () => NOW })
  assert.deepEqual(listSegments(dir).segments[0].respawnHistory, history)
})

test('refresh: the fight summaries are taken again too, and kept when the refold could not read them (step 4.15)', async () => {
  const { dir, segment } = olderSegment()
  writeSegment(dir, { ...segment, fights: [{ id: 'e1', name: 'a gnoll', startTs: 1, kind: 'fight' } as never] })
  const fights = [{ id: 'e1', name: 'a gnoll', startTs: 1, kind: 'fight', total: 40 }]
  const giving = (f: unknown) => async (): Promise<RefoldResult> =>
    ({ ok: true, fold: { modules: REFOLDED, foldMs: 1, events: 2, fights: f }, stageMs: 1, tables: 0 }) as RefoldResult
  const r = await refreshSegment(dir, segment.id, { refold: giving(fights), producedBy: () => NOW })
  assert.deepEqual(r.ok && r.changed, ['loot', 'fights'])
  assert.deepEqual(listSegments(dir).segments[0].fights, fights)
  await refreshSegment(dir, segment.id, { refold: giving(null), producedBy: () => NOW })
  assert.deepEqual(listSegments(dir).segments[0].fights, fights)
})
