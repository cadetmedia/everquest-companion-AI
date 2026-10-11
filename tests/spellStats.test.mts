// WHAT A SPELL GRANTS (docs/plans/spell-upgrades-and-loadout.md §3.2) — the two line shapes, the
// alias fold, the ramp clamp, and a RE-MEASUREMENT of the committed corpus.
//
// THE CORPUS MEASUREMENT IS THE POINT OF THIS SUITE. `spellStats.ts`'s header states, as numbers,
// how much of the catalog it can read (727 of 2,066 beneficial effect lines, 58 stat nouns), and a
// header that states a number nobody re-checks is a comment that will be wrong within a month. So
// the last section below re-runs the measurement against the real committed bytes on every `npm
// test` and fails when the shape of the scrape moves under it — which is exactly what the
// `plannerEffectIndex` suite does for the item corpus, for the same reason.
//
// The parse tests use HAND-AUTHORED lines, so a corpus change can break the measurement without
// also breaking the grammar and leaving nobody able to tell which moved.

import assert from 'node:assert/strict'
import { test } from 'node:test'
import {
  SPELL_STAT_LABEL,
  grantsShareASlot,
  parseStatLine,
  rampAt,
  spellStatGrants,
  spellStatLabel,
  spellStatText,
  type SpellStatKey
} from '../src/shared/spellStats'
import spellsJson from '../src/main/data/spells.json' with { type: 'json' }

// =================================================================================================
// THE TWO SHAPES
// =================================================================================================

test('the flat shape, with both signs', () => {
  const g = spellStatGrants(['Increase STR by 25'], 50)
  assert.deepEqual(g, [{ key: 'STR', amount: 25, percent: false, line: 'Increase STR by 25' }])
  // `Decrease` is not always a penalty - `Decrease Stamina Loss by 20` is a benefit spelled as one -
  // so the parser keeps the sign and lets the scorer decide what it is worth.
  const d = spellStatGrants(['Decrease Stamina Loss by 20'], 50)
  assert.equal(d[0].key, 'STAMINA_LOSS')
  assert.equal(d[0].amount, -20)
})

test('the ramp shape carries its band as well as its figure', () => {
  const [g] = spellStatGrants(['Increase AC by 7 (L19) to 14 (L65)'], 40)
  assert.equal(g.key, 'AC')
  assert.deepEqual(g.ramp, { loAmount: 7, loLevel: 19, hiAmount: 14, hiLevel: 65 })
  // 7 + trunc(7 x 21 / 46) = 7 + 3
  assert.equal(g.amount, 10)
})

test('a ramp is CLAMPED at both ends and never extrapolated', () => {
  const ramp = { loAmount: 30, loLevel: 1, hiAmount: 55, hiLevel: 50 }
  // The wiki's ramp is a statement about a BAND. Below it, the low figure; above it, the high one.
  assert.equal(rampAt(ramp, -5), 30)
  assert.equal(rampAt(ramp, 1), 30)
  assert.equal(rampAt(ramp, 50), 55)
  assert.equal(rampAt(ramp, 300), 55)
  // …and the stated endpoints are exact at the stated levels, which is where a reader checks.
  const [g] = spellStatGrants(['Increase Movement Speed by 30% (L1) to 55% (L50)'], 50)
  assert.equal(g.amount, 55)
  assert.equal(g.percent, true)
})

test('a percent is not a point, and the type says so', () => {
  // Read at L39, the ramp's own low end, so the two figures are the same NUMBER and the only thing
  // separating them is the flag. They must never be summed.
  const [haste] = spellStatGrants(['Increase Attack Speed by 47% (L39) to 50% (L44)'], 39)
  const [str] = spellStatGrants(['Increase STR by 47'], 39)
  assert.equal(haste.amount, str.amount)
  assert.equal(haste.percent, true)
  assert.equal(str.percent, false)
})

test('overhaste is a different slot from haste, not a spelling of it', () => {
  // SPA 98 beside SPA 11. They STACK in the game, so folding them onto one key would make the
  // shared-slot flag report a conflict that does not exist.
  const haste = spellStatGrants(['Increase Attack Speed by 47%'], 50)
  const over = spellStatGrants(['Increase Haste v2 by 20%'], 50)
  assert.equal(over[0].key, 'HASTE_V2')
  assert.deepEqual(grantsShareASlot(haste, over), [])
})

