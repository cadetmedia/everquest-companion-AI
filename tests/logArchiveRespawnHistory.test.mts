// ============================================================================
// logArchiveRespawnHistory.test.mts — the learned respawn gaps of mobs nobody watched (log archive,
// step 4.14): the batched read, the capture that keeps it, and the merge that shows it once the
// player watches the mob.
// ============================================================================
//
// The read against the real engine binary was probed by hand on `wl40-farm-run.log` (2026-10-08):
// 41 mobs asked for, none watched, 9 with learned gaps back. Here a fake respawn module stands in:
// it answers a row for each watched key it remembers, capped at the engine's page like the fold.

import { test } from 'node:test'
import assert from 'node:assert/strict'
import { createHash } from 'node:crypto'
import { historyKeys, readRespawnHistory, type RespawnHistoryDeps } from '../src/main/logArchive/respawnHistory'
import { captureSegment, type CaptureDeps } from '../src/main/logArchive/capture'
import { mergeModule } from '../src/shared/logArchive/mergeRules'
import { withHistoryRows } from '../src/shared/logArchive/mergeRespawn'
import { parseSegment, type SegmentLog } from '../src/shared/logArchive/segment'
import { RESPAWN_MAX_ROWS, type RespawnRow, type RespawnSnap } from '../src/shared/respawn'

function row(key: string, zone = 'guk', over: Partial<RespawnRow> = {}): RespawnRow {
  return {
    id: `${zone}::${key}`,
    key,
    display: key,
    zone,
    baseTs: 1000,
    basis: 'death',
    source: 'observed',
    samples: 2,
    gapsMs: [300_000, 400_000],
    observedMs: 300_000,
    estimateMs: 300_000,
    kills: 3,
    ...over
  } as RespawnRow
}

/** A respawn module that remembers `known` and answers the watched ones, a page at most. */
function fakeEngine(known: RespawnRow[], over: Partial<RespawnHistoryDeps> = {}) {
  let watched: readonly string[] = []
  const calls = { watch: 0, restore: 0 }
  const deps: RespawnHistoryDeps = {
    watch: async (keys) => {
      calls.watch++
      watched = keys
    },
    rows: async () => known.filter((r) => watched.includes(r.key)).slice(0, RESPAWN_MAX_ROWS),
    restore: async () => {
      calls.restore++
    },
    ...over
  }
  return { deps, calls }
}

test('history keys: every killed mob and every recent candidate, once, in lower case', () => {
  const kills = { v: 1, mobs: { 'a ghoul': {}, 'a bat': {} } }
  const respawn = { recent: [{ key: 'A Bat' }, { key: 'a rat' }, { nokey: 1 }] }
  assert.deepEqual(historyKeys(kills, respawn), ['a bat', 'a ghoul', 'a rat'])
  assert.deepEqual(historyKeys(null, undefined), [])
})

test("read: every learned row of every key, in batches, and the player's list put back once", async () => {
  const keys = Array.from({ length: 95 }, (_, i) => `mob ${String(i).padStart(2, '0')}`)
  const known = keys.map((k, i) => (i % 2 === 0 ? row(k) : row(k, 'guk', { samples: 0, gapsMs: undefined, observedMs: undefined })))
  const { deps, calls } = fakeEngine(known)
  const got = await readRespawnHistory(keys, deps)
  assert.equal(got?.length, 48, 'only the rows that learned something')
  assert.ok(calls.watch >= 3, 'more than one batch')
  assert.equal(calls.restore, 1)
})

test('read: a full page is split and asked again, so a mob seen in many zones loses nothing', async () => {
  const known = [...Array.from({ length: 40 }, (_, i) => row('a', `zone ${i}`)), ...Array.from({ length: 40 }, (_, i) => row('b', `zone ${i}`))]
  const { deps } = fakeEngine(known)
  assert.equal((await readRespawnHistory(['a', 'b'], deps))?.length, 80)
})

test('read: an unreadable module, or a refused watch, answers null and still puts the list back', async () => {
  const a = fakeEngine([row('a')], { rows: async () => null })
  assert.equal(await readRespawnHistory(['a'], a.deps), null)
  assert.equal(a.calls.restore, 1)
  const b = fakeEngine([row('a')], {
    watch: async () => {
      throw new Error('refused')
    }
  })
  assert.equal(await readRespawnHistory(['a'], b.deps), null)
  assert.equal(b.calls.restore, 1)
})

test('read: no keys asks the engine nothing', async () => {
  const { deps, calls } = fakeEngine([])
  assert.deepEqual(await readRespawnHistory([], deps), [])
  assert.deepEqual(calls, { watch: 0, restore: 0 })
})

// ── the capture ─────────────────────────────────────────────────────────────────────────────────

