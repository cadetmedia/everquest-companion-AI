// ============================================================================
// logArchiveMergeMore.test.mts — the phase 4 merge rules and their split-log tests (log archive,
// steps 4.1 to 4.5).
// ============================================================================
//
// The split-log test of step 1.6 (logArchiveMerge.test.mts), for the modules phase 4 adds. Two
// fixture sets, each recorded once with the engine's own snapshot tool:
//
//   * `wl40-{a,b,whole}.json`: `tests/fixtures/wl40-farm-run.log` cut after line 470.
//   * `la2-{a,b,whole}.json`: `tests/fixtures/logArchive/la2-history-run.log` cut after line 13. A
//     small synthetic log, written for this test because no fixture log holds a class unlock and
//     none cons the same mob on both sides of a cut. Both halves open with a line no module reads:
//     the engine's fold does not take the very first line of a file into the consider ring or the
//     zone timeline, which is the engine's own behaviour and not a merge matter, so the cut keeps it
//     out of the way.
//
// To re-record: cut the log the same way into files named `eqlog_Primitive_freeport.<part>.txt`,
// run `engine/target/release/parity.exe <file> --snapshots --tz UTC` on each, and keep the modules
// each fixture holds from the `modules` array (each module's `snapshot.state`).

import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { CONSIDER_CAP, mergeConsider } from '../src/shared/logArchive/mergeConsider'
import { mergeItemTiers } from '../src/shared/logArchive/mergeItemTiers'
import { dropsFromLoot, mergeDropsSeen, withArchivedDrops } from '../src/shared/logArchive/mergeDropsSeen'
import { mergeProgression } from '../src/shared/logArchive/mergeProgression'
import { mergeRespawn } from '../src/shared/logArchive/mergeRespawn'
import { mergeBazaar } from '../src/shared/logArchive/mergeBazaar'
import { mergeClassUnlocks, mergeTurnIns } from '../src/shared/logArchive/mergeUnlocksTurnIns'
import { hasMergeRule, mergeModule } from '../src/shared/logArchive/mergeRules'
import { MobLootIndex } from '../src/main/mobLookupParse'
import { RESPAWN_MAX_GAPS, RESPAWN_MAX_RECENT, type RespawnCandidate, type RespawnRow, type RespawnSnap } from '../src/shared/respawn'
import type { ClassUnlockSnap, ConsiderRow, ConsiderSnap, ItemTierRow, ItemTiersSnap, LootSnap, MobSeenDrop, ProgressionSnap, TurnInSnap } from '../src/shared/types'

interface Recorded {
  loot: LootSnap
  consider?: ConsiderSnap
  itemTiers: ItemTiersSnap
  classUnlocks?: ClassUnlockSnap
  turnins?: TurnInSnap
  respawn?: RespawnSnap
  progression: ProgressionSnap
}

const fixture = (name: string): Recorded =>
  JSON.parse(readFileSync(new URL(`fixtures/logArchive/${name}.json`, import.meta.url), 'utf8')) as Recorded

const WL = { a: fixture('wl40-a'), b: fixture('wl40-b'), whole: fixture('wl40-whole') }
const LA = { a: fixture('la2-a'), b: fixture('la2-b'), whole: fixture('la2-whole') }

// ── 4.1 consider: the split-log test ────────────────────────────────────────────────────────────

/**
 * THE ONE FIELD ALLOWED TO DIFFER. B cons the large rat before B's first zone line. The fold labels
 * a row with the zone it is standing in, so the whole log labels it West Freeport (from A) and B
 * alone cannot label it at all. The merge keeps B's row, the newest con, as the fold does.
 */
function wholeConsiderAsSplitSeesThem(): ConsiderSnap {
  const ring = structuredClone(LA.whole.consider ?? [])
  const rat = ring.find((r) => r.id === 'a large rat')
  assert.ok(rat)
  delete rat.zone
  return ring
}

test('split log: consider of A merged with B equals the consider ring of the whole log', () => {
  assert.deepEqual(mergeModule('consider', [LA.a.consider], LA.b.consider).state, wholeConsiderAsSplitSeesThem())
})

test('split log: the consider fixture really is split', () => {
  const a = LA.a.consider ?? []
  const b = LA.b.consider ?? []
  assert.ok(a.some((r) => b.some((s) => s.id === r.id)), 'a mob is conned in both halves')
  assert.ok(a.some((r) => !b.some((s) => s.id === r.id)), 'a mob is conned in A only')
})