test('the cure counters are read, because how much a cure strips is the whole question', () => {
  const g = spellStatGrants(['Decrease Poison Counter by 36'], 50)
  assert.equal(g[0].key, 'POISON_COUNTER')
  assert.equal(g[0].amount, -36)
})

// =================================================================================================
// WHAT IT REFUSES, AND WHY EACH REFUSAL MATTERS
// =================================================================================================

test('a `per tick` line belongs to spellMetrics and is refused explicitly', () => {
  // It very nearly matches the flat shape. Reading it here would double-count against the module
  // that already owns regen and states it in its own units.
  assert.equal(parseStatLine('Increase Hitpoints by 8 per tick'), null)
  assert.equal(parseStatLine('Increase Mana by 2 per tick'), null)
  assert.equal(spellStatGrants(['Increase Hit points by 1 per tick', 'Increase Wisdom by 5'], 50).length, 1)
})

test('a focus qualifier is not a stat grant, and the anchor is what keeps them apart', () => {
  // `wornFocus.ts`'s data. Unanchored, a magnitude regex reads 1 and 20 out of the middle of this
  // and calls it a spell-damage buff.
  assert.equal(parseStatLine('Increase Spell Damage by 1% to 20%'), null)
  assert.equal(parseStatLine('Limit Max Level: 44 (lose 5% per level after)'), null)
  assert.equal(parseStatLine('Limit Effect: Current HP'), null)
  assert.equal(parseStatLine('Limit Type: Exclude Combat Skills'), null)
})

test('a noun the alias table does not carry yields null - silence is not zero', () => {
  // World-model law 1. A grant we cannot read is a grant we cannot state, which is a different claim
  // from a grant of nothing - and law 12 is why this is a table rather than a closest-match.
  assert.equal(parseStatLine('Increase Blorptitude by 7'), null)
  assert.equal(parseStatLine('Increase Faction by 100'), null)
  // The near-misses a matcher would fold together and this table will not.
  assert.equal(parseStatLine('Increase Max HP by 10')?.key, 'HP')
  assert.equal(parseStatLine('Increase Max Mana by 10')?.key, 'MP')
  assert.equal(parseStatLine('Increase ATK by 10')?.key, 'ATTACK')
  assert.equal(parseStatLine('Increase AC by 10')?.key, 'AC')
})

test('other effect shapes are simply not this reader’s', () => {
  for (const line of [
    'Summon Item: Bandages',
    'Illusion: 43',
    'Ultravision(1)',
    'Cancel Magic(9)',
    'Add Melee Proc: Frost Strike',
    'Summon Pet: Level 31 Animation',
    'Grants Ultravision'
  ]) {
    assert.equal(parseStatLine(line), null, line)
  }
})

test('a backwards ramp is refused rather than reversed for the page', () => {
  assert.equal(parseStatLine('Increase AC by 7 (L65) to 14 (L19)'), null)
})

// =================================================================================================
// THE ALIAS FOLD
// =================================================================================================

test('every alias pair folds to one key', () => {
  const pairs: [string, string, SpellStatKey][] = [
    ['Increase STR by 5', 'Increase Strength by 5', 'STR'],
    ['Increase AC by 5', 'Increase Armor Class by 5', 'AC'],
    ['Increase WIS by 5', 'Increase Wisdom by 5', 'WIS'],
    ['Increase Hitpoints by 5', 'Increase Hit points by 5', 'HP'],
    ['Increase Max Hitpoints by 5', 'Increase Max HP by 5', 'HP'],
    ['Increase Attack Speed by 5%', 'Increase Melee Haste by 5%', 'HASTE'],
    ['Increase ATK by 5', 'Increase ATK Power by 5', 'ATTACK']
  ]
  for (const [a, b, key] of pairs) {
    assert.equal(parseStatLine(a)?.key, key, a)
    assert.equal(parseStatLine(b)?.key, key, b)
  }
})

