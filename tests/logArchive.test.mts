// ============================================================================
// logArchive.test.mts — the switch, segments, eligibility and the read path (log archive, phase 1).
// ============================================================================
//
// The plan is docs/plans/log-archive. Phase 1 is inert: with the switch off, or with no sealed
// segment on disk, every read returns exactly what the engine served. These tests hold that, and
// hold the eligibility rule that keeps anything from being counted twice once segments exist.

import { test } from 'node:test'
import assert from 'node:assert/strict'
import { createHash } from 'node:crypto'
import { mkdtempSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { normalizeLogArchivePrefs } from '../src/shared/logArchive/prefs'
import { HEAD_BYTES, logStampKey, parseSegment, SEGMENT_VERSION, type Segment } from '../src/shared/logArchive/segment'
import { eligibleSegments, type LiveLog } from '../src/shared/logArchive/eligible'
import { listSegments, segmentPath, writeSegment } from '../src/main/logArchive/segmentStore'
import { createHistoryMerge, readHeadBytes, type HistoryDeps } from '../src/main/logArchive/history'

const sha = (s: string | Buffer): string => createHash('sha256').update(s).digest('hex')

function segment(over: Partial<Segment> & { head?: string; first?: string; last?: string; bytes?: number } = {}): Segment {
  const head = over.head ?? 'head-of-log-A'
  return {
    v: SEGMENT_VERSION,
    id: over.id ?? 'seg-a',
    character: over.character ?? 'primitive_freeport',
    state: over.state ?? 'sealed',
    log: {
      bytes: over.bytes ?? 1000,
      sha256: sha('whole'),
      headBytes: head.length,
      headSha256: sha(head),
      firstStamp: over.first ?? '2026-08-01 10:00:00',
      lastStamp: over.last ?? '2026-08-10 22:00:00'
    },
    producedBy: { app: 'test', engine: 'test' },
    archivePath: null,
    modules: over.modules ?? {}
  }
}

/** A live log whose bytes are `text`. */
function live(text: string): LiveLog {
  const b = Buffer.from(text, 'latin1')
  const firstLine = text.split('\n').find((l) => logStampKey(l) !== null)
  return {
    headSha256: (n) => (b.length < n ? null : sha(b.subarray(0, n))),
    firstStamp: firstLine === undefined ? null : logStampKey(firstLine)
  }
}

const FRESH = '[Wed Aug 12 09:00:00 2026] Welcome to EverQuest!\n'
const run = (segments: Segment[], log: LiveLog, sealed: string[] = []) =>
  eligibleSegments({ segments, character: 'primitive_freeport', live: log, sealedThisAttach: new Set(sealed) })

// ── the switch ──────────────────────────────────────────────────────────────────────────────────

test('switch: absent, malformed or anything but true reads as off', () => {
  for (const raw of [undefined, null, {}, { enabled: 'true' }, { enabled: 1 }, 'on', []]) {
    assert.equal(normalizeLogArchivePrefs(raw).enabled, false, JSON.stringify(raw))
  }
  assert.equal(normalizeLogArchivePrefs({ enabled: true }).enabled, true)
})

// ── segments ────────────────────────────────────────────────────────────────────────────────────

test('segment: a written segment reads back the same', () => {
  const dir = mkdtempSync(join(tmpdir(), 'logarchive-'))
  const s = segment({ modules: { loot: { seq: 3, state: [{ ts: 1, item: 'x' }] } } })
  writeSegment(dir, s)
  const got = listSegments(dir)
  assert.deepEqual(got.segments, [s])
  assert.deepEqual(got.skipped, [])
})

test('segment: a missing folder is empty, not an error', () => {
  assert.deepEqual(listSegments(join(tmpdir(), 'logarchive-does-not-exist-9f3a')), { segments: [], skipped: [] })
})

test('segment: a newer version, a truncated file and a renamed file are skipped and reported', () => {
  const dir = mkdtempSync(join(tmpdir(), 'logarchive-'))
  writeFileSync(segmentPath(dir, 'newer'), JSON.stringify({ ...segment({ id: 'newer' }), v: SEGMENT_VERSION + 1 }))
  writeFileSync(segmentPath(dir, 'cut'), JSON.stringify(segment({ id: 'cut' })).slice(0, 40))
  writeFileSync(segmentPath(dir, 'renamed'), JSON.stringify(segment({ id: 'other' })))
  writeFileSync(join(dir, 'notes.txt'), 'not a segment')
  const got = listSegments(dir)
  assert.equal(got.segments.length, 0)
  const reasons = Object.fromEntries(got.skipped.map((s) => [s.file, s.reason]))
  assert.match(reasons['newer.segment.json'], /newer than this build/)
  assert.match(reasons['cut.segment.json'], /unreadable/)
  assert.match(reasons['renamed.segment.json'], /does not match/)
  assert.equal(Object.keys(reasons).length, 3)
})

test('segment: listing for one character leaves the others out', () => {
  const dir = mkdtempSync(join(tmpdir(), 'logarchive-'))
  writeSegment(dir, segment({ id: 'mine' }))
  writeSegment(dir, segment({ id: 'theirs', character: 'someone_else' }))
  assert.deepEqual(listSegments(dir, 'primitive_freeport').segments.map((s) => s.id), ['mine'])
})

test('segment: an id that could leave the folder is refused', () => {
  assert.throws(() => segmentPath('x', '../escape'))
  assert.throws(() => segmentPath('x', '.hidden'))
})

test('segment: parse names what is wrong', () => {
  assert.deepEqual(parseSegment(null), { ok: false, reason: 'not an object' })
  const bad = { ...segment(), state: 'half-done' }
  assert.deepEqual(parseSegment(bad), { ok: false, reason: 'unknown state' })
  const badHash = segment()
  badHash.log.sha256 = 'nope'
  assert.equal(parseSegment(badHash).ok, false)
})

test('stamp: a log line becomes a sortable wall-clock key', () => {
  assert.equal(logStampKey('[Sat Oct 03 18:47:03 2026] You say, hi'), '2026-10-03 18:47:03')
  assert.equal(logStampKey('no stamp here'), null)
  assert.ok(logStampKey('[Fri Jan 02 00:00:00 2027] x')! > logStampKey('[Thu Dec 31 23:59:59 2026] x')!)
})

// ── eligibility ─────────────────────────────────────────────────────────────────────────────────

test('eligible: a sealed segment is shown once the live log no longer contains it', () => {
  const r = run([segment()], live(FRESH))
  assert.deepEqual(r.shown.map((s) => s.id), ['seg-a'])
  assert.deepEqual(r.held, [])
})

test('eligible: rule 1, another character or an unsealed segment is never considered', () => {
  const r = run([segment({ id: 'x', character: 'other_server' }), segment({ id: 'y', state: 'backed-up' })], live(FRESH))
  assert.deepEqual(r, { shown: [], held: [] })
})

test('eligible: rule 2, a live log that begins with the segment holds it back', () => {
  const r = run([segment()], live('head-of-log-A and everything since'))
  assert.deepEqual(r.held, [{ id: 'seg-a', reason: 'live-log-contains-it' }])
  assert.deepEqual(r.shown, [])
})

test('eligible: rule 3, a live log starting before the segment ended may overlap and is held back', () => {
  const r = run([segment()], live('[Wed Aug 05 09:00:00 2026] trimmed by hand\n'))
  assert.deepEqual(r.held, [{ id: 'seg-a', reason: 'overlaps-live-log' }])
})

test('eligible: rule 3, the same second is not an overlap (a live archive starts the next line at once)', () => {
  const r = run([segment()], live('[Mon Aug 10 22:00:00 2026] next line\n'))
  assert.deepEqual(r.shown.map((s) => s.id), ['seg-a'])
})

test('eligible: rule 4, a segment sealed during this attach is held back', () => {
  const r = run([segment()], live(FRESH), ['seg-a'])
  assert.deepEqual(r.held, [{ id: 'seg-a', reason: 'sealed-this-attach' }])
})

test('eligible: rule 5, two captures of the same log show only the longer', () => {
  const early = segment({ id: 'early', bytes: 500, last: '2026-08-05 00:00:00' })
  const later = segment({ id: 'later', bytes: 1000 })
  for (const order of [[early, later], [later, early]]) {
    const r = run(order, live(FRESH))
    assert.deepEqual(r.shown.map((s) => s.id), ['later'])
    assert.deepEqual(r.held, [{ id: 'early', reason: 'contained-in-a-later-archive' }])
  }
})

test('eligible: rule 5, archives overlapping in time without a shared head hold the later back', () => {
  const a = segment({ id: 'a', head: 'log one', first: '2026-08-01 00:00:00', last: '2026-08-10 00:00:00' })
  const b = segment({ id: 'b', head: 'log two', first: '2026-08-09 00:00:00', last: '2026-08-11 00:00:00' })
  const r = run([b, a], live(FRESH))
  assert.deepEqual(r.shown.map((s) => s.id), ['a'])
  assert.deepEqual(r.held, [{ id: 'b', reason: 'overlaps-another-archive' }])
})

test('eligible: segments given in the wrong order are shown oldest first', () => {
  const a = segment({ id: 'a', head: 'one', first: '2026-07-01 00:00:00', last: '2026-07-31 00:00:00' })
  const b = segment({ id: 'b', head: 'two', first: '2026-08-01 00:00:00', last: '2026-08-10 00:00:00' })
  assert.deepEqual(run([b, a], live(FRESH)).shown.map((s) => s.id), ['a', 'b'])
})

test('eligible: an empty live log contains nothing and overlaps nothing', () => {
  assert.deepEqual(run([segment()], live('')).shown.map((s) => s.id), ['seg-a'])
})

test('eligible: a live log shorter than the head cannot begin with the segment', () => {
  const s = segment({ head: 'x'.repeat(HEAD_BYTES) })
  assert.deepEqual(run([s], live(FRESH)).shown.map((x) => x.id), ['seg-a'])
})

test('eligible: in the repeated autumn hour a later line printing an earlier time is held back, the safe way', () => {
  const s = segment({ last: '2026-11-01 01:50:00' })
  const r = run([s], live('[Sun Nov 01 01:10:00 2026] after the clocks went back\n'))
  assert.deepEqual(r.held, [{ id: 'seg-a', reason: 'overlaps-live-log' }])
})

// ── the read path ───────────────────────────────────────────────────────────────────────────────

const LOG = '[Wed Aug 12 09:00:00 2026] fresh log\n'

function harness(over: Partial<HistoryDeps> & { segments?: Segment[] } = {}) {
  const dir = mkdtempSync(join(tmpdir(), 'logarchive-'))
  for (const s of over.segments ?? []) writeSegment(dir, s)
  let dirReads = 0
  const notes: string[] = []
  const h = createHistoryMerge({
    on: over.on ?? (() => true),
    dir: () => {
      dirReads++
      return dir
    },
    attached: over.attached ?? (() => ({ character: 'primitive_freeport', logPath: 'live.txt' })),
    readHead: over.readHead ?? ((_p, n) => Buffer.from(LOG).subarray(0, n)),
    note: (l) => notes.push(l),
    comboCorrections: over.comboCorrections
  })
  return { h, notes, dirReads: () => dirReads }
}

const sealedLoot = segment({ modules: { loot: { seq: 9, state: [{ ts: 1, item: 'old' }] } } })

test('read path: with the switch off the served object comes back untouched and the folder is never opened', () => {
  const t = harness({ on: () => false, segments: [sealedLoot] })
  const served = [{ ts: 2, item: 'new' }]
  assert.equal(t.h.mergeHistory('loot', 1, served), served)
  assert.equal(t.dirReads(), 0)
  assert.equal(t.h.status(), null)
})

test('read path: with no segment on disk the served object comes back untouched', () => {
  const t = harness()
  const served = [{ ts: 2, item: 'new' }]
  assert.equal(t.h.mergeHistory('loot', 1, served), served)
})

test('read path: a module without a merge rule is never touched, even with history on disk', () => {
  const t = harness({ segments: [sealedLoot] })
  const served = { character: { name: 'Primitive' } }
  assert.equal(t.h.mergeHistory('character', 1, served), served)
  assert.equal(t.dirReads(), 0)
})

test('read path: one sealed segment is merged under the live rows', () => {
  const t = harness({ segments: [sealedLoot] })
  assert.deepEqual(t.h.mergeHistory('loot', 1, [{ ts: 2, item: 'new' }]), [
    { ts: 1, item: 'old' },
    { ts: 2, item: 'new' }
  ])
  assert.deepEqual(t.h.status()?.shown, ['seg-a'])
})

test('read path: archived states are handed out only with the switch on (step 4.1)', () => {
  const off = harness({ on: () => false, segments: [sealedLoot] })
  assert.deepEqual(off.h.archived('loot'), [])
  assert.equal(off.dirReads(), 0)
  const on = harness({ segments: [sealedLoot] })
  assert.deepEqual(on.h.archived('loot'), [[{ ts: 1, item: 'old' }]])
  assert.deepEqual(on.h.archived('kills'), [])
})

test('read path: the same seq is merged once', () => {
  const t = harness({ segments: [sealedLoot] })
  const first = t.h.mergeHistory('loot', 4, [{ ts: 2, item: 'new' }])
  assert.equal(t.h.mergeHistory('loot', 4, [{ ts: 2, item: 'new' }]), first)
  assert.notEqual(t.h.mergeHistory('loot', 5, [{ ts: 2, item: 'new' }]), first)
})

test('read path: the decision is made once per character, so a log cleared mid-session changes nothing until relaunch', () => {
  let head = Buffer.from('head-of-log-A and more')
  const t = harness({ segments: [sealedLoot], readHead: (_p, n) => head.subarray(0, n) })
  const served = [{ ts: 2, item: 'new' }]
  assert.equal(t.h.mergeHistory('loot', 1, served), served, 'the live log still holds the segment')
  head = Buffer.from(LOG)
  assert.equal(t.h.mergeHistory('loot', 2, served), served, 'still decided as at attach')
  t.h.forgetHistoryContext()
  assert.equal((t.h.mergeHistory('loot', 3, served) as unknown[]).length, 2)
})

test('read path: an unreadable live log shows no history', () => {
  const t = harness({ segments: [sealedLoot], readHead: () => null })
  const served = [{ ts: 2, item: 'new' }]
  assert.equal(t.h.mergeHistory('loot', 1, served), served)
  assert.ok(t.notes.some((n) => /could not be read/.test(n)))
})

test('read path: no attached character shows no history', () => {
  const t = harness({ segments: [sealedLoot], attached: () => null })
  const served: unknown[] = []
  assert.equal(t.h.mergeHistory('loot', 1, served), served)
})

test('read path: a segment sealed during this attach is held back', () => {
  const t = harness({ segments: [sealedLoot] })
  t.h.noteSealedThisAttach('seg-a')
  const served = [{ ts: 2, item: 'new' }]
  assert.equal(t.h.mergeHistory('loot', 1, served), served)
  assert.deepEqual(t.h.status()?.held, [{ id: 'seg-a', reason: 'sealed-this-attach' }])
})

test('readHeadBytes: reads at most n bytes, and null for a missing file', () => {
  const dir = mkdtempSync(join(tmpdir(), 'logarchive-'))
  const p = join(dir, 'log.txt')
  writeFileSync(p, 'abcdef')
  assert.equal(readHeadBytes(p, 4)?.toString(), 'abcd')
  assert.equal(readHeadBytes(p, 100)?.toString(), 'abcdef')
  assert.equal(readHeadBytes(join(dir, 'missing.txt'), 4), null)
})

test('read path: kills before the live first zone line take the archive zone once the live progression has been noted (step 3.8)', () => {
  const run = (ts: number) => ({ count: 1, firstTs: ts, lastTs: ts, credited: 0, lastCreditedTs: 0 })
  const kills = (tier: number, ts: number) => ({ v: 5, mobs: { rat: { count: 1, bestTier: tier, firstTs: ts, lastTs: ts, credited: 0, display: 'rat', tiers: { [tier]: run(ts) } } } })
  const progression = (zoneStart: number[]) => ({
    expTs: [], expPct: [], expFlag: [], killTs: [], killZone: [], killCredit: [], witnessTs: [], recentKills: [], lootTs: [],
    zoneStart, zoneEnd: zoneStart.map(() => 0), zoneName: zoneStart.map(() => 'Inst'), offlineStart: [], offlineEnd: [], offlineCamped: [],
    levelTs: [], levelValue: [], aaGainTs: [], aaGainAmount: [], lastTs: 0, windowStart: 0, dropped: 0
  })
  const sealed = segment({ modules: { kills: { seq: 1, state: kills(3, 20) }, progression: { seq: 1, state: progression([10]) } } })
  const t = harness({ segments: [sealed] })
  const tiersOf = (state: unknown) => Object.keys((state as { mobs: { rat: { tiers: object } } }).mobs.rat.tiers).sort()
  assert.ok(t.h.wantsLiveZone('kills') && !t.h.wantsLiveZone('loot'))
  assert.deepEqual(tiersOf(t.h.mergeHistory('kills', 4, kills(-2, 50))), ['-2', '3'], 'not yet noted: nothing moves')
  t.h.noteLiveProgression(progression([]))
  assert.deepEqual(tiersOf(t.h.mergeHistory('kills', 4, kills(-2, 50))), ['3'], 'the same seq is merged again once the zone is known')
  assert.ok(t.h.wantsLiveZone('kills'), 'no zone line yet, so it is asked again')
  t.h.noteLiveProgression(progression([60]))
  assert.ok(!t.h.wantsLiveZone('kills'), 'a known first zone line cannot move')
  assert.deepEqual(tiersOf(t.h.mergeHistory('kills', 5, kills(-2, 70))), ['-2', '3'], 'a kill after the line stays unknown')
})

test("read path: archived combo intervals take today's corrections; the live state is the engine's (step 4.12)", () => {
  const slots = [
    { candidates: ['WAR'], confidence: 1, provenance: 'inferred', because: [] },
    { candidates: ['CLR'], confidence: 1, provenance: 'inferred', because: [] }
  ]
  const span = { startLo: 100, startHi: 100, endLo: 150, endHi: null, startReason: 'logStart', expectedSlots: 2, slots, levelLo: 10, levelHi: 12, evidenceCount: 1, userLocked: false }
  const archived = { intervals: [{ id: 'ci1', startTs: 100, endTs: null, ...span }], current: null, ready: true }
  const live = { intervals: [{ ...span, id: 'ci1', startTs: 300, endTs: null, startLo: 300, startHi: 300, slots: [slots[0], { ...slots[0], candidates: ['ENC'] }] }], current: null, ready: true }
  const corrections = [{ startTs: 90, endTs: 200, classes: ['ROG' as const, 'BER' as const], setAt: 1 }]
  const t = harness({ segments: [segment({ modules: { combo: { seq: 3, state: archived } } })], comboCorrections: () => corrections })
  const merged = t.h.mergeHistory('combo', 7, live) as { intervals: { userLocked: boolean; slots: { candidates: string[] }[] }[] }
  assert.deepEqual(merged.intervals.map((i) => [i.userLocked, i.slots.map((s) => s.candidates[0]).join('/')]), [
    [true, 'ROG/BER'],
    [false, 'WAR/ENC']
  ])
})

test('read path: with two archives, a correction in the newer one does not reach back into the older one (step 4.12)', () => {
  const slots = [
    { candidates: ['WAR'], confidence: 1, provenance: 'inferred', because: [] },
    { candidates: ['CLR'], confidence: 1, provenance: 'inferred', because: [] }
  ]
  const span = { startLo: 0, startHi: 0, endLo: null, endHi: null, startReason: 'logStart', expectedSlots: 2, slots, levelLo: 10, levelHi: 12, evidenceCount: 1, userLocked: false }
  const combo = (start: number) => ({ intervals: [{ ...span, id: 'ci1', startTs: start, endTs: null, startLo: start, startHi: start }], current: null, ready: true })
  const older = segment({ id: 'seg-a', head: 'head-a', first: '2026-08-01 10:00:00', last: '2026-08-02 10:00:00', modules: { combo: { seq: 1, state: combo(100) } } })
  const newer = segment({ id: 'seg-b', head: 'head-b', first: '2026-08-03 10:00:00', last: '2026-08-04 10:00:00', modules: { combo: { seq: 1, state: combo(1000) } } })
  // Placed over the newer archive only, and open-ended toward it: the older span is 100..1000.
  const corrections = [{ startTs: 1000, endTs: 5000, classes: ['ROG' as const, 'BER' as const], setAt: 1 }]
  const t = harness({ segments: [older, newer], comboCorrections: () => corrections })
  const merged = t.h.mergeHistory('combo', 7, combo(9000)) as { intervals: { startTs: number; userLocked: boolean }[] }
  assert.deepEqual(merged.intervals.map((i) => [i.startTs, i.userLocked]), [
    [100, false],
    [1000, true],
    [9000, false]
  ])
})