// ── 4.1 drops seen: the split-log test ──────────────────────────────────────────────────────────

/** The app's own index (its fold before the engine took it over), fed the whole log's loot. */
function wholeDropsSeen(loot: LootSnap, mob: string): MobSeenDrop[] {
  const index = new MobLootIndex()
  for (const r of loot) if (r.disposition !== 'destroyed') index.note(r.item, r.source, r.ts, r.count ?? 1)
  return sortedLikeEngine(index.drops(mob))
}

function sortedLikeEngine(rows: MobSeenDrop[]): MobSeenDrop[] {
  return [...rows].sort((a, b) => b.count - a.count || b.lastTs - a.lastTs || (a.item < b.item ? -1 : a.item > b.item ? 1 : 0))
}

for (const [name, set] of [['wl40', WL], ['la2', LA]] as const) {
  test(`split log (${name}): every mob's drops seen, archive A joined to B, equal the whole log's`, () => {
    const mobs = new Set(set.whole.loot.flatMap((r) => (r.source === undefined ? [] : [r.source])))
    assert.ok(mobs.size > 0)
    for (const mob of mobs) {
      const live = dropsFromLoot(set.b.loot, [mob])
      const box = withArchivedDrops(live.length > 0 ? { seen: live } : {}, [set.a.loot], [mob])
      assert.deepEqual(box.seen ?? [], wholeDropsSeen(set.whole.loot, mob), mob)
    }
  })
}

test('split log: some mob drops in both halves of la2, so counts really add', () => {
  const a = dropsFromLoot(LA.a.loot, ['a large rat']).map((d) => d.item)
  const b = dropsFromLoot(LA.b.loot, ['a large rat']).map((d) => d.item)
  assert.ok(a.some((item) => b.includes(item)))
})

// ── 4.1 consider: the rule ──────────────────────────────────────────────────────────────────────

const con = (id: string, mob: string, ts: number, extra: Partial<ConsiderRow> = {}): ConsiderRow => ({
  id,
  mob,
  ts,
  rare: false,
  faction: 'indifferent',
  difficulty: 'x',
  cons: 1,
  ...extra
})

test('consider: a mob on both sides takes the newer con, with the cons added and the fold\'s display', () => {
  const m = mergeConsider([con('a rat', 'a rat', 1, { cons: 2 }), con('b', 'B', 2)], [con('a rat', 'A rat', 9, { cons: 3, level: 4 })])
  assert.ok(m)
  assert.deepEqual(m.map((r) => r.id), ['b', 'a rat'])
  assert.deepEqual(m[1], con('a rat', 'a rat', 9, { cons: 5, level: 4 }))
})

test('consider: learned knowledge is kept across the join, and the ring keeps its cap', () => {
  const knowledge = { name: 'x' } as unknown as ConsiderRow['knowledge']
  const m = mergeConsider([con('k', 'k', 1, { knowledge })], [con('k', 'k', 2)])
  assert.equal(m?.[0].knowledge, knowledge)
  const older = Array.from({ length: CONSIDER_CAP }, (_, i) => con(`o${i}`, `o${i}`, i))
  const capped = mergeConsider(older, [con('n', 'n', 999)])
  assert.equal(capped?.length, CONSIDER_CAP)
  assert.equal(capped?.[0].id, 'o1', 'the oldest falls off the front')
  assert.equal(capped?.[CONSIDER_CAP - 1].id, 'n')
})

test('consider: inputs are not changed, and a bad shape is not merged', () => {
  const older = [con('a', 'a', 1)]
  const newer = [con('a', 'a', 2)]
  const before = JSON.stringify([older, newer])
  mergeConsider(older, newer)
  assert.equal(JSON.stringify([older, newer]), before)
  assert.equal(mergeConsider({}, []), null)
  assert.equal(mergeConsider([{ id: 'a' }], []), null)
})

// ── 4.1 drops seen: the rule ────────────────────────────────────────────────────────────────────