test('the vocabulary is fully labelled, and the labels are user-facing copy', () => {
  for (const [k, label] of Object.entries(SPELL_STAT_LABEL)) {
    assert.ok(label !== undefined && label.length > 0, k)
    // No em dashes (AGENTS.md, UI conventions).
    assert.ok(!/[–—]/.test(label), k)
  }
  // The table is PARTIAL - the weapon-only gear keys have no spell spelling - and the fallback is
  // the key itself rather than an invented word.
  assert.equal(spellStatLabel('DMG'), 'DMG')
  assert.equal(spellStatText({ key: 'STR', amount: 25, percent: false, line: '' }), 'STR +25')
  assert.equal(
    spellStatText({ key: 'HASTE', amount: 47, percent: true, line: '' }),
    'Haste +47%'
  )
  // A negative reads with a normal minus and never a dash glyph.
  assert.equal(
    spellStatText({ key: 'STAMINA_LOSS', amount: -20, percent: false, line: '' }),
    'Stamina loss -20'
  )
})

// =================================================================================================
// ORDER AND DUPLICATES
// =================================================================================================

test('the wiki’s effect order is preserved and duplicate keys are not merged', () => {
  const g = spellStatGrants(
    ['Increase Max Hitpoints by 238 (L44) to 250 (L50)', 'Increase HP when cast by 238 (L44) to 250 (L50)'],
    50
  )
  // Talisman of Altuna. Two DIFFERENT keys that a careless fold would collapse into one HP number.
  assert.deepEqual(g.map((x) => x.key), ['HP', 'HP_ON_CAST'])
  // A spell that states one stat twice said so; merging would be this module inventing arithmetic.
  const twice = spellStatGrants(['Increase AC by 10', 'Increase AC by 5'], 50)
  assert.equal(twice.length, 2)
})

test('an absent effect list is an empty answer, not a crash', () => {
  assert.deepEqual(spellStatGrants(undefined, 50), [])
  assert.deepEqual(spellStatGrants([], 50), [])
})

// =================================================================================================
// THE SHARED-SLOT FLAG — the cheap half of the stacking question
// =================================================================================================

test('the owner’s own example: Spirit of Wolf and Spirit of Bih`Li share the movement slot', () => {
  const sow = spellStatGrants(['Increase Movement Speed by 30% (L1) to 55% (L50)'], 50)
  const bihli = spellStatGrants(['Increase Movement Speed by 55%', 'Increase Attack by 15'], 50)
  assert.deepEqual(grantsShareASlot(sow, bihli), ['MOVEMENT_SPEED'])
  // And the half that is actually worth saying out loud: Bih`Li carries an ATK grant SoW does not,
  // so overwriting it costs you that, silently, in the game.
  const onlyBihli = bihli.filter((g) => !sow.some((s) => s.key === g.key))
  assert.deepEqual(onlyBihli.map((g) => g.key), ['ATTACK'])
})

test('the flag reports each shared key once and never invents one', () => {
  const a = spellStatGrants(['Increase AC by 10', 'Increase AC by 5', 'Increase STR by 5'], 50)
  const b = spellStatGrants(['Increase AC by 20'], 50)
  assert.deepEqual(grantsShareASlot(a, b), ['AC'])
  assert.deepEqual(grantsShareASlot(b, a), ['AC'])
  assert.deepEqual(
    grantsShareASlot(spellStatGrants(['Increase STR by 5'], 50), spellStatGrants(['Increase AC by 5'], 50)),
    []
  )
  assert.deepEqual(grantsShareASlot([], b), [])
})

// =================================================================================================
// THE CORPUS RE-MEASUREMENT — the header's numbers, re-derived from the committed bytes
// =================================================================================================

interface CatalogSpell {
  name: string
  spellType?: string
  effects?: string[]
}
const SPELLS = (spellsJson as { spells: CatalogSpell[] }).spells
const BENEFICIAL = SPELLS.filter((s) => s.spellType === 'Beneficial')
const BENEFICIAL_LINES = BENEFICIAL.flatMap((s) => s.effects ?? [])

test('the corpus is the one the header measured', () => {
  // Tripwire on the scrape itself. If these move, the numbers below are about a different corpus and
  // the header has to be re-read rather than the assertions relaxed.
  // Re-read 2026-10-10 after the whole-wiki delta run (2,006 -> 2,014 spells, 1,078 -> 1,084
  // beneficial, 2,066 -> 2,076 lines): the header's own numbers did not move - 702 of 727
  // shape-matches still read, and the unread-noun list below is unchanged. The ten new lines all
  // fall outside the stat shape.
  assert.equal(SPELLS.length, 2013)
  assert.equal(BENEFICIAL.length, 1083)
  assert.equal(BENEFICIAL_LINES.length, 2075)
})

