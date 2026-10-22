// ============================================================================
// logArchiveMergeLater.test.mts — the merge rules added on 2026-10-08, one section per step of
// docs/plans/log-archive/phase-4-more-history.md.
// ============================================================================
//
// The split-log fixtures `la3-{a,b,whole}.json` are `tests/fixtures/logArchive/la3-gems-run.log` cut
// after line 10: ranked casts and merges, gems memorized and forgotten, two saved sets, and the
// character's own `/who` row on both sides of the cut. To re-record: cut the log the same way into
// files named `eqlog_Primitive_freeport.<part>.txt`, run
// `engine/target/release/parity.exe <file> --snapshots --tz UTC` on each, and keep each module's
// `snapshot.state`.

import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { hasMergeRule, mergeModule } from '../src/shared/logArchive/mergeRules'
import { mergeSpellRanks } from '../src/shared/logArchive/mergeSpellRanks'
import { mergeSpellSets } from '../src/shared/logArchive/mergeSpellSets'
import { mergeBuffStats } from '../src/shared/logArchive/mergeBuffStats'
import { correctionFor, firstStart, mergeCombo, withCorrections } from '../src/shared/logArchive/mergeCombo'
import type { ObservedSpellRanksSnap } from '../src/shared/spellRanks'
import type { SpellSetsSnap } from '../src/shared/spellSets'
import type { ComboCorrection, ComboInterval, ComboSnap } from '../src/shared/classCombo'
import type { BuffStat, BuffsSnap } from '../src/shared/buffTypes'

interface Recorded {
  observedSpellRanks: ObservedSpellRanksSnap
  spellSets: SpellSetsSnap
  combo: ComboSnap
}

const fixture = (name: string): Recorded =>
  JSON.parse(readFileSync(new URL(`fixtures/logArchive/${name}.json`, import.meta.url), 'utf8')) as Recorded

const G = { a: fixture('la3-a'), b: fixture('la3-b'), whole: fixture('la3-whole') }

// ── 4.10 spell ranks ────────────────────────────────────────────────────────────────────────────

test('spell ranks: the rule is in the lookup', () => {
  assert.ok(hasMergeRule('observedSpellRanks'))
})

test('split log: observed spell ranks of A merged with B equal the whole log', () => {
  assert.deepEqual(mergeModule('observedSpellRanks', [G.a.observedSpellRanks], G.b.observedSpellRanks).state, G.whole.observedSpellRanks)
})

test('split log: the spell ranks fixture really is split', () => {
  const a = G.a.observedSpellRanks['shiftless deeds']
  const b = G.b.observedSpellRanks['shiftless deeds']
  assert.equal(a.mergedRank, 5, 'the merge is in A')
  assert.equal(b.mergedRank, undefined, 'and not in B')
  assert.equal(b.castRank, 6)
  assert.equal(G.b.observedSpellRanks["denon's disruptive discord"].castRank, undefined, 'the cast of the apostrophe line is in A only')
})

test('spell ranks: a rank learned only in the archive is kept, and absent stays absent', () => {
  const older: ObservedSpellRanksSnap = { mez: { key: 'mez', name: 'Mez', rank: 3, castRank: 3, merges: 0, firstAt: 1, lastAt: 2 } }
  const newer: ObservedSpellRanksSnap = { mez: { key: 'mez', name: 'Mez', rank: 1, merges: 2, firstAt: 5, lastAt: 9 } }
  assert.deepEqual(mergeSpellRanks(older, newer), { mez: { key: 'mez', name: 'Mez', rank: 3, castRank: 3, merges: 2, firstAt: 1, lastAt: 9 } })
  assert.equal(mergeSpellRanks(older, { mez: { key: 'mez' } }), null)
})

// ── 4.6 learned buff durations ──────────────────────────────────────────────────────────────────

const stat = (spell: string, n: number, medianMs: number): BuffStat => ({
  spell,
  cls: 'buff',
  n,
  medianMs,
  p25: medianMs,
  p75: medianMs,
  minMs: medianMs,
  maxMs: medianMs
})

test('buffs: the rule is in the lookup', () => {
  assert.ok(hasMergeRule('buffs'))
})

