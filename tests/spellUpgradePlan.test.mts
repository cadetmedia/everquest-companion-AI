// WHERE SHOULD MY NEXT MOTES GO (docs/plans/spell-upgrades-and-loadout.md §4.2) — the ranking, the
// dead-ends panel, and the one subtlety that decides whether the answer is useful.
//
// THE SUBTLETY, RESTATED SO THE TESTS BELOW READ AS A CLAIM: candidates rank on the FRACTION of
// their own base a tier adds, per mote - not on raw gained damage. Ranking on raw would tell a
// level-50 wizard to pour motes into whichever spell hits hardest, for the trivial reason that a
// percentage of a bigger number is bigger. That is not the question anybody is asking.

import assert from 'node:assert/strict'
import { test } from 'node:test'
import type { UnlockSpell } from '../src/shared/levelUnlocks'
import type { ObservedSpellRanksSnap } from '../src/shared/spellRanks'
import { buildUpgradePlan, heldRank, motesBetween } from '../src/shared/spellUpgradePlan'
import { SPELL_MAX_RANK } from '../src/shared/spellScale'

function spell(over: Partial<UnlockSpell> & { name: string }): UnlockSpell {
  return { at: [{ cls: 'WIZ', level: 20 }], ...over } as UnlockSpell
}

/** An observed-rank map, as the module publishes one. */
function held(rows: Record<string, number>): ObservedSpellRanksSnap {
  const out: ObservedSpellRanksSnap = {}
  for (const [name, rank] of Object.entries(rows)) {
    out[name.toLowerCase()] = {
      key: name.toLowerCase(),
      name,
      rank,
      merges: 0,
      firstAt: 0,
      lastAt: 0
    }
  }
  return out
}

const NUKE = spell({
  name: 'Nuke',
  upgradeCategory: 'nuke',
  metrics: { damage: 300 } as UnlockSpell['metrics']
})
const BIGNUKE = spell({
  name: 'Bignuke',
  upgradeCategory: 'nuke',
  metrics: { damage: 3000 } as UnlockSpell['metrics']
})
const BEAR = spell({ name: 'Bear', upgradeCategory: 'buff', mana: 100, durationMs: 60000 })

// =================================================================================================
// THE CORPUS IS WHAT YOU HOLD
// =================================================================================================

test('a line the log has never watched is not in this readout at all', () => {
  // The Spellbook tab is where the whole catalog lives; this tab is about YOUR decision.
  const plan = buildUpgradePlan([NUKE, BIGNUKE], held({ Nuke: 2 }))
  assert.equal(plan.heldCount, 1)
  assert.deepEqual(plan.next.map((c) => c.name), ['Nuke'])
})

test('with no observed map at all, nothing is held and nothing is claimed', () => {
  const plan = buildUpgradePlan([NUKE, BEAR], null)
  assert.deepEqual(plan, { next: [], deadEnds: [], unrankedCount: 0, heldCount: 0, otherClassCount: 0 })
})

test('a line watched only at base still counts as held', () => {
  // Presence in the map is the evidence, not a positive rank: the log watching you cast the base of
  // a line is still evidence you own it.
  const plan = buildUpgradePlan([NUKE], held({ Nuke: 0 }))
  assert.equal(plan.heldCount, 1)
  assert.equal(plan.next[0].rank, 0)
  assert.equal(plan.next[0].nextTier, 1)
  assert.equal(plan.next[0].motes, 1)
})

test('a spell the catalog lists twice is one row and one held line', () => {
  // Dustdevil and Shock of Frost each have two catalog rows of the same name.
  const plan = buildUpgradePlan([NUKE, { ...NUKE }, BEAR, { ...BEAR }], held({ Nuke: 2, Bear: 1 }))
  assert.equal(plan.heldCount, 2)
  assert.deepEqual(plan.next.map((c) => c.name), ['Nuke'])
  assert.deepEqual(plan.deadEnds.map((d) => d.name), ['Bear'])
})

// =================================================================================================
// THE RANKING
// =================================================================================================

test('two nukes at the same rank rank EQUALLY, however hard they hit', () => {
  // The whole point of ranking on a fraction. 300 damage and 3000 damage both gain 6% a tier, so
  // the next mote buys exactly as much improvement in either - and the tie breaks on the name.
  const plan = buildUpgradePlan([BIGNUKE, NUKE], held({ Nuke: 1, Bignuke: 1 }))
  assert.deepEqual(plan.next.map((c) => c.name), ['Bignuke', 'Nuke'])
  assert.equal(plan.next[0].perMote, plan.next[1].perMote)
})

