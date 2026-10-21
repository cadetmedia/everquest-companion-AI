// THE BUFF-STACKING ENGINE (docs/plans/spell-upgrades-and-loadout.md §3.3) — every rule the port
// carries, driven by HAND-AUTHORED effect slots.
//
// NOT ONE BYTE OF `spells_us.txt` IS IN THIS FILE, and that is the standing law rather than a
// convenience: nothing derived from Daybreak's file is ever committed to this repo
// (`spellsUsParse.ts`'s header states it, and `spellsUsParse.test.mts` obeys the same rule). So the
// rows below are written by hand to the shape the parser produces, and the SPA numbers are the
// server's own.
//
// THE CASES ARE THE ALGORITHM'S BRANCHES, one apiece, plus the owner's own reported conflict.

import assert from 'node:assert/strict'
import { test } from 'node:test'
import {
  EFFECT_COUNT,
  calcSpellValue,
  checkStackConflict,
  conflictComponents,
  spellsConflict,
  stackView,
  triggeredSpellIds,
  type StackSource,
  type StackSpellView
} from '../src/shared/spellStack'

/** SPA ids the cases below name. The server's own numbers. */
const HP = 0
const AC = 1
const MOVEMENT = 3
const HASTE = 11
const OVERHASTE = 98
const COMPLETE_HEAL = 101
const STR = 4
const BLOCK_DIRECTIVE = 148

/**
 * A slot as the parser emits one, from the ARRAY INDEX the test wants it to land at.
 *
 * The `+ 1` is the file's own numbering and not an off-by-one: `spells_us.txt` numbers its slots
 * from 1, measured over the owner's install 2026-09-10 (slot 0 occurs on none of its 73,975
 * slot-bearing rows, slot 1 on 26,347), and `stackView` subtracts it back off. Writing the
 * translation HERE rather than in every case keeps each test saying what it means - "an effect in
 * the first slot" - instead of restating the file format once per fixture.
 */
function slot(
  slotIndex: number,
  effect: number,
  base: number,
  extra: { limit?: number; calc?: number; max?: number } = {}
): NonNullable<StackSource['slots']>[number] {
  return {
    slot: slotIndex + 1,
    effect,
    base,
    limit: extra.limit ?? 0,
    calc: extra.calc ?? 100,
    max: extra.max ?? 0
  }
}

let nextId = 1
/** A spell view. `good` defaults TRUE because most of these cases are buffs. */
function spell(over: Partial<StackSource> & { slots: StackSource['slots'] }): StackSpellView {
  return stackView({
    id: nextId++,
    name: `spell${String(nextId)}`,
    goodEffect: true,
    targetType: 5,
    durationFormula: 3,
    durationValue: 100,
    ...over
  })
}

const L = { worn: 50, cast: 50 }

// =================================================================================================
// THE OWNER'S OWN CASE
// =================================================================================================

test("Spirit of Wolf and Spirit of Bih`Li contest the MOVEMENT slot, not haste", () => {
  // Measured from the committed catalog: SoW grants movement only; Bih`Li grants movement AND ATK.
  // Both write SPA 3, so only one can stand - which is exactly what the owner reported, though the
  // slot is movement speed rather than the attack speed he named.
  const bihli = spell({ slots: [slot(0, MOVEMENT, 55), slot(1, STR, 15)], targetType: 0x29 })
  const sow = spell({ slots: [slot(0, MOVEMENT, 55)] })
  // BOTH DIRECTIONS OVERWRITE, and that is the answer worth surfacing rather than a symmetry bug.
  // The group-versus-single tie rule protects a group buff only from an IDENTICAL single one, and
  // these two are not identical: Bih`Li carries an ATK grant in a slot SoW leaves blank. So casting
  // SoW over Bih`Li really does take the movement slot - and silently costs you the ATK, which is
  // exactly what the Loadout tab has to be able to say out loud.
  assert.equal(checkStackConflict(bihli, sow, L), 'overwrites')
  assert.equal(checkStackConflict(sow, bihli, L), 'overwrites')
})