test('buffs: each spell keeps the summary of the newest stretch that saw it; the present is the live log', () => {
  const older: BuffsSnap = { active: [], stats: { a: stat('A', 9, 1000), b: stat('B', 4, 2000) } }
  const newer = { active: [{ spell: 'live' }], stats: { b: stat('B', 1, 3000) } } as unknown as BuffsSnap
  const merged = mergeModule('buffs', [older], newer).state as BuffsSnap
  assert.deepEqual(merged.stats, { a: stat('A', 9, 1000), b: stat('B', 1, 3000) })
  assert.equal(merged.active, newer.active)
  assert.equal(mergeBuffStats(older, { active: [] }), null)
})

// ── 4.11 spell sets ─────────────────────────────────────────────────────────────────────────────

/** The two named differences: B re-saves `primary` without the gems only A watched go in, and the
 *  memorized list is the live log's own. */
function wholeSetsAsSplitSeesThem(): SpellSetsSnap {
  const whole = structuredClone(G.whole.spellSets)
  whole.sets.primary = { ...whole.sets.primary, spells: [] }
  whole.memorized = []
  return whole
}

test('spell sets: the rule is in the lookup', () => {
  assert.ok(hasMergeRule('spellSets'))
})

test('split log: spell sets of A merged with B equal the whole log, but for the two named differences', () => {
  assert.deepEqual(mergeModule('spellSets', [G.a.spellSets], G.b.spellSets).state, wholeSetsAsSplitSeesThem())
})

test('split log: the spell sets fixture really is split', () => {
  assert.ok(Object.hasOwn(G.a.spellSets.sets, 'second') && !Object.hasOwn(G.b.spellSets.sets, 'second'), 'a set only A saved')
  assert.ok(Object.hasOwn(G.b.spellSets.sets, 'primary') && Object.hasOwn(G.a.spellSets.sets, 'primary'), 'a set both saved')
})

test('spell sets: the later definition of a name wins whichever side it is on, and gems are the live log only', () => {
  const def = (at: number, spells: string[]): SpellSetsSnap['sets'][string] => ({ spells, observedAt: at, source: 'saved' })
  const older: SpellSetsSnap = { v: 1, memorized: ['Old Gem'], sets: { x: def(10, ['A']), y: def(50, ['B']) } }
  const newer: SpellSetsSnap = { v: 1, memorized: ['New Gem'], sets: { x: def(20, ['C']), y: def(40, ['D']) } }
  assert.deepEqual(mergeSpellSets(older, newer), { v: 1, memorized: ['New Gem'], sets: { x: def(20, ['C']), y: def(50, ['B']) } })
  assert.equal(mergeSpellSets(older, { ...newer, v: 2 }), null)
})

// ── 4.12 class-loadout history ──────────────────────────────────────────────────────────────────

test('combo: the rule is in the lookup', () => {
  assert.ok(hasMergeRule('combo'))
})

test('split log: the combo history of A merged with B equals the whole log (one loadout across the cut)', () => {
  assert.deepEqual(mergeModule('combo', [G.a.combo], G.b.combo).state, G.whole.combo)
})

function interval(over: Partial<ComboInterval>): ComboInterval {
  return {
    id: 'ci1',
    startTs: 100,
    endTs: null,
    startLo: 100,
    startHi: 100,
    endLo: 150,
    endHi: null,
    startReason: 'logStart',
    expectedSlots: 2,
    slots: [
      { candidates: ['WAR'], confidence: 1, provenance: 'inferred', because: [] },
      { candidates: ['CLR'], confidence: 1, provenance: 'inferred', because: [] }
    ],
    levelLo: 10,
    levelHi: 12,
    evidenceCount: 4,
    userLocked: false,
    ...over
  }
}

const snap = (intervals: ComboInterval[]): ComboSnap => ({ intervals, current: intervals.at(-1) ?? null, ready: true })

