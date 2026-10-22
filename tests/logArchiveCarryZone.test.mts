// ============================================================================
// logArchiveCarryZone.test.mts — the zone carried across a cut (log archive, step 3.8).
// ============================================================================
//
// A fresh log does not know its zone until the game prints a zone line. Read as one log, the kills
// and respawn deaths before that line were in the zone the archive ended in. The split-log tests
// use the la2 fixtures of logArchiveMergeMore.test.mts, whose `kills` and `respawn` were recorded
// for this step the same way (the engine's own `parity.exe --snapshots --tz UTC`): B kills a large
// rat before its first zone line, and the whole log files it in West Freeport, where A ended.

import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { carryZoneIntoKills, firstZoneLine } from '../src/shared/logArchive/carryZone'
import { mergeRespawn } from '../src/shared/logArchive/mergeRespawn'
import { mergeModule } from '../src/shared/logArchive/mergeRules'
import { killTotals, TIER_UNKNOWN, type KillsSnap, type KillTierRun } from '../src/shared/kills'
import type { RespawnCandidate, RespawnRow, RespawnSnap } from '../src/shared/respawn'
import type { ProgressionSnap } from '../src/shared/types'

interface Recorded {
  kills: KillsSnap
  respawn: RespawnSnap
  progression: ProgressionSnap
}

const fixture = (name: string): Recorded =>
  JSON.parse(readFileSync(new URL(`fixtures/logArchive/${name}.json`, import.meta.url), 'utf8')) as Recorded

const LA = { a: fixture('la2-a'), b: fixture('la2-b'), whole: fixture('la2-whole') }

function progression(over: Partial<ProgressionSnap>): ProgressionSnap {
  const empty: ProgressionSnap = {
    expTs: [], expPct: [], expFlag: [], killTs: [], killZone: [], killCredit: [], witnessTs: [], recentKills: [],
    lootTs: [], zoneStart: [], zoneEnd: [], zoneName: [], offlineStart: [], offlineEnd: [], offlineCamped: [],
    levelTs: [], levelValue: [], aaGainTs: [], aaGainAmount: [], lastTs: 0, windowStart: 0, dropped: 0
  }
  return { ...empty, ...over }
}

const clock = (over: Partial<RespawnRow>): RespawnRow => ({
  id: 'guk::a ghoul',
  key: 'a ghoul',
  display: 'a ghoul',
  zone: 'Guk',
  baseTs: 100,
  basis: 'death',
  source: 'none',
  samples: 0,
  kills: 1,
  ...over
})

const respawnSnap = (rows: RespawnRow[], watches: RespawnSnap['prefs']['watches'], recent: RespawnCandidate[] = []): RespawnSnap => ({
  v: 4,
  zone: 'Guk',
  rows,
  recent,
  prefs: { watches }
})

test("split log (la2): kills of A merged with B equal the whole log, the kill before B's first zone line filed in A's last zone", () => {
  const carried = carryZoneIntoKills([{ kills: LA.a.kills, progression: LA.a.progression }], { kills: LA.b.kills, firstZone: firstZoneLine(LA.b.progression) })
  assert.deepEqual(mergeModule('kills', carried.archived, carried.live).state, LA.whole.kills)
})

test("split log (la2): respawn of A merged with B equals the whole log, the candidate before B's first zone line included", () => {
  assert.deepEqual(mergeModule('respawn', [LA.a.respawn], LA.b.respawn).state, LA.whole.respawn)
})

test('split log: the la2 kills fixture really files a kill under the unknown zone in B alone', () => {
  assert.ok(LA.b.kills.mobs['a large rat'].tiers[TIER_UNKNOWN])
  assert.equal(LA.b.respawn.recent[0].zone, '')
})

const tierRun = (count: number, firstTs: number, lastTs: number): KillTierRun => ({ count, firstTs, lastTs, credited: 0, lastCreditedTs: 0 })
const killsSnap = (mobs: Record<string, Record<number, KillTierRun>>): KillsSnap => ({
  v: 5,
  mobs: Object.fromEntries(Object.entries(mobs).map(([k, tiers]) => [k, { ...killTotals(tiers), display: k, tiers }]))
})

