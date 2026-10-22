// ============================================================================
// logArchiveBuckets.test.mts — resist and message history across an archive (log archive, step 5.2).
// ============================================================================
//
// Fixture files stand in for the engine's two files. `engineAttach` does to them what the engine
// does at an attach and its next write: every bucket is seeded and written back, and the attached
// character's is replaced by what the fresh log holds (fold/src/lib.rs seed_persisted).

import { test } from 'node:test'
import assert from 'node:assert/strict'
import { existsSync, mkdirSync, mkdtempSync, readdirSync, readFileSync, statSync, utimesSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import {
  archiveBuckets,
  archiveKey,
  placeArchivedBuckets,
  resetArchiveBucketsForTests,
  waitForEngineWrite,
  type PlaceDeps,
  type WaitDeps
} from '../src/main/logArchive/engineBuckets'
import type { SegmentState } from '../src/shared/logArchive/segment'

const ME = 'primitive_freeport'
const SEG = 'primitive_freeport-20260802151200-321'
const LEDGER = 'resist-ledger.json'
const OVERLAY = 'message-overlay.json'

const row = (mob: string, land: number): unknown => ({ mobKey: mob, spellKey: 'shock of frost', resist: 1, land })
const msg = (spell: string, count: number): unknown => ({ text: 'You feel different.', role: 'landing', spells: [{ spell, count }] })

interface Files {
  userData: string
  dir: string
}

function fixture(): Files {
  const root = mkdtempSync(join(tmpdir(), 'logbuckets-'))
  const userData = join(root, 'userData')
  const dir = join(userData, 'log-archive')
  mkdirSync(dir, { recursive: true })
  writeFileSync(
    join(userData, LEDGER),
    JSON.stringify({ version: 3, sources: [{ key: ME, rows: [row('a gnoll', 40)] }, { key: 'other_freeport', rows: [row('a bat', 2)] }] })
  )
  writeFileSync(
    join(userData, OVERLAY),
    JSON.stringify({ version: 2, updatedAt: '2026-08-02T15:20:00.000Z', sources: [{ key: ME, messages: [msg('Illusion: Gnome', 9)] }] })
  )
  return { userData, dir }
}

const read = (f: Files, name: string): { version: number; sources: { key: string; rows?: unknown[]; messages?: unknown[] }[] } =>
  JSON.parse(readFileSync(join(f.userData, name), 'utf8'))

const bucket = (f: Files, name: string, key: string): unknown => read(f, name).sources.find((s) => s.key === key)

/** The engine at attach plus its next write: the attached bucket becomes the fresh log's. */
function engineAttach(f: Files, fresh: { rows: unknown[]; messages: unknown[] }): void {
  for (const [name, field] of [[LEDGER, 'rows'], [OVERLAY, 'messages']] as const) {
    const file = read(f, name)
    file.sources = file.sources.filter((s) => s.key !== ME)
    if (fresh[field].length > 0) file.sources.push({ key: ME, [field]: fresh[field] })
    writeFileSync(join(f.userData, name), JSON.stringify(file))
  }
}

/** A wait that sees the engine write at once. */
const wroteNow: WaitDeps = { now: () => 0, sleep: () => Promise.resolve(), mtime: () => 1 }

function placeDeps(f: Files, state: SegmentState | null, over: Partial<PlaceDeps> = {}): PlaceDeps {
  return { on: () => true, userData: f.userData, dir: f.dir, stateOf: () => state, note: () => undefined, ...over }
}

/** One archive: wait, capture (not modelled), take, move, keep. */
async function archive(f: Files, moved = true): Promise<void> {
  const b = archiveBuckets(f.userData, ME, wroteNow)
  await b.settle()
  b.take()
  b.keep(f.dir, SEG, moved)
}

test('buckets: the bucket taken at the archive is placed at launch and survives the engine writing the file', async () => {
  resetArchiveBucketsForTests()
  const f = fixture()
  await archive(f)
  // After the move the engine went on tailing the fresh log in the same attach and wrote that out.
  engineAttach(f, { rows: [row('a gnoll', 40), row('a rat', 3)], messages: [msg('Illusion: Gnome', 10)] })
  placeArchivedBuckets(placeDeps(f, 'sealed'))
  const key = archiveKey(SEG)
  // The copy is the archived log's share only: not the line folded after the move.
  assert.deepEqual(bucket(f, LEDGER, key), { key, rows: [row('a gnoll', 40)] })
  assert.deepEqual(bucket(f, OVERLAY, key), { key, messages: [msg('Illusion: Gnome', 9)] })
  assert.equal(read(f, OVERLAY).sources.length, 2)
  assert.equal(JSON.parse(readFileSync(join(f.userData, OVERLAY), 'utf8')).updatedAt, '2026-08-02T15:20:00.000Z')
  // The launch's attach folds the fresh log; the copy and the other character are left alone.
  engineAttach(f, { rows: [row('a rat', 3)], messages: [] })
  assert.deepEqual(bucket(f, LEDGER, key), { key, rows: [row('a gnoll', 40)] })
  assert.deepEqual(bucket(f, LEDGER, ME), { key: ME, rows: [row('a rat', 3)] })
  assert.ok(bucket(f, LEDGER, 'other_freeport') !== undefined)
  assert.deepEqual(bucket(f, OVERLAY, key), { key, messages: [msg('Illusion: Gnome', 9)] })
  assert.ok(!readdirSync(f.userData).some((n) => n.endsWith('.tmp')))
})

test('buckets: a second launch does not copy again', async () => {
  resetArchiveBucketsForTests()
  const f = fixture()
  await archive(f)
  placeArchivedBuckets(placeDeps(f, 'sealed'))
  const once = [readFileSync(join(f.userData, LEDGER), 'utf8'), readFileSync(join(f.userData, OVERLAY), 'utf8')]
  const notes: string[] = []
  placeArchivedBuckets(placeDeps(f, 'sealed', { note: (l) => notes.push(l) }))
  assert.deepEqual([readFileSync(join(f.userData, LEDGER), 'utf8'), readFileSync(join(f.userData, OVERLAY), 'utf8')], once)
  assert.equal(read(f, LEDGER).sources.filter((s) => s.key === archiveKey(SEG)).length, 1)
  assert.deepEqual(notes, [])
})

test('buckets: a file of an unknown version is left alone, at the archive and at launch', async () => {
  resetArchiveBucketsForTests()
  const f = fixture()
  const future = JSON.stringify({ version: 99, sources: [{ key: ME, rows: [row('a gnoll', 1)] }] })
  writeFileSync(join(f.userData, LEDGER), future)
  await archive(f)
  const stash = JSON.parse(readFileSync(join(f.dir, `${SEG}.buckets.json`), 'utf8'))
  assert.deepEqual(Object.keys(stash.buckets), [OVERLAY])
  placeArchivedBuckets(placeDeps(f, 'sealed'))
  assert.equal(readFileSync(join(f.userData, LEDGER), 'utf8'), future)
  assert.ok(bucket(f, OVERLAY, archiveKey(SEG)) !== undefined)
})

test('buckets: a file that becomes an unknown version before the launch is not written', async () => {
  resetArchiveBucketsForTests()
  const f = fixture()
  await archive(f)
  const future = JSON.stringify({ version: 4, sources: [] })
  writeFileSync(join(f.userData, LEDGER), future)
  placeArchivedBuckets(placeDeps(f, 'sealed'))
  assert.equal(readFileSync(join(f.userData, LEDGER), 'utf8'), future)
})

test('buckets: the switch off withdraws every carried key, keeps the stashes, and on again re-adds them', async () => {
  resetArchiveBucketsForTests()
  const f = fixture()
  await archive(f)
  const before = [readFileSync(join(f.userData, LEDGER), 'utf8'), readFileSync(join(f.userData, OVERLAY), 'utf8')]
  placeArchivedBuckets(placeDeps(f, 'sealed'))
  const placed = [readFileSync(join(f.userData, LEDGER), 'utf8'), readFileSync(join(f.userData, OVERLAY), 'utf8')]
  const stashPath = join(f.dir, `${SEG}.buckets.json`)
  const stash = readFileSync(stashPath, 'utf8')
  // Off: the archive folder is not read, the keys go, everything else stays as it was.
  const off = placeDeps(f, 'sealed', { on: () => false, stateOf: () => assert.fail('read while off') })
  placeArchivedBuckets(off)
  assert.equal(bucket(f, LEDGER, archiveKey(SEG)), undefined)
  assert.equal(bucket(f, OVERLAY, archiveKey(SEG)), undefined)
  assert.deepEqual(read(f, LEDGER), JSON.parse(before[0]))
  assert.deepEqual(read(f, OVERLAY), JSON.parse(before[1]))
  assert.equal(readFileSync(stashPath, 'utf8'), stash)
  // A second launch while off writes nothing.
  const offOnce = [readFileSync(join(f.userData, LEDGER), 'utf8'), readFileSync(join(f.userData, OVERLAY), 'utf8')]
  const notes: string[] = []
  placeArchivedBuckets({ ...off, note: (l) => notes.push(l) })
  assert.deepEqual([readFileSync(join(f.userData, LEDGER), 'utf8'), readFileSync(join(f.userData, OVERLAY), 'utf8')], offOnce)
  assert.deepEqual(notes, [])
  // On again: the next launch adds them back from the untouched stash.
  placeArchivedBuckets(placeDeps(f, 'sealed'))
  assert.deepEqual(read(f, LEDGER), JSON.parse(placed[0]))
  assert.deepEqual(read(f, OVERLAY), JSON.parse(placed[1]))
  assert.equal(readFileSync(stashPath, 'utf8'), stash)
})

test('buckets: the switch off leaves a file of an unknown version alone', async () => {
  resetArchiveBucketsForTests()
  const f = fixture()
  const future = JSON.stringify({ version: 99, sources: [{ key: archiveKey(SEG), rows: [row('a gnoll', 1)] }] })
  writeFileSync(join(f.userData, LEDGER), future)
  placeArchivedBuckets(placeDeps(f, 'sealed', { on: () => false }))
  assert.equal(readFileSync(join(f.userData, LEDGER), 'utf8'), future)
})

test('buckets: a segment that is not sealed yet, or still being finished, is waited for', async () => {
  resetArchiveBucketsForTests()
  const f = fixture()
  await archive(f)
  placeArchivedBuckets(placeDeps(f, null))
  assert.equal(bucket(f, LEDGER, archiveKey(SEG)), undefined)
  assert.ok(existsSync(join(f.dir, `${SEG}.buckets.json`)))
  placeArchivedBuckets(placeDeps(f, 'sealed'))
  assert.ok(bucket(f, LEDGER, archiveKey(SEG)) !== undefined)
})

test('buckets: a restored segment has its key taken out and its stash deleted', async () => {
  resetArchiveBucketsForTests()
  const f = fixture()
  await archive(f)
  placeArchivedBuckets(placeDeps(f, 'sealed'))
  placeArchivedBuckets(placeDeps(f, 'backed-up'))
  assert.equal(bucket(f, LEDGER, archiveKey(SEG)), undefined)
  assert.equal(bucket(f, OVERLAY, archiveKey(SEG)), undefined)
  assert.ok(bucket(f, LEDGER, ME) !== undefined)
  assert.ok(!existsSync(join(f.dir, `${SEG}.buckets.json`)))
})

test('buckets: nothing is kept when the log was not moved, or for a second archive in one run', async () => {
  resetArchiveBucketsForTests()
  const f = fixture()
  await archive(f, false)
  assert.ok(!existsSync(join(f.dir, `${SEG}.buckets.json`)))
  await archive(f)
  assert.ok(existsSync(join(f.dir, `${SEG}.buckets.json`)))
  const second = archiveBuckets(f.userData, ME, { ...wroteNow, sleep: async () => assert.fail('waited') })
  await second.settle()
  second.take()
  second.keep(f.dir, 'primitive_freeport-20260803100000-99', true)
  assert.ok(!existsSync(join(f.dir, 'primitive_freeport-20260803100000-99.buckets.json')))
})

test('buckets: the wait ends at the engine write, or after its limit when nothing was written', async () => {
  const f = fixture()
  let clock = 1_000_000
  const deps: WaitDeps = {
    now: () => clock,
    sleep: async (ms) => {
      clock += ms
    },
    mtime: () => 999_000
  }
  assert.equal(await waitForEngineWrite(f.userData, deps), false)
  assert.ok(clock - 1_000_000 >= 65_000 && clock - 1_000_000 < 67_000)
  // A real write of the overlay a few seconds into the wait, read through the real mtime.
  const start = Date.now()
  const old = new Date(start - 120_000)
  utimesSync(join(f.userData, LEDGER), old, old)
  utimesSync(join(f.userData, OVERLAY), old, old)
  let calls = 0
  const seen = await waitForEngineWrite(f.userData, {
    now: () => start + calls * 1000,
    sleep: async () => {
      calls++
      if (calls === 3) utimesSync(join(f.userData, OVERLAY), new Date(), new Date(start + 10_000))
    },
    mtime: (p) => (existsSync(p) ? statSync(p).mtimeMs : null)
  })
  assert.equal(seen, true)
  assert.equal(calls, 4)
})