test('…and the group-versus-single tie rule DOES protect an identical group buff', () => {
  // Same effects in the same slots at the same magnitude: recasting the single-target version over
  // the group one you were just given would otherwise quietly drop you out of the group buff.
  const groupHaste = spell({ slots: [slot(0, HASTE, 130)], targetType: 0x29 })
  const singleHaste = spell({ slots: [slot(0, HASTE, 130)], targetType: 5 })
  assert.equal(checkStackConflict(groupHaste, singleHaste, L), 'blocked')
  assert.equal(checkStackConflict(singleHaste, groupHaste, L), 'overwrites')
})

test('a stronger movement buff takes the slot from a weaker one', () => {
  const weak = spell({ slots: [slot(0, MOVEMENT, 30)] })
  const strong = spell({ slots: [slot(0, MOVEMENT, 55)] })
  assert.equal(checkStackConflict(weak, strong, L), 'overwrites')
  assert.equal(checkStackConflict(strong, weak, L), 'blocked')
})

// =================================================================================================
// HASTE, AND THE SLOT THAT LOOKS LIKE IT AND IS NOT
// =================================================================================================

test('haste contests on the PERCENT, because the file stores 100 + percent', () => {
  // Celerity 47% is stored 147, Quickness 30% is stored 130. Compared raw they would both outrank
  // any non-haste effect; compared as percentages the stronger one simply wins.
  const quickness = spell({ slots: [slot(0, HASTE, 130)] })
  const celerity = spell({ slots: [slot(0, HASTE, 147)] })
  assert.equal(checkStackConflict(quickness, celerity, L), 'overwrites')
  assert.equal(checkStackConflict(celerity, quickness, L), 'blocked')
})

test('OVERHASTE stacks alongside haste - a different SPA is a different slot', () => {
  // SPA 98 beside SPA 11. This is the case a "same stat, higher wins" heuristic gets wrong, and it
  // is why `spellStats.ts` keeps `HASTE_V2` as its own key too.
  const haste = spell({ slots: [slot(0, HASTE, 147)] })
  const over = spell({ slots: [slot(0, OVERHASTE, 120)] })
  assert.equal(checkStackConflict(haste, over, L), 'stacks')
  assert.equal(checkStackConflict(over, haste, L), 'stacks')
})

// =================================================================================================
// SONGS
// =================================================================================================

test('a bard song and a spell never contest each other while both are beneficial', () => {
  const song = spell({ slots: [slot(0, HASTE, 110)], song: true })
  const spellHaste = spell({ slots: [slot(0, HASTE, 147)], song: false })
  assert.equal(checkStackConflict(song, spellHaste, L), 'stacks')
  assert.equal(checkStackConflict(spellHaste, song, L), 'stacks')
})

test('…but two songs do contest, and a song against a DEBUFF still does', () => {
  const weakSong = spell({ slots: [slot(0, HASTE, 110)], song: true })
  const strongSong = spell({ slots: [slot(0, HASTE, 130)], song: true })
  assert.equal(checkStackConflict(weakSong, strongSong, L), 'overwrites')
  // The song exemption is explicitly for two BENEFICIAL spells; a detrimental one is not exempt.
  const debuff = spell({ slots: [slot(0, HASTE, 90)], song: false, goodEffect: false })
  assert.notEqual(checkStackConflict(weakSong, debuff, L), 'stacks')
})

// =================================================================================================
// THE HP SLOT - WHERE DoT, HoT AND HEAL ALL MEET
// =================================================================================================

test('a HoT never loses its slot to a DoT, and a DoT never takes one from a HoT', () => {
  const hot = spell({ slots: [slot(0, HP, 20)], goodEffect: true })
  const dot = spell({ slots: [slot(0, HP, -20)], goodEffect: false })
  // A DoT cast onto a target already carrying a HoT does not contest that slot at all: both run.
  assert.equal(checkStackConflict(hot, dot, L), 'stacks')
  // The other way round the server REFUSES it - a heal is not allowed to take a DoT's slot.
  assert.equal(checkStackConflict(dot, hot, L), 'blocked')
})