test('drops seen: a destroy, a row with no source and an empty item are not drops; a stack adds its count', () => {
  const rows = [
    { ts: 1, item: 'Bone Chips', source: 'a rat', count: 2 },
    { ts: 2, item: 'bone chips', source: 'A rat' },
    { ts: 3, item: 'Bone Chips', source: 'a rat', disposition: 'destroyed', count: 5 },
    { ts: 4, item: 'Rat Ear' },
    { ts: 5, item: ' ', source: 'a rat' },
    'not a row'
  ]
  assert.deepEqual(dropsFromLoot(rows, ['a rat']), [{ item: 'Bone Chips', count: 3, lastTs: 2 }])
})

test('drops seen: every spelling of one mob counts, and the order is the engine\'s', () => {
  const rows = [
    { ts: 1, item: 'B', source: 'Cazic-Thule' },
    { ts: 2, item: 'A', source: 'Cazic Thule' },
    { ts: 3, item: 'C', source: 'Cazic Thule' },
    { ts: 3, item: 'C', source: 'Cazic Thule' }
  ]
  assert.deepEqual(dropsFromLoot(rows, ['cazic thule', 'cazic-thule']).map((d) => d.item), ['C', 'A', 'B'])
})

test('drops seen: the join adds counts, keeps the later time and the archive\'s spelling', () => {
  const merged = mergeDropsSeen([{ item: 'Rat Ear', count: 2, lastTs: 5 }], [{ item: 'rat ear', count: 1, lastTs: 9 }])
  assert.deepEqual(merged, [{ item: 'Rat Ear', count: 3, lastTs: 9 }])
})

test('drops seen: nothing archived for the mob returns the served box as the same object', () => {
  const box = { seen: [{ item: 'x', count: 1, lastTs: 1 }] }
  assert.equal(withArchivedDrops(box, [[{ ts: 1, item: 'y', source: 'someone else' }]], ['a rat']), box)
  assert.equal(withArchivedDrops(box, [], ['a rat']), box)
  const empty = {}
  assert.deepEqual(withArchivedDrops(empty, [[{ ts: 1, item: 'y', source: 'a rat' }]], ['a rat']), {
    seen: [{ item: 'y', count: 1, lastTs: 1 }]
  })
})

// ── 4.2 item tiers ──────────────────────────────────────────────────────────────────────────────

for (const [name, set] of [['wl40', WL], ['la2', LA]] as const) {
  test(`split log (${name}): item tiers of A merged with B equal the item tiers of the whole log`, () => {
    assert.deepEqual(mergeModule('itemTiers', [set.a.itemTiers], set.b.itemTiers).state, set.whole.itemTiers)
  })
}

test('split log: an item is upgraded in both halves of both fixtures, and la2 names a lower tier last', () => {
  for (const set of [WL, LA]) {
    assert.ok(Object.keys(set.a.itemTiers).some((k) => Object.prototype.hasOwnProperty.call(set.b.itemTiers, k)))
  }
  const fists = LA.whole.itemTiers['whitened treant fists']
  assert.ok(fists.tier !== undefined && fists.lastTier !== undefined && fists.lastTier < fists.tier)
})

const tierRow = (over: Partial<ItemTierRow>): ItemTierRow => ({ key: 'k', name: 'K', merges: 1, firstAt: 1, lastAt: 1, ...over })

test('item tiers: the higher tier wins, the newer last tier stands, merges add, first and last instants span both', () => {
  const m = mergeItemTiers({ k: tierRow({ tier: 4, lastTier: 4, merges: 3, firstAt: 1, lastAt: 5 }) }, { k: tierRow({ name: 'k', tier: 2, lastTier: 2, firstAt: 9, lastAt: 12 }) })
  assert.deepEqual(m, { k: { key: 'k', name: 'k', tier: 4, lastTier: 2, merges: 4, firstAt: 1, lastAt: 12 } })
})

test("item tiers: a side that named no tier keeps the other side's, and absent stays absent", () => {
  const m = mergeItemTiers({ k: tierRow({ tier: 3, lastTier: 3 }) }, { k: tierRow({ firstAt: 7, lastAt: 7 }) })
  assert.equal(m?.k.tier, 3)
  assert.equal(m?.k.lastTier, 3)
  const none = mergeItemTiers({ k: tierRow({}) }, { k: tierRow({ lastAt: 4 }) })
  assert.ok(none && !('tier' in none.k) && !('lastTier' in none.k))
})

