// ============================================================================
// logArchiveFights.test.mts — fight summaries across an archive and the live log (log archive, 4.7-4.9).
// ============================================================================
//
// Capture keeps every fight's summary (ruling 0.4), the read path lists archived fights after the
// live ones under fresh ids, and an archived selection resolves to its summary and no breakdown.

import { test } from 'node:test'
import assert from 'node:assert/strict'
import { mkdtempSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { createHash } from 'node:crypto'
import type { CombatSnapshot, SegmentSummary } from '../src/shared/combat'
import { captureSegment, type CaptureDeps } from '../src/main/logArchive/capture'
import { createHistoryMerge } from '../src/main/logArchive/history'
import { writeSegment } from '../src/main/logArchive/segmentStore'
import {
  archivedFightRows,
  capturedFights,
  engineSideOpts,
  isArchivedFightId,
  withArchivedFights
} from '../src/shared/logArchive/mergeFights'
import { fightScopeOptions } from '../src/renderer/src/features/combat/dashboardData'
import { hitRow, rowTiming } from '../src/renderer/src/features/combat/fightPickerRows'
import { parseSegment, SEGMENT_VERSION, type Segment, type SegmentLog } from '../src/shared/logArchive/segment'

const sha = (s: string): string => createHash('sha256').update(s).digest('hex')

function fight(id: string, name: string, startTs: number, over: Partial<SegmentSummary> = {}): SegmentSummary {
  return {
    id,
    kind: 'fight',
    name,
    zone: 'Oasis',
    durationSec: 30,
    total: 900,
    dps: 30,
    activeSec: 25,
    activeDps: 36,
    startTs,
    active: false,
    enemyHealTotal: 0,
    ...over
  }
}

function segment(id: string, fights: SegmentSummary[] | undefined, head = 'head-of-log-A'): Segment {
  return {
    v: SEGMENT_VERSION,
    id,
    character: 'primitive_freeport',
    state: 'sealed',
    log: {
      bytes: 1000,
      sha256: sha('whole'),
      headBytes: head.length,
      headSha256: sha(head),
      firstStamp: '2026-08-01 10:00:00',
      lastStamp: '2026-08-10 22:00:00'
    },
    producedBy: { app: 'test', engine: 'test' },
    archivePath: `C:\\data\\log-archive\\eqlog_Primitive_freeport_${id}.log.gz`,
    modules: {},
    ...(fights === undefined ? {} : { fights })
  }
}

function snapshot(segments: SegmentSummary[], over: Partial<CombatSnapshot> = {}): CombatSnapshot {
  return {
    selectedId: 'e3',
    selected: null,
    segments,
    inCombat: false,
    recent: [],
    stance: {},
    poison: { coat: { combat: [] }, slow: { pulls: 0, landed: 0, noLand: 0, window: 0 } },
    zoneSessions: [],
    hydrating: false,
    roster: { members: [], seen: false, lastSignalTs: 0 },
    ...over
  }
}

const ZONE_ROW = fight('zone', 'Oasis', 0, { kind: 'zone' })

// ── capture ─────────────────────────────────────────────────────────────────────────────────────

test('capture: fights keep every fight, the open one as finished, and never the zone row', () => {
  const kept = capturedFights([
    fight('e9', 'a sand giant', 900, { kind: 'current', active: true }),
    fight('e8', 'a dervish', 800),
    ZONE_ROW,
    { id: 7 },
    null
  ])
  assert.deepEqual(kept.map((f) => [f.id, f.kind, f.active]), [['e9', 'fight', false], ['e8', 'fight', false]])
  assert.deepEqual(capturedFights(undefined), [])
})

function captureDeps(over: Partial<CaptureDeps> = {}): CaptureDeps & { order: string[] } {
  const order: string[] = []
  const log: SegmentLog = { bytes: 10, sha256: sha('x'), headBytes: 10, headSha256: sha('x'), firstStamp: '2026-08-01 10:00:00', lastStamp: '2026-08-01 11:00:00' }
  return {
    order,
    on: () => true,
    attached: () => ({ character: 'primitive_freeport', logPath: 'live.txt' }),
    health: async () => {
      order.push('health')
      return { status: 'live', mark: { log: 'live.txt', offset: 10 }, events: 4 }
    },
    snapshot: async () => null,
    fights: async () => {
      order.push('fights')
      return [fight('e1', 'a bat', 100)]
    },
    readPrefix: async () => log,
    producedBy: () => ({ app: '1.0.0', engine: '1.0.0' }),
    ...over
  }
}

test('capture: the fights are taken inside the before/after pair and stored on the segment', async () => {
  const deps = captureDeps()
  const r = await captureSegment(deps)
  assert.ok(r.ok)
  if (r.ok) assert.deepEqual(r.segment.fights?.map((f) => f.id), ['e1'])
  assert.deepEqual(deps.order, ['health', 'fights', 'health'])
})

test('capture: an engine with no fight list leaves the field out, as before step 4.7', async () => {
  const r = await captureSegment(captureDeps({ fights: async () => null }))
  assert.ok(r.ok)
  if (r.ok) assert.equal('fights' in r.segment, false)
})

test('segment: one without fights still parses; a malformed fight list is refused', () => {
  assert.ok(parseSegment(segment('old', undefined)).ok)
  assert.ok(parseSegment(segment('new', [fight('e1', 'a bat', 1)])).ok)
  const bad = parseSegment({ ...segment('bad', undefined), fights: [{ id: 'e1' }] })
  assert.equal(bad.ok, false)
  assert.equal(parseSegment({ ...segment('bad', undefined), fights: {} }).ok, false)
})

// ── rows ────────────────────────────────────────────────────────────────────────────────────────

test('rows: archived ids never collide with live ones or with each other, and carry the archive name', () => {
  const rows = archivedFightRows([
    segment('seg-a', [fight('e1', 'a bat', 100), fight('e2', 'a rat', 300)]),
    segment('seg-b', [fight('e1', 'a bat', 200)]),
    segment('seg-c', undefined)
  ])
  assert.deepEqual(rows.map((r) => r.id), ['arch:seg-a:e2', 'arch:seg-b:e1', 'arch:seg-a:e1'])
  assert.equal(rows[0].archive, 'eqlog_Primitive_freeport_seg-a.log.gz')
  assert.ok(rows.every((r) => isArchivedFightId(r.id)))
  assert.equal(isArchivedFightId('e1'), false)
  assert.equal(isArchivedFightId(undefined), false)
})

// ── the snapshot ────────────────────────────────────────────────────────────────────────────────

const ROWS = archivedFightRows([segment('seg-a', [fight('e1', 'an old bat', 100), fight('e2', 'an old rat', 200)])])

test('snapshot: not asked for, or nothing archived, the same object comes back', () => {
  const snap = snapshot([fight('e3', 'a bat', 5000), ZONE_ROW])
  assert.equal(withArchivedFights(snap, ROWS, {}), snap)
  assert.equal(withArchivedFights(snap, [], { archived: true }), snap)
})

test('snapshot: archived fights follow the live ones, before the zone row, newest first', () => {
  const live = fight('e3', 'a bat', 5000)
  const current = fight('e4', 'a cat', 6000, { kind: 'current', active: true })
  const out = withArchivedFights(snapshot([current, live, ZONE_ROW]), ROWS, { archived: true })
  assert.deepEqual(out.segments.map((s) => s.id), ['e4', 'e3', 'arch:seg-a:e2', 'arch:seg-a:e1', 'zone'])
})

test('snapshot: archived fights only fill the page the live log leaves', () => {
  const lives = [fight('e3', 'a bat', 5000), fight('e2', 'a bat', 4000)]
  const ids = (max: number): string[] =>
    withArchivedFights(snapshot([...lives, ZONE_ROW]), ROWS, { archived: true, maxSegments: max }).segments.map((s) => s.id)
  assert.deepEqual(ids(2), ['e3', 'e2', 'zone'])
  assert.deepEqual(ids(3), ['e3', 'e2', 'arch:seg-a:e2', 'zone'])
})

test('snapshot: an archived selection resolves to its summary and no breakdown', () => {
  const opts = { archived: true, selectedId: 'arch:seg-a:e1', timeline: true }
  assert.deepEqual(engineSideOpts(opts), { archived: true, selectedId: undefined, timeline: true })
  const live = snapshot([fight('e3', 'a bat', 5000)], { timeline: null })
  const out = withArchivedFights(live, ROWS, opts)
  assert.equal(out.selectedId, 'arch:seg-a:e1')
  assert.equal(out.selected, null)
  assert.equal(out.timeline, null)
  assert.equal(out.archivedSelected?.name, 'an old bat')
  assert.equal(out.archivedSelected?.archive, 'eqlog_Primitive_freeport_seg-a.log.gz')
  const plain = { selectedId: 'e3' }
  assert.equal(engineSideOpts(plain), plain)
})

// ── the read path ───────────────────────────────────────────────────────────────────────────────

function history(on: boolean, segments: Segment[], head = '[Wed Aug 12 09:00:00 2026] fresh log\n') {
  const dir = mkdtempSync(join(tmpdir(), 'logarchive-fights-'))
  for (const s of segments) writeSegment(dir, s)
  let dirReads = 0
  const h = createHistoryMerge({
    on: () => on,
    dir: () => {
      dirReads++
      return dir
    },
    attached: () => ({ character: 'primitive_freeport', logPath: 'live.txt' }),
    readHead: (_p, n) => Buffer.from(head).subarray(0, n),
    note: () => undefined
  })
  return { h, dirReads: () => dirReads }
}

test('read path: archived fights only with the switch on, only from eligible segments, built once', () => {
  const kept = segment('seg-a', [fight('e1', 'an old bat', 100)])
  const off = history(false, [kept])
  assert.deepEqual(off.h.archivedFights(), [])
  assert.equal(off.dirReads(), 0)
  const on = history(true, [kept])
  const rows = on.h.archivedFights()
  assert.deepEqual(rows.map((r) => r.id), ['arch:seg-a:e1'])
  assert.equal(on.h.archivedFights(), rows, 'the same list while the context holds')
  const stillLive = history(true, [kept], 'head-of-log-A and the rest of it')
  assert.deepEqual(stillLive.h.archivedFights(), [], 'the live log still holds those fights')
})

// ── the picker ──────────────────────────────────────────────────────────────────────────────────

test('picker: the pinned head row is the live log’s, never an archived fight', () => {
  const live = withArchivedFights(snapshot([fight('e3', 'a bat', 5000), ZONE_ROW]), ROWS, { archived: true })
  const a = fightScopeOptions(live.segments)
  assert.equal(a.head?.name, 'a bat')
  assert.deepEqual(a.rest.map((o) => [o.value, o.archive]), [
    ['arch:seg-a:e2', 'eqlog_Primitive_freeport_seg-a.log.gz'],
    ['arch:seg-a:e1', 'eqlog_Primitive_freeport_seg-a.log.gz']
  ])
  const fresh = withArchivedFights(snapshot([ZONE_ROW]), ROWS, { archived: true })
  const b = fightScopeOptions(fresh.segments)
  assert.equal(b.head, null, 'a fresh log has no last fight, whatever the archive holds')
  assert.deepEqual(b.rest.map((o) => o.value), ['arch:seg-a:e2', 'arch:seg-a:e1'])
})

test('picker: an archived row says so before its timing, in the list, the trigger and a search hit', () => {
  const [opt] = fightScopeOptions(withArchivedFights(snapshot([ZONE_ROW]), ROWS, { archived: true }).segments).rest
  assert.match(rowTiming(opt, 'fight', Date.now()), /^archived · /)
  assert.match(hitRow({ summary: ROWS[0], score: 1 }).timing, /^archived · /)
  const live = fight('e3', 'a bat', 5000)
  assert.doesNotMatch(hitRow({ summary: live, score: 1 }).timing, /archived/)
})
