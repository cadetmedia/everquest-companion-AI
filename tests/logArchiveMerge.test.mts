// ============================================================================
// logArchiveMerge.test.mts — the merge rules, and the split-log test (log archive, steps 1.3 to 1.6).
// ============================================================================
//
// THE SPLIT-LOG TEST is what keeps every merge rule right. `tests/fixtures/wl40-farm-run.log` was cut
// at a line boundary into A (lines 1-470) and B (471-941), and the engine's own snapshot tool folded
// A, B and the whole file once (`parity <log> --snapshots`); the three modules with a merge rule are
// kept in `tests/fixtures/logArchive/wl40-{a,b,whole}.json`. The test asserts merge(A, B) equals the
// whole, except for fields named below with the reason each one may differ.
//
// To re-record after a fold change: cut the log the same way into files named
// `eqlog_Primitive_freeport.<part>.txt` (the tool reads the character from the name), run
// `engine/target/release/parity.exe <file> --snapshots --tz UTC` on each, and keep `kills`, `loot`
// and `leveling` from the `modules` array, plus the phase 4 modules logArchiveMergeMore.test.mts
// reads from the same fixtures.

import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { mergeKills } from '../src/shared/logArchive/mergeKills'
import { mergeLoot } from '../src/shared/logArchive/mergeLoot'
import { mergeLeveling } from '../src/shared/logArchive/mergeLeveling'
import { hasMergeRule, mergeModule } from '../src/shared/logArchive/mergeRules'
import type { KillsSnap } from '../src/shared/kills'
import type { LevelingSnap, LootSnap } from '../src/shared/types'

interface Recorded {
  kills: KillsSnap
  loot: LootSnap
  leveling: LevelingSnap
}

const fixture = (part: string): Recorded =>
  JSON.parse(readFileSync(new URL(`fixtures/logArchive/wl40-${part}.json`, import.meta.url), 'utf8')) as Recorded

const A = fixture('a')
const B = fixture('b')
const WHOLE = fixture('whole')

// ── the split-log test ──────────────────────────────────────────────────────────────────────────

/**
 * THE ONE FIELD ALLOWED TO DIFFER. Line 470, the last line of A, is `You gain experience!`, and line
 * 471, the first of B, is the Teir`Dal shadowknight's slain line. A kill is credited when its
 * experience line lands just before the slain line (KILL_EXP_JOIN_MS), so the whole log credits
 * that kill and neither half can. Archiving a live log can cut a kill the same way, so this is the
 * plan's "context B does not have at its start", kept visible rather than avoided by moving the cut.
 */
function wholeKillsAsSplitSeesThem(): KillsSnap {
  const kills = structuredClone(WHOLE.kills)
  const sk = kills.mobs['a teir`dal shadowknight']
  sk.credited -= 1
  sk.tiers[-2].credited -= 1
  return kills
}

test('split log: kills of A merged with B equal the kills of the whole log', () => {
  assert.deepEqual(mergeModule('kills', [A.kills], B.kills).state, wholeKillsAsSplitSeesThem())
})

test('split log: loot of A merged with B equals the loot of the whole log', () => {
  assert.deepEqual(mergeModule('loot', [A.loot], B.loot).state, WHOLE.loot)
})

test('split log: leveling of A merged with B equals the leveling of the whole log', () => {
  assert.deepEqual(mergeModule('leveling', [A.leveling], B.leveling).state, WHOLE.leveling)
})

test('split log: a time slice over merged loot counts the same as over the whole log', () => {
  const merged = mergeModule('loot', [A.loot], B.loot).state as LootSnap
  const mid = WHOLE.loot[Math.floor(WHOLE.loot.length / 3)].ts
  const end = WHOLE.loot[Math.floor((WHOLE.loot.length * 2) / 3)].ts
  const inSlice = (rows: LootSnap): number => rows.filter((r) => r.ts >= mid && r.ts < end).length
  assert.ok(inSlice(WHOLE.loot) > 0)
  assert.equal(inSlice(merged), inSlice(WHOLE.loot))
})

test('split log: the fixture really is split, so the test above is not comparing a log with itself', () => {
  assert.ok(A.loot.length > 0 && B.loot.length > 0)
  assert.ok(A.leveling.levels.length > 0 && B.leveling.levels.length > 0)
  const shared = Object.keys(A.kills.mobs).filter((k) => Object.hasOwn(B.kills.mobs, k))
  assert.ok(shared.length > 0, 'some mob is killed in both halves, so tier runs really add')
})

// ── kills ───────────────────────────────────────────────────────────────────────────────────────

/** A tier run; `credit` is `[credited, lastCreditedTs]` when it differs from "all of them". */
const run = (count: number, firstTs: number, lastTs: number, credit: [number, number] = [count, lastTs]) => ({
  count,
  firstTs,
  lastTs,
  credited: credit[0],
  lastCreditedTs: credit[1]
})