test('item tiers: inputs are not changed, and a bad shape is not merged', () => {
  const older = { k: tierRow({ tier: 1 }) }
  const newer = { k: tierRow({ tier: 2 }) }
  const before = JSON.stringify([older, newer])
  mergeItemTiers(older, newer)
  assert.equal(JSON.stringify([older, newer]), before)
  assert.equal(mergeItemTiers([], {}), null)
  assert.equal(mergeItemTiers({ k: { key: 'k' } }, {}), null)
})

// ── 4.3 class unlocks and raw turn-ins ──────────────────────────────────────────────────────────

test('split log: class unlocks of A merged with B equal the whole log, the repeated sighting in B left out', () => {
  assert.deepEqual(mergeModule('classUnlocks', [LA.a.classUnlocks], LA.b.classUnlocks).state, LA.whole.classUnlocks)
})

test('split log: turn-ins of A merged with B equal the turn-ins of the whole log', () => {
  assert.deepEqual(mergeModule('turnins', [LA.a.turnins], LA.b.turnins).state, LA.whole.turnins)
})

test('split log: la2 unlocks one class in both halves and trades in both', () => {
  const a = (LA.a.classUnlocks ?? []).map((r) => r.className)
  assert.ok((LA.b.classUnlocks ?? []).some((r) => a.includes(r.className)))
  assert.ok((LA.a.turnins ?? []).length > 0 && (LA.b.turnins ?? []).length > 0)
})

test('class unlocks: the earliest sighting wins, case-folded, and a bad shape is not merged', () => {
  const older = [{ ts: 1, className: 'Paladin' }]
  const newer = [{ ts: 5, className: 'paladin' }, { ts: 6, className: 'Rogue' }]
  assert.deepEqual(mergeClassUnlocks(older, newer), [{ ts: 1, className: 'Paladin' }, { ts: 6, className: 'Rogue' }])
  assert.equal(older.length + newer.length, 3, 'inputs are not changed')
  assert.equal(mergeClassUnlocks([{ ts: 1 }], []), null)
  assert.equal(mergeClassUnlocks({}, []), null)
})

test('turn-ins: rows join older first', () => {
  const a = { ts: 1, npc: 'A', items: ['x'] }
  const b = { ts: 2, npc: 'B', items: ['y'] }
  assert.deepEqual(mergeTurnIns([a], [b]), [a, b])
  assert.equal(mergeTurnIns({}, []), null)
})

// ── 4.4 respawn ─────────────────────────────────────────────────────────────────────────────────

test('split log: respawn of A merged with B equals the respawn state of the whole log', () => {
  assert.deepEqual(mergeModule('respawn', [WL.a.respawn], WL.b.respawn).state, WL.whole.respawn)
})

test('split log: the respawn fixture really is split, and the candidate cap really binds', () => {
  const a = WL.a.respawn?.recent ?? []
  const b = WL.b.respawn?.recent ?? []
  assert.ok(a.some((c) => b.some((d) => d.key === c.key && d.zone === c.zone)), 'a mob is killed in both halves')
  assert.ok(new Set([...a, ...b].map((c) => `${c.zone}::${c.key}`)).size > RESPAWN_MAX_RECENT)
})

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

test('respawn: learned gaps join newest first under the cap, samples and kills add, the bound takes the smaller', () => {
  const older = respawnSnap([clock({ kills: 5, samples: 4, observedMs: 300_000, gapsMs: [400_000, 300_000, 500_000, 600_000] })], [])
  const newer = respawnSnap([clock({ kills: 4, samples: 3, observedMs: 350_000, gapsMs: [360_000, 350_000, 370_000], baseTs: 900 })], [{ key: 'a ghoul', display: 'a ghoul' }])
  const row = mergeRespawn(older, newer)?.rows[0]
  assert.ok(row)
  assert.deepEqual(row.gapsMs, [360_000, 350_000, 370_000, 400_000, 300_000, 500_000])
  assert.equal(row.gapsMs.length, RESPAWN_MAX_GAPS)
  assert.equal(row.samples, 7)
  assert.equal(row.kills, 9)
  assert.equal(row.observedMs, 300_000)
  assert.equal(row.estimateMs, 300_000)
  assert.equal(row.source, 'observed')
  assert.equal(row.baseTs, 900, 'the clock is the live one')
})