test('two different DoTs are two DoTs, not a conflict', () => {
  const a = spell({ slots: [slot(0, HP, -20)], goodEffect: false })
  const b = spell({ slots: [slot(0, HP, -30)], goodEffect: false })
  assert.equal(checkStackConflict(a, b, L), 'stacks')
})

test('a complete heal shares its slot with nothing', () => {
  const ch = spell({ slots: [slot(0, COMPLETE_HEAL, 100)] })
  const other = spell({ slots: [slot(0, COMPLETE_HEAL, 100)] })
  assert.equal(checkStackConflict(ch, other, L), 'blocked')
})

// =================================================================================================
// AC, AND THE DEBUFF THAT DOES NOT CONTEST A BUFF
// =================================================================================================

test('an AC DEBUFF does not contest an AC buff`s slot', () => {
  const buff = spell({ slots: [slot(0, AC, 30)] })
  const debuff = spell({ slots: [slot(0, AC, -20)], goodEffect: false })
  assert.equal(checkStackConflict(buff, debuff, L), 'stacks')
})

// =================================================================================================
// POSITION, WHICH IS THE WHOLE REASON THE SLOT NUMBER IS CARRIED
// =================================================================================================

test('slots are POSITIONAL - the same effect in different slots does not contest', () => {
  // THIS TEST WAS BRIEFLY REWRITTEN TO ASSERT THE OPPOSITE, and it is back, which is worth the
  // paragraph (2026-09-10). The lockstep walk looked wrong because it missed nearly every conflict
  // anyone would ask about; matching by EFFECT wherever it sat caught all 40 blocks in the owner's
  // log, so the rule changed. Then he cast thirteen buffs on his pet and none of them failed, which
  // is 78 pairs that must NOT conflict - and effect-matching calls two of them conflicts
  // (`Strength + Infusion of Spirit`, `Dexterity + Infusion of Spirit`, whose STR and DEX rows sit
  // in different slots). Lockstep was right all along.
  //
  // What was actually broken was the DIRECTIVE pass, which is what settles cross-line stacking and
  // had never once fired - see `directiveBites` and `tests/stackGroundTruth.test.mts`.
  const a = spell({ slots: [slot(0, STR, 20)] })
  const b = spell({ slots: [slot(3, STR, 25)] })
  assert.equal(checkStackConflict(a, b, L), 'stacks')
  // …and in the SAME slot they do.
  const c = spell({ slots: [slot(0, STR, 25)] })
  assert.equal(checkStackConflict(a, c, L), 'overwrites')
})

test('a directive reaches across slots to the one it NAMES, and only that one', () => {
  // The half that was dead until 2026-09-10. Harnessing of Spirit is the shape: it grants STR itself
  // in its fourth slot and carries `BLOCK{STR below 67, slot 1}` and `OVERWRITE{STR below 67, slot
  // 1}`, which is why it refuses nine separate stat buffs in the owner's log even though their STR
  // rows sit in slot 1, where its own does not - lockstep alone would never compare them.
  const BLOCK_DIR = 148
  const OVERWRITE_DIR = 149
  const blocker = spell({
    slots: [
      slot(3, STR, 42, { max: 67 }),
      slot(5, OVERWRITE_DIR, STR, { limit: 1, max: 67 }),
      slot(7, BLOCK_DIR, STR, { limit: 1, max: 1067 })
    ]
  })
  const weaker = spell({ slots: [slot(0, STR, 50)] })
  assert.equal(checkStackConflict(blocker, weaker, L), 'blocked')
  assert.equal(checkStackConflict(weaker, blocker, L), 'overwrites')
  // …something the directive does not name is untouched by it…
  const unrelated = spell({ slots: [slot(0, 6 /* AGI */, 50)] })
  assert.equal(checkStackConflict(blocker, unrelated, L), 'stacks')
  // …and NEITHER IS THE SAME EFFECT IN ANOTHER SLOT (owner, 2026-10-20: *"RAGE is missing from this
  // list?"*). Rage keeps its STR in slot 6, and the log shows the game running it with Harnessing
  // in both orders. The 2026-09-10 rule searched every slot and refused it.
  const rageShaped = spell({ slots: [slot(2, AC, 35), slot(5, STR, 2, { calc: 102, max: 51 })] })
  assert.equal(checkStackConflict(blocker, rageShaped, L), 'stacks')
  assert.equal(checkStackConflict(rageShaped, blocker, L), 'stacks')
})