const sha = (s: string): string => createHash('sha256').update(s).digest('hex')

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
    snapshot: async (m) => (m === 'kills' ? { seq: 1, state: { mobs: { 'a ghoul': {} } } } : null),
    fights: async () => null,
    respawnHistory: async (modules) => {
      order.push('respawnHistory')
      assert.ok(modules.kills, 'the modules are taken first and handed over')
      return [row('a ghoul')]
    },
    readPrefix: async () => log,
    producedBy: () => ({ app: '1.0.0', engine: '1.0.0' }),
    ...over
  }
}

test('capture: the respawn history is read after the before/after pair has held, and kept while the log has not moved', async () => {
  const deps = captureDeps()
  const r = await captureSegment(deps)
  assert.ok(r.ok)
  if (!r.ok) return
  assert.deepEqual(r.segment.respawnHistory?.map((x) => x.id), ['guk::a ghoul'])
  assert.deepEqual(deps.order, ['health', 'health', 'respawnHistory', 'health'])
  assert.ok(parseSegment(JSON.parse(JSON.stringify(r.segment))).ok)
})

test('capture: a line landing during the history read drops the history, never the capture', async () => {
  let n = 0
  const deps = captureDeps({
    health: async () => {
      n++
      return { status: 'live', mark: { log: 'live.txt', offset: n >= 3 ? 20 : 10 }, events: 4 }
    }
  })
  const r = await captureSegment(deps)
  assert.ok(r.ok)
  assert.ok(r.ok && !('respawnHistory' in r.segment))
})

test('read: a restore that fails is retried, and the caller is told when every try failed', async () => {
  let tries = 0
  const told: unknown[] = []
  const { deps } = fakeEngine([row('a')], {
    restore: async () => {
      tries++
      if (tries < 2) throw new Error('busy')
    },
    restoreFailed: (e) => told.push(e)
  })
  assert.equal((await readRespawnHistory(['a'], deps))?.length, 1)
  assert.equal(tries, 2)
  assert.deepEqual(told, [])
  const never = fakeEngine([row('a')], {
    restore: () => Promise.reject(new Error('gone')),
    restoreFailed: (e) => told.push(e)
  })
  await readRespawnHistory(['a'], never.deps)
  assert.equal(told.length, 1)
})

test('capture: no reader, or one that could not read, leaves the field out', async () => {
  const none = await captureSegment(captureDeps({ respawnHistory: undefined }))
  assert.ok(none.ok && !('respawnHistory' in none.segment))
  const failed = await captureSegment(captureDeps({ respawnHistory: async () => null }))
  assert.ok(failed.ok && !('respawnHistory' in failed.segment))
})

test('segment: a malformed respawn history is refused by name', () => {
  const log = { bytes: 1, headBytes: 1, sha256: sha('a'), headSha256: sha('a'), firstStamp: 'x', lastStamp: 'y' }
  const base = { v: 1, id: 's', character: 'c', state: 'sealed', archivePath: null, producedBy: {}, modules: {}, log }
  assert.deepEqual(parseSegment({ ...base, respawnHistory: 'no' }), { ok: false, reason: 'respawn history is not a list' })
  assert.deepEqual(parseSegment({ ...base, respawnHistory: [{ id: 1 }] }), { ok: false, reason: 'a respawn history row is malformed' })
})

// ── the merge ───────────────────────────────────────────────────────────────────────────────────

function snap(rows: RespawnRow[], watches: string[]): RespawnSnap {
  return { v: 4, zone: 'guk', rows, recent: [], prefs: { watches: watches.map((key) => ({ key, display: key })) } } as unknown as RespawnSnap
}

test('merge: a mob first watched after its log was archived gets the gaps learned there', () => {
  const live = snap([], ['a ghoul'])
  const archived = withHistoryRows(snap([], []), [row('a ghoul'), row('a bat')], live)
  const merged = mergeModule('respawn', [archived], live).state as RespawnSnap
  assert.deepEqual(merged.rows.map((r) => [r.id, r.gapsMs]), [['guk::a ghoul', [300_000, 400_000]]])
})

test("merge: across two archives the older one's history is filtered by today's list, not the newer archive's", () => {
  const live = snap([], ['a ghoul'])
  const older = withHistoryRows(snap([], ['a bat']), [row('a ghoul')], live)
  const newer = withHistoryRows(snap([], ['a bat']), [], live)
  const merged = mergeModule('respawn', [older, newer], live).state as RespawnSnap
  assert.deepEqual(merged.rows.map((r) => r.id), ['guk::a ghoul'])
})

test('merge: a row the archive captured is kept as captured, and anything not a respawn state passes through', () => {
  const live = snap([], ['a ghoul'])
  const captured = row('a ghoul', 'guk', { samples: 9 })
  const out = withHistoryRows(snap([captured], []), [row('a ghoul')], live) as RespawnSnap
  assert.deepEqual(out.rows, [captured])
  assert.equal(withHistoryRows('junk', [row('a')], live), 'junk')
})