test('the lower-ranked line wins, because its next rung is cheaper', () => {
  const plan = buildUpgradePlan([NUKE, BIGNUKE], held({ Nuke: 2, Bignuke: 5 }))
  // Nuke's tier 3 costs 4 motes; Bignuke's tier 6 costs 32. Same fractional gain, an eighth of the
  // cost.
  assert.equal(plan.next[0].name, 'Nuke')
  assert.equal(plan.next[0].motes, 4)
  assert.equal(plan.next[1].motes, 32)
  assert.ok(plan.next[0].perMote > plan.next[1].perMote * 5)
})

test('AN OBSERVED RANK OF 1 READS AS BASE, which is an evidence rule and not arithmetic', () => {
  // `normalizeSpellRank`'s own law: the observed-rank fold cannot tell a log line spelling
  // `Clarity I` from one spelling `Clarity`, so 1 reads as no upgrade. It errs DOWNWARD - a
  // genuinely +1 spell reads six percent low rather than a base spell reading six percent high.
  const plan = buildUpgradePlan([NUKE], held({ Nuke: 1 }))
  assert.equal(plan.next[0].rank, 0)
  assert.equal(plan.next[0].nextTier, 1)
  assert.equal(plan.next[0].motes, 1)
  // …and the COST CURVE has no such doubt: tier 1 costs one mote whatever the log could see.
  assert.equal(motesBetween(0, 1), 1)
})

test('a line at the cap has no next rung to buy and is not ranked', () => {
  const plan = buildUpgradePlan([NUKE], held({ Nuke: SPELL_MAX_RANK }))
  assert.equal(plan.heldCount, 1)
  assert.equal(plan.next.length, 0)
  assert.equal(plan.unrankedCount, 1)
})

test('a candidate states both figures and the tier it is about', () => {
  const plan = buildUpgradePlan([NUKE], held({ Nuke: 3 }))
  const c = plan.next[0]
  assert.equal(c.rank, 3)
  assert.equal(c.nextTier, 4)
  assert.equal(c.motes, 8)
  assert.equal(c.measure, 'damage')
  // 300 + floor(300 x 6 x 3 / 100) = 354, and at tier 4, 372.
  assert.equal(c.from, 354)
  assert.equal(c.to, 372)
  assert.ok(c.gainFraction > 0)
})

// =================================================================================================
// THE DEAD ENDS — the fork user's own question
// =================================================================================================

test('a buff goes to the dead-ends panel and says what it DOES buy', () => {
  const plan = buildUpgradePlan([BEAR], held({ Bear: 2 }))
  assert.equal(plan.next.length, 0)
  assert.deepEqual(plan.deadEnds.map((d) => d.name), ['Bear'])
  const s = plan.deadEnds[0].sentence
  assert.match(s, /the numbers it grants never change/)
  assert.match(s, /costs less mana/)
  // No em dashes in user-facing copy (AGENTS.md, UI conventions).
  assert.ok(!/[–—]/.test(s))
})

test('a spell a tier changes nothing at all about says exactly that', () => {
  const nothing = spell({ name: 'Inert', upgradeCategory: 'buff' })
  const plan = buildUpgradePlan([nothing], held({ Inert: 1 }))
  assert.equal(plan.deadEnds[0].sentence, 'a tier changes nothing this app can measure')
})

test('a nuke the catalog states no damage for is a DEAD END, not a candidate', () => {
  // `upgradePayoff` needs a rate AND a figure for it to act on. A nuke with no stated damage has a
  // rate and nothing to apply it to, so upgrading it genuinely buys no bigger numbers - which is
  // what the dead-ends panel is for. Silence about a magnitude is not a magnitude (law 1).
  const noFigures = spell({ name: 'Odd', upgradeCategory: 'nuke' })
  const plan = buildUpgradePlan([NUKE, noFigures], held({ Nuke: 2, Odd: 2 }))
  assert.equal(plan.heldCount, 2)
  assert.deepEqual(plan.next.map((c) => c.name), ['Nuke'])
  assert.deepEqual(plan.deadEnds.map((d) => d.name), ['Odd'])
})