test('a gap becomes a blank rather than shifting the effects after it', () => {
  const view = stackView({ slots: [slot(0, HP, 5), slot(3, STR, 10)] })
  assert.equal(view.effects.length, EFFECT_COUNT)
  assert.equal(view.effects[0][0], HP)
  assert.equal(view.effects[3][0], STR)
  // 1 and 2 are blanks, not the STR shifted down.
  assert.equal(view.effects[1][0], 254)
  assert.equal(view.effects[2][0], 254)
})

test('a slot number outside the array is dropped, never clamped', () => {
  // A clamp would silently overwrite a real effect with an out-of-range one. `EFFECT_COUNT` is 68
  // rather than EQEmu's 12 because the owner's client file uses slots up to 67 - `spellStack.ts`
  // carries that measurement - so the case below is 99, which is out of range under either.
  const view = stackView({ slots: [slot(0, HP, 5), slot(99, STR, 10), slot(-1, AC, 3)] })
  assert.equal(view.effects[0][0], HP)
  assert.equal(view.effects.filter((e) => e[0] === STR).length, 0)
  assert.equal(view.effects.filter((e) => e[0] === AC).length, 0)
})

// =================================================================================================
// THE SAME SPELL, AND THE BLOCK DIRECTIVE
// =================================================================================================

test('the same spell recast is an overwrite, unless the worn copy was cast higher', () => {
  const a = stackView({ id: 42, slots: [slot(0, STR, 20)], durationFormula: 3, goodEffect: true })
  const b = stackView({ id: 42, slots: [slot(0, STR, 20)], durationFormula: 3, goodEffect: true })
  assert.equal(checkStackConflict(a, b, { worn: 50, cast: 50 }), 'overwrites')
  assert.equal(checkStackConflict(a, b, { worn: 60, cast: 50 }), 'blocked')
  assert.equal(checkStackConflict(a, b, { worn: 40, cast: 50 }), 'overwrites')
})

test('a BLOCK directive refuses a weaker spell in the slot it names', () => {
  // EQL writes the target slot 1-BASED in `limit`, so `limit: 1` means slot 0. `max` is the
  // magnitude the incoming spell must reach.
  const worn = spell({
    slots: [slot(0, STR, 10), slot(1, BLOCK_DIRECTIVE, STR, { limit: 1, max: 30 })]
  })
  const weak = spell({ slots: [slot(0, STR, 20)] })
  assert.equal(checkStackConflict(worn, weak, L), 'blocked')
  // A spell that MEETS the stated magnitude is not blocked by the directive.
  const strong = spell({ slots: [slot(0, STR, 40)] })
  assert.equal(checkStackConflict(worn, strong, L), 'overwrites')
})

test('a DETRIMENTAL spell bypasses a block directive (Live 2018 onward)', () => {
  const worn = spell({
    slots: [slot(0, STR, 10), slot(1, BLOCK_DIRECTIVE, STR, { limit: 1, max: 30 })]
  })
  const weakDebuff = spell({ slots: [slot(0, STR, 20)], goodEffect: false })
  assert.notEqual(checkStackConflict(worn, weakDebuff, L), 'blocked')
})

// =================================================================================================
// THE MAGNITUDE FORMULAS
// =================================================================================================