test("respawn: an archived clock shows only for a mob the live list watches, with today's custom number", () => {
  const older = respawnSnap([clock({ samples: 1, observedMs: 200_000, customMs: 60_000, source: 'custom', estimateMs: 60_000 })], [{ key: 'a ghoul', display: 'a ghoul', customSec: 60 }])
  const unwatched = mergeRespawn(older, respawnSnap([], []))
  assert.deepEqual(unwatched?.rows, [])
  const watched = mergeRespawn(older, respawnSnap([], [{ key: 'a ghoul', display: 'a ghoul' }]))
  assert.equal(watched?.rows.length, 1)
  assert.equal(watched?.rows[0].customMs, undefined)
  assert.equal(watched?.rows[0].source, 'observed')
  assert.equal(watched?.rows[0].estimateMs, 200_000)
})

test('respawn: candidates join, the live watch list says which are watched, and the present is the live state', () => {
  const cand = (key: string, lastTs: number, kills: number): RespawnCandidate => ({ key, display: key, zone: 'Guk', lastTs, kills, watched: false })
  const older = respawnSnap([], [], [cand('a ghoul', 50, 2), cand('a rat', 40, 1)])
  const newer: RespawnSnap = { ...respawnSnap([], [{ key: 'a rat', display: 'a rat' }], [cand('a ghoul', 90, 3)]), zone: 'Now' }
  const m = mergeRespawn(older, newer)
  assert.deepEqual(m?.recent, [{ ...cand('a ghoul', 90, 5) }, { ...cand('a rat', 40, 1), watched: true }])
  assert.equal(m?.zone, 'Now')
  assert.equal(m?.prefs, newer.prefs)
})

test('respawn: inputs are not changed, and a different shape version is not merged', () => {
  const older = respawnSnap([clock({ gapsMs: [1] })], [], [{ key: 'k', display: 'k', zone: 'z', lastTs: 1, kills: 1, watched: false }])
  const newer = respawnSnap([clock({ gapsMs: [2] })], [], [{ key: 'k', display: 'k', zone: 'z', lastTs: 2, kills: 1, watched: false }])
  const before = JSON.stringify([older, newer])
  mergeRespawn(older, newer)
  assert.equal(JSON.stringify([older, newer]), before)
  assert.equal(mergeRespawn({ ...older, v: 3 }, newer), null)
  assert.equal(mergeRespawn({ v: 4 }, newer), null)
})

// ── 4.5 progression ─────────────────────────────────────────────────────────────────────────────

/**
 * THE ONE SAMPLE ALLOWED TO DIFFER. Line 470, the last line of A, is `You gain experience!
 * (2.650%)`. The parser holds an experience line until the next line arrives, so a log that ends
 * on one never publishes it: A alone has no such sample, and the whole log has it at index 170.
 * The same line is why the kills test above lets one credit go. A live log archived just after an
 * experience line loses it the same way.
 */
function wholeProgressionAsSplitSeesIt(): ProgressionSnap {
  const p = structuredClone(WL.whole.progression)
  const at = p.expTs.indexOf(Date.UTC(2026, 7, 2, 16, 11, 12))
  assert.equal(at, 170)
  for (const col of [p.expTs, p.expPct, p.expFlag]) col.splice(at, 1)
  return p
}

test('split log (wl40): progression of A merged with B equals the whole log, but for the held experience line', () => {
  assert.deepEqual(mergeModule('progression', [WL.a.progression], WL.b.progression).state, wholeProgressionAsSplitSeesIt())
})

test("split log (la2): progression of A merged with B equals the whole log, a kill before B's first zone line included", () => {
  assert.deepEqual(mergeModule('progression', [LA.a.progression], LA.b.progression).state, LA.whole.progression)
})

test('split log: the progression fixtures are split, and la2 carries a zone across the cut', () => {
  assert.ok(WL.a.progression.killTs.length > 0 && WL.b.progression.killTs.length > 0)
  assert.ok(WL.a.progression.expTs.length > 0 && WL.b.progression.expTs.length > 0)
  assert.equal(LA.a.progression.zoneEnd.at(-1), 0, "A's last zone band is open")
  assert.equal(LA.b.progression.killZone[0], -1, "B's first kill has no zone of its own")
})

function progression(over: Partial<ProgressionSnap>): ProgressionSnap {
  const empty: ProgressionSnap = {
    expTs: [], expPct: [], expFlag: [], killTs: [], killZone: [], killCredit: [], witnessTs: [], recentKills: [],
    lootTs: [], zoneStart: [], zoneEnd: [], zoneName: [], offlineStart: [], offlineEnd: [], offlineCamped: [],
    levelTs: [], levelValue: [], aaGainTs: [], aaGainAmount: [], lastTs: 0, windowStart: 0, dropped: 0
  }
  return { ...empty, ...over }
}