test('coverage over the real bytes matches the header, within a band', () => {
  const parsed = BENEFICIAL_LINES.filter((l) => parseStatLine(l) !== null)
  // The header states TWO numbers and this pins the one that matters: 727 lines match the shape, and
  // 702 of them carry a noun the alias table knows. A band rather than an equality so a single
  // corrected wiki line does not fail the build, but tight enough that a grammar regression or a
  // dropped alias row cannot hide in it.
  assert.ok(
    parsed.length >= 680 && parsed.length <= 730,
    `read ${String(parsed.length)} of ${String(BENEFICIAL_LINES.length)} beneficial effect lines; header says 702 of 727 shape-matches`
  )
})

test('the 25-line gap is the enumerated one, and nothing has quietly joined it', () => {
  // The header names every noun it declines to read and says why. This re-derives the list, so a
  // scrape that introduces a NEW unread noun fails here instead of silently widening the gap.
  const SHAPE = /^(Increase|Decrease) (.+?) by (-?\d+)(%?)(?: \(L(\d+)\) to (-?\d+)(%?) \(L(\d+)\))?$/
  const unread = new Map<string, number>()
  for (const line of BENEFICIAL_LINES) {
    const m = SHAPE.exec(line.trim())
    if (m === null || parseStatLine(line) !== null) continue
    unread.set(m[2], (unread.get(m[2]) ?? 0) + 1)
  }
  assert.deepEqual(
    [...unread.keys()].sort(),
    [
      'Current HP',
      'Current Hit Points',
      'Current Mana',
      'Faction',
      'HP regen',
      'MP regen',
      'Magnification',
      'Pet Size',
      'Player Size'
    ]
  )
})

test('the real corpus exercises the stats the header leads with', () => {
  const counts = new Map<SpellStatKey, number>()
  for (const line of BENEFICIAL_LINES) {
    const p = parseStatLine(line)
    if (p !== null) counts.set(p.key, (counts.get(p.key) ?? 0) + 1)
  }
  // The real per-key census under the FOLDED vocabulary, measured 2026-09-10. `AC` pools the wiki's
  // `AC` (84) and `Armor Class` (19); `HP` pools its four hitpoint spellings (40 + 34 + 10 + 1),
  // which is why both outrun any single noun count in the header. A broken alias row shows up here
  // as a shortfall rather than as a quietly smaller total nobody notices.
  for (const [key, atLeast] of [
    ['AC', 100],
    ['HP', 82],
    ['STR', 58],
    ['HASTE', 50],
    ['DAMAGE_SHIELD', 44],
    ['HP_ON_CAST', 36],
    ['ATTACK', 25],
    ['SV_FIRE', 23],
    ['MOVEMENT_SPEED', 18],
    // The rarest key that still matters: overhaste has to survive, because folding it into HASTE is
    // the exact regression the shared-slot flag cannot detect on its own.
    ['HASTE_V2', 3]
  ] as [SpellStatKey, number][]) {
    assert.ok((counts.get(key) ?? 0) >= atLeast, `${key}: read ${String(counts.get(key) ?? 0)}`)
  }
  // Every key this reader emits over the whole corpus must have a label.
  for (const key of counts.keys()) assert.ok(SPELL_STAT_LABEL[key] !== undefined, key)
})

test('the corpus contains no line this reader reads as a NaN or an unlabelled key', () => {
  for (const s of SPELLS) {
    for (const g of spellStatGrants(s.effects, 50)) {
      assert.ok(Number.isFinite(g.amount), `${s.name}: ${g.line}`)
      assert.ok(SPELL_STAT_LABEL[g.key] !== undefined, `${s.name}: ${g.line}`)
    }
  }
})

test('Form of the Bear reads exactly the two things the owner said it does', () => {
  const bear = SPELLS.find((s) => s.name === 'Form of the Bear')
  assert.ok(bear !== undefined)
  // `Increase Hit points by 1 per tick` goes to spellMetrics; the WIS is this reader's.
  assert.deepEqual(spellStatGrants(bear.effects, 50), [
    { key: 'WIS', amount: 5, percent: false, line: 'Increase Wisdom by 5' }
  ])
})