test('a level formula scales the base, and the cap carries the base`s sign', () => {
  // 102 adds the level; 101 adds half of it; 103 adds twice.
  assert.equal(calcSpellValue(10, 102, 0, 30), 40)
  assert.equal(calcSpellValue(10, 101, 0, 30), 25)
  assert.equal(calcSpellValue(10, 103, 0, 30), 70)
  // THE SIGN IS RE-APPLIED AFTER SCALING, so a debuff gets STRONGER with level rather than weaker.
  // A naive `base + step` would read +20 here instead of -40, which is the bug this pins.
  assert.equal(calcSpellValue(-10, 102, 0, 30), -40)
  // The cap is absolute, so it caps a DECREASE at the negative of itself.
  assert.equal(calcSpellValue(10, 102, 25, 30), 25)
  assert.equal(calcSpellValue(-10, 102, 25, 30), -25)
  // A formula this does not model reads as its own base, which is the level-1 value - it errs
  // toward calling two spells equal rather than inventing a winner.
  assert.equal(calcSpellValue(10, 100, 0, 50), 10)
})

test('a level-scaled spell beats its own lower-level self on magnitude', () => {
  const a = spell({ slots: [slot(0, STR, 10, { calc: 102 })] })
  const b = spell({ slots: [slot(0, STR, 10, { calc: 102 })] })
  // Same base, different caster level -> the higher-level cast wins the slot.
  assert.equal(checkStackConflict(a, b, { worn: 20, cast: 50 }), 'overwrites')
  assert.equal(checkStackConflict(a, b, { worn: 50, cast: 20 }), 'blocked')
})

// =================================================================================================
// THE VIEW'S OWN DEFAULTS
// =================================================================================================

test('a row with no slots is a view with twelve blanks, and contests nothing', () => {
  const empty = stackView({})
  assert.equal(empty.effects.length, EFFECT_COUNT)
  const real = spell({ slots: [slot(0, STR, 20)] })
  assert.equal(checkStackConflict(empty, real, L), 'stacks')
  assert.equal(checkStackConflict(real, empty, L), 'stacks')
})

test('unstackableDot is always false, and the header says why', () => {
  // Deviation 1: this app has not identified the client column and will not guess at one. Pinned so
  // that identifying it later has to come through here.
  assert.equal(stackView({ slots: [slot(0, HP, -20)] }).unstackableDot, false)
})

// =================================================================================================
// THE CONFLICT GRAPH
// =================================================================================================

test('the graph is UNDIRECTED - either direction refusing means they cannot both stand', () => {
  // `checkStackConflict` is asymmetric (it answers "what happens when I cast B onto A"), but the
  // planner's question is "can these two both be up", which is not.
  const hot = spell({ slots: [slot(0, HP, 20)], goodEffect: true })
  const dot = spell({ slots: [slot(0, HP, -20)], goodEffect: false })
  assert.equal(checkStackConflict(hot, dot, L), 'stacks')
  assert.equal(checkStackConflict(dot, hot, L), 'blocked')
  // One direction stacks and the other refuses, so the pair conflicts.
  assert.equal(spellsConflict(hot, dot, L), true)
  assert.equal(spellsConflict(dot, hot, L), true)
})

test('spells that share no slot form singleton components', () => {
  const a = spell({ slots: [slot(0, STR, 20)] })
  const b = spell({ slots: [slot(1, AC, 20)] })
  const c = spell({ slots: [slot(2, MOVEMENT, 20)] })
  const parts = conflictComponents([a, b, c], L)
  assert.equal(parts.length, 3)
  for (const p of parts) {
    assert.equal(p.members.length, 1)
    // A singleton is trivially a clique, which is what makes "pick the best member" exact for it.
    assert.equal(p.clique, true)
  }
})

test('a haste family is ONE clique, which is what makes the optimizer exact', () => {
  const quickness = spell({ slots: [slot(0, HASTE, 130)] })
  const alacrity = spell({ slots: [slot(0, HASTE, 140)] })
  const celerity = spell({ slots: [slot(0, HASTE, 147)] })
  const unrelated = spell({ slots: [slot(3, AC, 20)] })
  const parts = conflictComponents([quickness, alacrity, celerity, unrelated], L)
  assert.equal(parts.length, 2)
  const family = parts.find((p) => p.members.length === 3)
  assert.ok(family !== undefined)
  // Every haste contests every other haste, so the best subset is "the best single member".
  assert.equal(family.clique, true)
  assert.deepEqual(family.members, [0, 1, 2])
})