test("progression: live zone indexes move past the archive's, and the archive's open band closes at the live first zone", () => {
  const older = progression({ zoneStart: [10, 20], zoneEnd: [20, 0], zoneName: ['A', 'B'], killTs: [15], killZone: [0], killCredit: [0] })
  const newer = progression({ zoneStart: [50], zoneEnd: [0], zoneName: ['C'], killTs: [40, 60], killZone: [-1, 0], killCredit: [0, 1], lastTs: 60 })
  const m = mergeProgression(older, newer)
  assert.ok(m)
  assert.deepEqual(m.zoneEnd, [20, 50, 0])
  assert.deepEqual(m.killZone, [0, 1, 2], 'the kill before the live first zone line is in the zone the archive ended in')
  assert.equal(m.lastTs, 60)
})

test('progression: a live side that dropped history carries no zone across, since -1 may mean an aged-out zone', () => {
  const older = progression({ zoneStart: [10], zoneEnd: [0], zoneName: ['A'] })
  const newer = progression({ killTs: [40], killZone: [-1], killCredit: [0], recentKills: [{ ts: 40, name: 'x', credit: 0, zone: '' }], windowStart: 30, dropped: 5 })
  const m = mergeProgression(older, newer)
  assert.deepEqual(m?.killZone, [-1])
  assert.equal(m?.recentKills[0].zone, '')
  assert.equal(m?.dropped, 5)
  assert.equal(m?.windowStart, 30)
})

test("progression: the engine's caps apply to the joined columns, and the trim moves dropped and windowStart", () => {
  const n = 20_000 + 1_024
  const older = progression({ witnessTs: Array.from({ length: 1_024 }, (_, i) => i) })
  const newer = progression({ witnessTs: Array.from({ length: n - 1_024 }, (_, i) => 1_024 + i) })
  const m = mergeProgression(older, newer)
  assert.equal(m?.witnessTs.length, 20_000)
  assert.equal(m?.witnessTs[0], 1_024)
  assert.equal(m?.dropped, 1_024)
  assert.equal(m?.windowStart, 1_024)
  const kills = Array.from({ length: 30 }, (_, i) => ({ ts: i, name: 'k', credit: 0, zone: 'z' }))
  assert.equal(mergeProgression(progression({ recentKills: kills }), progression({ recentKills: kills }))?.recentKills.length, 50)
})

test('progression: inputs are not changed, and a bad shape is not merged', () => {
  const older = progression({ zoneStart: [1], zoneEnd: [0], zoneName: ['A'], recentKills: [{ ts: 1, name: 'x', credit: 0, zone: '' }] })
  const newer = progression({ zoneStart: [5], zoneEnd: [0], zoneName: ['B'], killTs: [3], killZone: [-1], killCredit: [0], recentKills: [{ ts: 3, name: 'y', credit: 0, zone: '' }] })
  const before = JSON.stringify([older, newer])
  mergeProgression(older, newer)
  assert.equal(JSON.stringify([older, newer]), before)
  assert.equal(mergeProgression({ ...older, expPct: [1] }, newer), null, 'columns of one group must line up')
  assert.equal(mergeProgression([], newer), null)
})

// ── the lookup ──────────────────────────────────────────────────────────────────────────────────

test('lookup: the phase 4 modules have rules', () => {
  for (const id of ['consider', 'itemTiers', 'classUnlocks', 'turnins', 'respawn', 'progression']) assert.ok(hasMergeRule(id), id)
})

test("lookup: an archived clock survives the fold, since the first archive is joined as itself and not through the empty template", () => {
  const older = respawnSnap([clock({ kills: 3, samples: 2, gapsMs: [400_000, 500_000] })], [])
  const live = { ...respawnSnap([], [{ key: 'a ghoul', display: 'a ghoul' }]), zone: '' }
  const rows = (mergeModule('respawn', [older], live).state as RespawnSnap).rows
  assert.deepEqual(rows.map((r) => [r.id, r.kills, r.gapsMs]), [['guk::a ghoul', 3, [400_000, 500_000]]])
})