test('the unvaluable are COUNTED, never silently dropped', () => {
  // A reader who owns 40 lines and sees 12 rows has to be able to tell where the other 28 went. The
  // one way a line reaches this count today is the CAP: it has figures and no next rung to buy.
  const plan = buildUpgradePlan([NUKE, BIGNUKE], held({ Nuke: 2, Bignuke: SPELL_MAX_RANK }))
  assert.equal(plan.heldCount, 2)
  assert.equal(plan.next.length, 1)
  assert.equal(plan.unrankedCount, 1)
})

// =================================================================================================
// YOUR CLASSES (owner, 2026-10-20: "i don't think that the upgrades tab is respecting the classes i
// am using or selecting?")
// =================================================================================================

// The owner's own shape: a WAR/MNK/SHM character whose log also holds casts from stints as other
// classes. Each spell carries the (class, level) pairs the catalog states for it.
const ENVENOMED = spell({
  name: 'Envenomed Bolt',
  upgradeCategory: 'nuke',
  metrics: { damage: 400 } as UnlockSpell['metrics'],
  at: [{ cls: 'SHM', level: 49 }, { cls: 'NEC', level: 50 }]
})
const WRATH = spell({
  name: 'Wrath',
  upgradeCategory: 'nuke',
  metrics: { damage: 300 } as UnlockSpell['metrics'],
  at: [{ cls: 'CLR', level: 29 }, { cls: 'PAL', level: 34 }]
})
const FORCE_SNAP = spell({
  name: 'Force Snap',
  upgradeCategory: 'nuke',
  metrics: { damage: 100 } as UnlockSpell['metrics'],
  at: [{ cls: 'WIZ', level: 17 }]
})
const SWAPPED = held({ 'Envenomed Bolt': 9, Wrath: 6, 'Force Snap': 3 })

test('a held line none of your classes casts is set aside, and counted', () => {
  const plan = buildUpgradePlan([ENVENOMED, WRATH, FORCE_SNAP], SWAPPED, ['WAR', 'MNK', 'SHM'])
  assert.deepEqual(plan.next.map((c) => c.name), ['Envenomed Bolt'])
  assert.equal(plan.heldCount, 1)
  assert.equal(plan.otherClassCount, 2)
})

test('one class of the trio casting it is enough, at any level', () => {
  // Envenomed Bolt is a Necromancer spell too; the Shaman pair is what admits it here. A Paladin
  // pick admits Wrath at 34 for a character the log has already watched casting it.
  const plan = buildUpgradePlan([ENVENOMED, WRATH, FORCE_SNAP], SWAPPED, ['WAR', 'PAL', 'MNK'])
  assert.deepEqual(plan.next.map((c) => c.name), ['Wrath'])
  assert.equal(plan.otherClassCount, 2)
})

test('an empty filter (every class, on the Spellbook) filters nothing, as before the pick existed', () => {
  const plan = buildUpgradePlan([ENVENOMED, WRATH, FORCE_SNAP], SWAPPED, [])
  assert.equal(plan.heldCount, 3)
  assert.equal(plan.otherClassCount, 0)
  assert.deepEqual(buildUpgradePlan([ENVENOMED, WRATH, FORCE_SNAP], SWAPPED), plan)
})

// =================================================================================================
// THE MOTE ARITHMETIC
// =================================================================================================

test('the cost between two tiers is the sum of the rungs, and never negative', () => {
  assert.equal(motesBetween(0, 1), 1)
  assert.equal(motesBetween(0, 4), 1 + 2 + 4 + 8)
  assert.equal(motesBetween(3, 5), 8 + 16)
  assert.equal(motesBetween(0, SPELL_MAX_RANK), 1023)
  // You cannot un-spend motes, and a negative cost would read as a refund.
  assert.equal(motesBetween(5, 3), 0)
  assert.equal(motesBetween(5, 5), 0)
})

test('heldRank folds the LINE, so a ranked name and a bare one are one row', () => {
  const map = held({ Odium: 7 })
  assert.equal(heldRank(map, 'Odium'), 7)
  assert.equal(heldRank(map, 'Odium VII'), 7)
  assert.equal(heldRank(null, 'Odium'), 0)
  assert.equal(heldRank(map, 'Something Else'), 0)
})