test('a CHAIN is a component and is NOT a clique - the case the optimizer must not assume away', () => {
  // A contests B and B contests C, but A and C sit in different slots and never meet. The three are
  // one connected component, and picking "the best member" would wrongly drop a valid pair.
  const a = spell({ slots: [slot(0, STR, 20)] })
  const b = spell({ slots: [slot(0, STR, 25), slot(1, AC, 25)] })
  const c = spell({ slots: [slot(1, AC, 30)] })
  assert.equal(spellsConflict(a, b, L), true)
  assert.equal(spellsConflict(b, c, L), true)
  assert.equal(spellsConflict(a, c, L), false)
  const parts = conflictComponents([a, b, c], L)
  assert.equal(parts.length, 1)
  assert.deepEqual(parts[0].members, [0, 1, 2])
  assert.equal(parts[0].clique, false)
})

test('an empty candidate set has no components', () => {
  assert.deepEqual(conflictComponents([], L), [])
})

// =================================================================================================
// A SPELL THAT HANDS ITS EFFECTS TO A SECOND ONE
// =================================================================================================

const ILLUSION = 58
const TRIGGER = 475

test('THE OWNER`S SET: a wolf form contests Bih`Li through the spell it casts with itself', () => {
  // The owner, 2026-09-26, reading a set that kept both: "movement speed stacking that doesn't
  // work". The form's own row is an illusion and a trigger; the run speed is on the second spell.
  const benefit = { id: 9001, name: 'benefit', goodEffect: true, slots: [slot(1, MOVEMENT, 35, { calc: 101, max: 60 })] }
  const form = { id: 9002, name: 'form', goodEffect: true, slots: [slot(0, ILLUSION, 796), slot(1, TRIGGER, 100, { limit: 9001 })] }
  const bihli = spell({ slots: [slot(1, MOVEMENT, 30, { calc: 101, max: 55 }), slot(5, STR, 15)], targetType: 0x29 })
  // The row alone contests nothing, which is what the set was built on…
  assert.equal(spellsConflict(stackView(form), bihli, L), false)
  // …and with what it lands, it does, from either side.
  const whole = stackView({ ...form, triggers: [benefit] })
  assert.equal(whole.triggered?.length, 1)
  assert.equal(spellsConflict(whole, bihli, L), true)
  assert.equal(spellsConflict(bihli, whole, L), true)
  assert.equal(conflictComponents([whole, bihli], L).length, 1)
  // A buff in another slot still stands beside it.
  assert.equal(spellsConflict(whole, spell({ slots: [slot(3, AC, 20)] }), L), false)
})

test('only a CERTAIN trigger is followed, and the id is read from the limit', () => {
  assert.deepEqual(triggeredSpellIds([slot(0, ILLUSION, 796, { limit: 2 }), slot(1, TRIGGER, 100, { limit: 9001 })]), [9001])
  assert.deepEqual(triggeredSpellIds([slot(0, 374, 100, { limit: 7 }), slot(1, 340, 100, { limit: 8 })]), [7, 8])
  // A roll between three spells lands one of them, and which is not knowable.
  assert.deepEqual(triggeredSpellIds([slot(0, 340, 60, { limit: 1 }), slot(1, 340, 30, { limit: 2 })]), [])
  assert.deepEqual(triggeredSpellIds(undefined), [])
})

test('two spells that hand over the SAME second spell share it rather than contest it', () => {
  const shared = { id: 9010, name: 'levitate', goodEffect: true, slots: [slot(4, 57, 1)] }
  const a = stackView({ id: 9011, name: 'a', goodEffect: true, slots: [slot(0, STR, 10), slot(1, TRIGGER, 100, { limit: 9010 })], triggers: [shared] })
  const b = stackView({ id: 9012, name: 'b', goodEffect: true, slots: [slot(2, AC, 10), slot(3, TRIGGER, 100, { limit: 9010 })], triggers: [shared] })
  assert.equal(spellsConflict(a, b, L), false)
})
