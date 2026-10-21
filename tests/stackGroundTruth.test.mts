// stackGroundTruth — THE GAME'S OWN VERDICTS, as a regression corpus.
//
// ============================================================================
// WHERE THIS CAME FROM
// ============================================================================
// The owner read the Loadout tab's recommended buff set and did not believe it (2026-09-10):
// *"are you sure all these spells are not going to overlap each-other?"* He was right not to, and
// then he did the thing that settles it - twice, from both directions.
//
// FIRST HE CAST HIS BAR AT HIMSELF. EverQuest names both halves when it refuses a buff:
//
//     Your Dexterity spell did not take hold. (Blocked by Harnessing of Spirit.)
//
// which is 40 distinct pairs the GAME says cannot both stand, with no inference and no model in
// between.
//
// THEN HE CAST THIRTEEN OF THEM ON HIS PET, all of which landed: *"i just finished recasting them
// all on my pet who already had them and none failed"*. That is 78 pairs the game demonstrably
// runs TOGETHER - and it is the half that matters most, because a rule that simply called
// everything a conflict would have scored 40 out of 40 on the first half alone.
//
// ============================================================================
// WHAT THE TWO HALVES TOGETHER OVERTURNED - TWICE IN ONE EVENING
// ============================================================================
// `checkStackConflict` is a port of EQEmu's `CheckStackConflict`, which walks the slots in LOCKSTEP
// and compares slot i against slot i.
//
//   ROUND ONE. Lockstep appeared to miss nearly every conflict anyone would ask about - Celerity
//   keeps its haste in slot 1 and Spirit Quickening keeps its in slot 4, so the two were never
//   compared - and the pass was replaced with one that matched BY EFFECT wherever it sat. That
//   caught all 40 blocks. It was still wrong.
//
//   ROUND TWO. The pet session proved it wrong within the hour: effect-matching calls
//   `Strength + Infusion of Spirit` and `Dexterity + Infusion of Spirit` conflicts, and the game
//   ran both pairs together. Lockstep was never the problem.
//
// THE DIRECTIVE PASS WAS. `directiveVerdict` looks up the 148/149 stacking commands - the things
// that make one buff refuse another from a different LINE - and it was searching for its target at
// a slot number no row in this client uses that way, so it never fired at all. Harnessing of Spirit
// carries `BLOCK{STR below 67}` and `BLOCK{DEX below 50}`, which is exactly why that one spell
// refuses nine different stat buffs in the log, and the engine could not see it.
//
// With lockstep restored and the directives actually working, the model is exact on both halves:
// 40 of 40 blocks reproduced, 81 of 81 coexisting pairs left alone. `spellStack.ts contestPass` and
// `directiveBites` carry the two halves of that argument.
//
// THE MORAL, WRITTEN DOWN BECAUSE IT COST TWO WRONG TURNS: a corpus of things that MUST conflict
// cannot validate a conflict rule on its own. Ask for the pairs that stack in the same breath.
//
// ============================================================================
// IT NEEDS THE CLIENT FILE, AND SKIPS WITHOUT IT
// ============================================================================
// `resistBaseline.test.mts`' arrangement exactly, including the env override. The pairs below are
// game text out of the owner's own log and are committed; `spells_us.txt` is Daybreak's file, is
// never committed, and is read from whatever install the machine running the tests has.

import test from 'node:test'
import assert from 'node:assert/strict'
import { existsSync, readFileSync } from 'node:fs'
import { parseSpellsUs } from '../src/main/resist/spellsUsParse'
import { spellCanonKey } from '../src/shared/spellKey'
import { stackView, spellsConflict, type StackSpellView } from '../src/shared/spellStack'
import type { SpellResistTable } from '../src/shared/resistTypes'

const SPELLS_US =
  process.env.EQ_SPELLS_US ??
  'C:/Users/Public/Daybreak Game Company/Installed Games/EverQuest Legends/spells_us.txt'
const HAVE_CLIENT = existsSync(SPELLS_US)
const skip = !HAVE_CLIENT && 'no client spells_us.txt'

let table: SpellResistTable | null = null
function view(name: string): StackSpellView | null {
  table ??= parseSpellsUs(readFileSync(SPELLS_US, 'latin1'))
  const row = table[spellCanonKey(name)]
  if (!row?.slots) return null
  return stackView({
    id: row.id,
    name,
    goodEffect: row.goodEffect ?? false,
    targetType: row.targetType,
    durationFormula: row.durationFormula ?? 0,
    durationValue: row.durationValue ?? 0,
    song: row.song ?? false,
    slots: row.slots
  })
}

/** The caster level both sides are read at. He was 50; every one of these is a level-50 reading. */
const LEVELS = { worn: 50, cast: 50 }

/**
 * `[worn, cast]` - the game refused `cast` because `worn` was already up.
 *
 * Every one is a `did not take hold. (Blocked by ...)` line from the owner's log, deduped and
 * sorted. Nothing here is inferred.
 */