test('zone carry: only runs wholly before the first zone line move, to the tier the archive gave its last zone', () => {
  const older = { kills: killsSnap({ boss: { 3: tierRun(1, 120, 120) }, rat: { [-1]: tierRun(2, 10, 50) } }), progression: progression({ zoneStart: [5, 100], zoneEnd: [100, 0], zoneName: ['Open', 'Inst'] }) }
  const live = killsSnap({ boss: { [TIER_UNKNOWN]: tierRun(1, 300, 300) }, imp: { [TIER_UNKNOWN]: tierRun(2, 310, 500) }, orc: { [TIER_UNKNOWN]: tierRun(1, 600, 600) } })
  const before = JSON.stringify(live)
  const out = carryZoneIntoKills([older], { kills: live, firstZone: 400 }).live as KillsSnap
  assert.deepEqual(out.mobs.boss.tiers, { 3: tierRun(1, 300, 300) })
  assert.equal(out.mobs.boss.bestTier, 3)
  assert.deepEqual(Object.keys(out.mobs.imp.tiers), [String(TIER_UNKNOWN)], 'a run across the first zone line stays')
  assert.deepEqual(Object.keys(out.mobs.orc.tiers), [String(TIER_UNKNOWN)], 'an unknown zone after the line stays')
  assert.equal(JSON.stringify(live), before)
  const noZoneYet = carryZoneIntoKills([older], { kills: live, firstZone: null }).live as KillsSnap
  assert.deepEqual(Object.keys(noZoneYet.mobs.orc.tiers), ['3'])
})

test('zone carry: nothing moves when no archived kill names the last zone, two disagree, or the live side cannot say', () => {
  const prog = progression({ zoneStart: [100], zoneEnd: [0], zoneName: ['Bare'] })
  const live = killsSnap({ boss: { [TIER_UNKNOWN]: tierRun(1, 300, 300) } })
  const silent = { kills: killsSnap({ rat: { [-1]: tierRun(1, 50, 50) } }), progression: prog }
  const split = { kills: killsSnap({ a: { 0: tierRun(1, 150, 150) }, b: { [-1]: tierRun(1, 160, 160) } }), progression: prog }
  const bare = { kills: killsSnap({ a: { 0: tierRun(1, 150, 150) } }), progression: prog }
  assert.equal(carryZoneIntoKills([silent], { kills: live, firstZone: null }).live, live)
  assert.equal(carryZoneIntoKills([split], { kills: live, firstZone: null }).live, live)
  assert.equal(carryZoneIntoKills([bare], { kills: live, firstZone: undefined }).live, live)
  assert.deepEqual(Object.keys((carryZoneIntoKills([bare], { kills: live, firstZone: null }).live as KillsSnap).mobs.boss.tiers), ['0'], 'a bare name the fold remembered as an instance stays one')
})

test('zone carry: every cut, so an archive that began fresh takes the zone of the one before, and one with no zone line passes it on', () => {
  const first = { kills: killsSnap({ a: { 2: tierRun(1, 150, 150) } }), progression: progression({ zoneStart: [100], zoneEnd: [0], zoneName: ['D2'] }) }
  const fresh = { kills: killsSnap({ b: { [TIER_UNKNOWN]: tierRun(1, 200, 200) } }), progression: progression({}) }
  const live = killsSnap({ c: { [TIER_UNKNOWN]: tierRun(1, 300, 300) } })
  const out = carryZoneIntoKills([first, fresh], { kills: live, firstZone: null })
  assert.deepEqual(Object.keys((out.archived[1] as KillsSnap).mobs.b.tiers), ['2'])
  assert.deepEqual(Object.keys((out.live as KillsSnap).mobs.c.tiers), ['2'])
  assert.equal(firstZoneLine(progression({ zoneStart: [7], windowStart: 3 })), undefined, 'a progression that dropped history cannot say')
})

test('respawn: rows and candidates before the live first zone line join the zone the archive ended in, and a blank header shows it', () => {
  const pre = clock({ id: '::a ghoul', zone: '', kills: 1, samples: 0, baseTs: 50 })
  const post = clock({ kills: 2, samples: 1, gapsMs: [300_000], baseTs: 900 })
  const cand = (zone: string, lastTs: number): RespawnCandidate => ({ key: 'a ghoul', display: 'a ghoul', zone, lastTs, kills: 1, watched: true })
  const older: RespawnSnap = { ...respawnSnap([], []), zone: 'Guk' }
  const newer: RespawnSnap = { ...respawnSnap([pre, post], [{ key: 'a ghoul', display: 'a ghoul' }], [cand('Guk', 900), cand('', 50)]), zone: '' }
  const m = mergeRespawn(older, newer)
  assert.equal(m?.zone, 'Guk')
  assert.deepEqual(m?.rows.map((r) => [r.id, r.kills, r.samples, r.baseTs]), [['guk::a ghoul', 3, 1, 900]])
  assert.deepEqual(m?.recent.map((c) => [c.zone, c.kills, c.lastTs]), [['Guk', 2, 900]])
  assert.equal(mergeRespawn({ ...older, zone: '' }, newer)?.rows.length, 2, 'an archive that never zoned carries nothing')
})