test('combo: a different loadout after the cut closes the archived interval where the live one begins', () => {
  const live = interval({ startTs: 300, startLo: 300, startHi: 300, endLo: 320, slots: [interval({}).slots[0], { candidates: ['ENC'], confidence: 1, provenance: 'inferred', because: [] }] })
  const merged = mergeCombo(snap([interval({})]), snap([live]))
  assert.ok(merged)
  assert.deepEqual(merged.intervals.map((i) => [i.id, i.startTs, i.endTs, i.endLo, i.endHi]), [
    ['ci1', 100, 300, 150, 300],
    ['ci2', 300, null, 320, null]
  ])
  assert.equal(merged.current?.id, 'ci2')
})

test('combo: a level that went down across the cut is a swap, never one span', () => {
  const merged = mergeCombo(snap([interval({})]), snap([interval({ startTs: 300, levelLo: 5, levelHi: 6 })]))
  assert.equal(merged?.intervals.length, 2)
})

test('combo: an open slot on either side is not the same loadout', () => {
  const open = interval({ slots: [interval({}).slots[0], { candidates: ['CLR', 'PAL'], confidence: 0.5, provenance: 'inferred', because: [] }] })
  assert.equal(mergeCombo(snap([open]), snap([interval({ startTs: 300 })]))?.intervals.length, 2)
})

test('combo: a fresh live log with no interval yet keeps the archived one open, as the current loadout', () => {
  const merged = mergeCombo(snap([interval({})]), snap([]))
  assert.equal(merged?.current?.endTs, null)
  assert.equal(merged?.intervals.length, 1)
})

const correction = (startTs: number, endTs: number | null, classes: ComboCorrection['classes'], setAt = 1): ComboCorrection => ({ startTs, endTs, classes, setAt })

test('combo corrections: the engine rule, covering first, then most overlap, then the latest', () => {
  const a = correction(90, 120, ['WAR', 'ENC'], 1)
  const b = correction(110, 400, ['WAR', 'BER'], 2)
  assert.equal(correctionFor([a, b], 100, 300), a, 'a covers the start')
  assert.equal(correctionFor([b, correction(250, 260, ['ROG', 'BER'], 9)], 100, 300), b, 'most overlap')
  assert.equal(correctionFor([correction(150, 200, ['ROG', 'BER'], 1), correction(250, 300, ['WAR', 'BER'], 2)], 100, 300)?.setAt, 2, 'a tie goes to the later')
  assert.equal(correctionFor([correction(400, 500, ['ROG', 'BER'])], 100, 300), undefined)
})

test('combo corrections: an archived interval takes a correction placed over it', () => {
  const out = withCorrections(snap([interval({})]), [correction(90, 200, ['ROG', 'BER'])], 300) as ComboSnap
  assert.deepEqual(out.intervals[0].slots.map((s) => [s.candidates[0], s.provenance]), [['ROG', 'user'], ['BER', 'user']])
  assert.equal(out.intervals[0].userLocked, true)
})

test('combo corrections: today\'s open-ended loadout override does not reach back into the archive', () => {
  const today = correction(300, null, ['ROG', 'BER'])
  const out = withCorrections(snap([interval({})]), [today], 300) as ComboSnap
  assert.equal(out.intervals[0].userLocked, false)
  // With no live interval yet the archived one is the current loadout, and the override is for it.
  assert.equal((withCorrections(snap([interval({})]), [correction(90, null, ['ROG', 'BER'])], null) as ComboSnap).intervals[0].userLocked, true)
})

test('combo corrections: a span the game named with /who keeps its classes and says it was overruled', () => {
  const who = interval({ slots: interval({}).slots.map((s) => ({ ...s, provenance: 'who' as const })) })
  const out = withCorrections(snap([who]), [correction(90, 200, ['ROG', 'BER'])], 300) as ComboSnap
  assert.deepEqual(out.intervals[0].slots, who.slots)
  assert.equal(out.intervals[0].userOverruled, true)
})

test('combo corrections: firstStart reads the live log\'s first interval', () => {
  assert.equal(firstStart(G.b.combo), G.b.combo.intervals[0].startTs)
  assert.equal(firstStart(snap([])), null)
})

// ── 4.13 resist: no rule ────────────────────────────────────────────────────────────────────────

test("resist has no rule: the archived log's bucket is kept in the engine's own ledger (step 5.2), and the snapshot counts every bucket, so a rule would count the archive twice", () => {
  assert.equal(hasMergeRule('resist'), false)
})