const BLOCKED: readonly (readonly [string, string])[] = [
  ['Bramblecoat', 'Barbcoat'],
  ['Call of Earth', 'Rage'],
  ['Cascading Darkness', 'Chloroplast'],
  ['Center', 'Courage'],
  ['Form of the Bear', 'Extended Regeneration'],
  ['Form of the Bear', 'Illusion: Skeleton'],
  ['Frenzy', 'Fleeting Fury'],
  ['Guardian', 'Protect'],
  ['Guardian', 'Shifting Shield'],
  ['Guardian', 'Turtle Skin'],
  ['Harnessing of Spirit', 'Deftness'],
  ['Harnessing of Spirit', 'Dexterity'],
  ['Harnessing of Spirit', 'Furious Strength'],
  ['Harnessing of Spirit', 'Infusion of Spirit'],
  ['Harnessing of Spirit', 'Raging Strength'],
  ['Harnessing of Spirit', 'Strength'],
  ['Harnessing of Spirit', 'Talisman of Altuna'],
  ['Harnessing of Spirit', 'Talisman of Tnarg'],
  ['Harnessing of Spirit', 'Talisman of the Beast'],
  ['Harnessing of Spirit', 'Tumultuous Strength'],
  ['Haste', 'Alacrity'],
  ['Haste', 'Quickness'],
  ['Ignite Blood', 'Chloroplast'],
  ['Illusion Benefit Dena', 'Spirit of Bih`Li'],
  ['Illusion Benefit Dena', 'Spirit of the Traveler'],
  ['Illusion: Dark Elf', 'Form of the Bear'],
  ['Rage', 'Fury'],
  ['Resist Fire', 'Endure Fire'],
  ['Resistance to Magic', 'Resist Magic'],
  ['Searing Arrow', 'Form of the Bear'],
  ['Share Wolf Form', 'Form of the Bear'],
  ['Share Wolf Form', 'Spirit of Bih`Li'],
  ['Sicken', 'Form of the Bear'],
  ['Skin like Rock', 'Protection of Wood'],
  ['Skin like Rock', 'Skin like Wood'],
  ['Spirit of Bih`Li', 'Spirit of the Shrew'],
  ['Spirit of Bih`Li', 'Spirit of the Traveler'],
  ['Spirit of Wolf', 'Spirit of the Traveler'],
  ['Stamina', 'Health'],
  ['Talisman of Jasinth', 'Resist Disease']
]

/**
 * SPELLS THE GAME RAN TOGETHER, as every pair of them.
 *
 * The owner cast these thirteen in sequence on his pet at 19:49:27-19:50:40 with not one "did not
 * take hold" between them (*"i just finished recasting them all on my pet who already had them and
 * none failed"*), so all 78 pairs must be compatible. It is the half of the evidence that was
 * missing when this file was written, and it immediately overturned the rule the file had just
 * shipped: `Strength + Infusion of Spirit` and `Dexterity + Infusion of Spirit` are both in here.
 *
 * A NEGATIVE IS ONLY ADMITTED WHEN THE LOG PROVES IT. `Scale Skin` looked like one and is not - it
 * was INTERRUPTED, not refused, which the log says in as many words and which is exactly the trap a
 * careless reading of "no block message" falls into.
 */
const COEXIST: readonly string[] = [
  'Infusion of Spirit',
  'Talisman of Altuna',
  'Resist Cold',
  'Resist Fire',
  'Talisman of Jasinth',
  'Resist Poison',
  'Resist Magic',
  'Spirit of Bih`Li',
  'Health',
  'Dexterity',
  'Agility',
  'Strength',
  'Guardian'
]

/** Pairs measured earlier in the same log, each with both halves proven on their own line. */
const ALSO_STACKED: readonly (readonly [string, string])[] = [
  // Harnessing of Spirit was refusing nine stat buffs on either side of these two landing.
  ['Harnessing of Spirit', 'Glamour'],
  ['Harnessing of Spirit', 'Spirit of Bih`Li'],
  // Inner Fire landed at 18:58:17 with Guardian up, though both carry AC. This was a KNOWN
  // over-report of the effect-matching rule for one evening; the directive model gets it right.
  ['Guardian', 'Inner Fire'],
  // 19:35:09 "You are infused with power", 19:35:19 "You feel strong" - ten seconds apart.
  ['Strength', 'Infusion of Spirit'],
  // Owner, 2026-10-20: *"RAGE is missing from this list?"* The Loadout put Rage under "Left out",
  // beaten by Harnessing of Spirit, because the directive pass searched every slot for STR. Quick
  // Buff on 2026-08-22 ran them together both ways round: Rage landed at 18:00:36 with Harnessing
  // worn since 17:20:56, and Harnessing landed at 18:30:43 over a Rage that stayed up until 21:59:40.
  ['Harnessing of Spirit', 'Rage'],
  ['Rage', 'Harnessing of Spirit']
]

/** Every pair that must NOT be reported as a conflict. */
function stackedPairs(): [string, string][] {
  const out: [string, string][] = []
  for (let i = 0; i < COEXIST.length; i++) {
    for (let j = i + 1; j < COEXIST.length; j++) out.push([COEXIST[i], COEXIST[j]])
  }
  for (const pair of ALSO_STACKED) out.push([pair[0], pair[1]])
  return out
}

test('every block the GAME issued is a conflict the engine sees', { skip }, () => {
  const missed: string[] = []
  const unknown: string[] = []
  for (const [worn, cast] of BLOCKED) {
    const a = view(worn)
    const b = view(cast)
    if (a === null || b === null) {
      unknown.push(`${cast} <- ${worn}`)
      continue
    }
    if (!spellsConflict(a, b, LEVELS)) missed.push(`${cast} <- ${worn}`)
  }
  assert.deepEqual(unknown, [], 'every one of these names should resolve against the client file')
  assert.deepEqual(missed, [], 'the game refused these; the engine must not call them compatible')
})

test('…and every pair it ran together is left alone', { skip }, () => {
  const wrong: string[] = []
  for (const [worn, cast] of stackedPairs()) {
    const a = view(worn)
    const b = view(cast)
    if (a === null || b === null) continue
    if (spellsConflict(a, b, LEVELS)) wrong.push(`${cast} + ${worn}`)
  }
  assert.deepEqual(wrong, [], 'the game ran these together; the engine must not call them a conflict')
})