test('kills: counts add, first seen takes the earlier, last seen and last credited the later', () => {
  const older: KillsSnap = {
    v: 5,
    mobs: {
      'a rat': { count: 2, bestTier: 0, firstTs: 100, lastTs: 200, credited: 2, display: 'A rat', tiers: { 0: run(2, 100, 200) } }
    }
  }
  const newer: KillsSnap = {
    v: 5,
    mobs: {
      'a rat': { count: 1, bestTier: 3, firstTs: 900, lastTs: 900, credited: 0, display: 'a rat', tiers: { 0: run(1, 900, 900, [0, 0]), 3: run(2, 950, 990) } }
    }
  }
  const m = mergeKills(older, newer)
  assert.ok(m)
  const rat = m.mobs['a rat']
  assert.deepEqual(rat.tiers[0], { count: 3, firstTs: 100, lastTs: 900, credited: 2, lastCreditedTs: 200 })
  assert.equal(rat.count, 5)
  assert.equal(rat.bestTier, 3)
  assert.equal(rat.firstTs, 100)
  assert.equal(rat.lastTs, 990)
  assert.equal(rat.display, 'A rat', 'the first spelling seen is kept')
})

test('kills: the inputs are not changed', () => {
  const older: KillsSnap = { v: 5, mobs: { x: { count: 1, bestTier: 0, firstTs: 1, lastTs: 1, credited: 1, display: 'x', tiers: { 0: run(1, 1, 1) } } } }
  const newer: KillsSnap = { v: 5, mobs: { x: { count: 1, bestTier: 0, firstTs: 5, lastTs: 5, credited: 1, display: 'x', tiers: { 0: run(1, 5, 5) } } } }
  const before = JSON.stringify([older, newer])
  mergeKills(older, newer)
  assert.equal(JSON.stringify([older, newer]), before)
})

test('kills: a different shape version is not merged', () => {
  assert.equal(mergeKills({ v: 4, mobs: {} }, { v: 5, mobs: {} }), null)
  assert.equal(mergeKills([], { v: 5, mobs: {} }), null)
})

// ── loot and leveling ───────────────────────────────────────────────────────────────────────────

test('loot: rows join older first', () => {
  assert.deepEqual(mergeLoot([{ ts: 1, item: 'a' }], [{ ts: 2, item: 'b' }]), [
    { ts: 1, item: 'a' },
    { ts: 2, item: 'b' }
  ])
  assert.equal(mergeLoot({}, []), null)
})

test('leveling: all four lists join older first, and the AA unspent total sees every purchase', () => {
  const older: LevelingSnap = { levels: [{ ts: 1, level: 10 }], aaGains: [{ ts: 1, amount: 3, nowHave: 3 }], aaSpends: [{ ts: 2, ability: 'X', cost: 2 }], aaPotions: [] }
  const newer: LevelingSnap = { levels: [{ ts: 5, level: 11 }], aaGains: [{ ts: 5, amount: 2, nowHave: 3 }], aaSpends: [{ ts: 6, ability: 'Y', cost: 1 }], aaPotions: [{ ts: 7 }] }
  const m = mergeLeveling(older, newer)
  assert.ok(m)
  assert.deepEqual(m.levels.map((l) => l.level), [10, 11])
  assert.equal(m.aaPotions.length, 1)
  const gained = m.aaGains.reduce((n, g) => n + g.amount, 0)
  const spent = m.aaSpends.reduce((n, s) => n + s.cost, 0)
  assert.equal(gained - spent, 2)
  assert.equal(mergeLeveling({ levels: [] }, newer), null)
})

// ── the lookup ──────────────────────────────────────────────────────────────────────────────────

test('lookup: kills, loot and leveling have rules; nothing else does', () => {
  assert.ok(hasMergeRule('kills') && hasMergeRule('loot') && hasMergeRule('leveling'))
  assert.ok(!hasMergeRule('character') && !hasMergeRule('combat') && !hasMergeRule('toString'))
})

test('lookup: no rule, or no archived state, returns the live state as the same object', () => {
  const live = { anything: true }
  assert.equal(mergeModule('character', [{ old: 1 }], live).state, live)
  const loot: LootSnap = []
  assert.equal(mergeModule('loot', [], loot).state, loot)
})

test('lookup: an archived state the rule refuses is left out, the others still merge', () => {
  const m = mergeModule('kills', [{ v: 4, mobs: {} }, A.kills], B.kills)
  assert.equal(m.used, 1)
  assert.deepEqual(m.state, wholeKillsAsSplitSeesThem())
})

test('lookup: several archives fold oldest first', () => {
  const m = mergeModule('loot', [[{ ts: 1, item: 'a' }], [{ ts: 2, item: 'b' }]], [{ ts: 3, item: 'c' }])
  assert.deepEqual((m.state as LootSnap).map((r) => r.item), ['a', 'b', 'c'])
  assert.equal(m.used, 2)
})