test("lookup: the live side's dropped count is added once", () => {
  const older = progression({ dropped: 2, windowStart: 5 })
  const live = progression({ dropped: 7, windowStart: 9 })
  assert.equal((mergeModule('progression', [older], live).state as ProgressionSnap).dropped, 9)
})

test('bazaar: rows join by day, item, tier and direction, and the shared day adds up', () => {
  const row = (day: string, prices: number[], unpriced = 1): Record<string, unknown> => ({
    day,
    dir: 'sell',
    item: 'Fleeting Quiver',
    tier: 0,
    n: prices.length,
    unpriced,
    min: prices.length > 0 ? Math.min(...prices) : null,
    max: prices.length > 0 ? Math.max(...prices) : null,
    sum: prices.reduce((a, b) => a + b, 0),
    prices
  })
  const older = { rows: [row('2026-10-05', [20000]), row('2026-10-06', [18000])] }
  const newer = { rows: [row('2026-10-06', [19000, 21000]), row('2026-10-07', [])] }
  assert.deepEqual(mergeBazaar(older, newer), {
    rows: [row('2026-10-05', [20000]), row('2026-10-06', [18000, 19000, 21000], 2), row('2026-10-07', [])]
  })
  const listless = { ...row('2026-10-06', [3, 5]), prices: undefined }
  const joined = mergeBazaar({ rows: [row('2026-10-06', [1, 2])] }, { rows: [listless] }) as { rows: { prices: number[] }[] }
  assert.deepEqual(joined.rows[0].prices, [1, 2, 4, 4], 'a row without its list stands for its average')
  const quoted = (who: string): unknown => ({ ...row('2026-10-06', [1]), quotes: [{ at: '10:00:00', who, price: 1, msg: 'WTS x 1pp' }] })
  const both = mergeBazaar({ rows: [quoted('Leric')] }, { rows: [quoted('Aaron')] }) as { rows: { quotes: { who: string }[] }[] }
  assert.deepEqual(both.rows[0].quotes.map((q) => q.who), ['Leric', 'Aaron'], 'the cut day keeps the quotes of both sides')
  const again = mergeBazaar({ rows: [quoted('Leric')] }, { rows: [quoted('leric')] }) as { rows: { quotes: { who: string }[] }[] }
  assert.deepEqual(again.rows[0].quotes.map((q) => q.who), ['leric'], 'one quote a person, the newer side winning')
  assert.equal(mergeBazaar({ rows: 'x' }, newer), null)
  assert.equal(mergeBazaar(older, []), null)
})

test('progression: coin and death columns join when either side has them, and stay absent when neither does', () => {
  const older = progression({ ...({ coinTs: [1], coinCopper: [10] } as Partial<ProgressionSnap>) })
  const newer = progression({ ...({ coinTs: [5], coinCopper: [20], deathTs: [6], deathKiller: ['a shiverback'] } as Partial<ProgressionSnap>) })
  const m = mergeProgression(older, newer) as unknown as Record<string, unknown[]>
  assert.deepEqual(m.coinTs, [1, 5])
  assert.deepEqual(m.coinCopper, [10, 20])
  assert.deepEqual(m.deathTs, [6])
  assert.deepEqual(m.deathKiller, ['a shiverback'])
  const sold = progression({ ...({ coinTs: [7], coinCopper: [30], coinSold: ['a bone chip'] } as Partial<ProgressionSnap>) })
  const s = mergeProgression(older, sold) as unknown as Record<string, unknown[]>
  assert.deepEqual(s.coinSold, ['', 'a bone chip'], 'coinSold joins, padded where a side lacks it')
  const plain = mergeProgression(progression({}), progression({})) as unknown as Record<string, unknown>
  assert.equal('coinTs' in plain, false)
})

test('progression: the coin cap trims the joined column and moves dropped and windowStart', () => {
  const ts = Array.from({ length: 20_000 + 1_024 }, (_, i) => i)
  const older = progression({ ...({ coinTs: ts.slice(0, 1_024), coinCopper: ts.slice(0, 1_024) } as Partial<ProgressionSnap>) })
  const newer = progression({ ...({ coinTs: ts.slice(1_024), coinCopper: ts.slice(1_024) } as Partial<ProgressionSnap>) })
  const m = mergeProgression(older, newer)
  const coin = (m as unknown as Record<string, number[]>).coinTs
  assert.equal(coin.length, 20_000)
  assert.equal(m?.dropped, 1_024)
  assert.equal(m?.windowStart, 1_024)
})
