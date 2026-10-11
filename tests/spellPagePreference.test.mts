// TWO WIKI PAGES UNDER ONE NAME, AND THE ONE EQ LEGENDS RUNS WINS (owner report 2026-09-12:
// the spellbook "showing 2 of the same spell").
//
// `src/main/data/spellPagePreference.ts` carries the rule and its evidence; this suite pins the
// three names the committed corpus contests, that the survivor is the page with the `(Autogranted)`
// note, and that the survivor's numbers are the ones the owner's client states (spells_us.txt,
// 2026-09-12) — read here as literals so the suite needs no install.
import test from 'node:test'
import assert from 'node:assert/strict'
import { applyLegendsPagePreference, spellPagePreferenceReport } from '../src/main/data/spellPagePreference.ts'
import { loadSpellDb } from '../src/main/data/spellDb.ts'
import { buildLevelUnlocks, resetLevelUnlocksCache } from '../src/main/data/levelUnlocks.ts'
import type { SpellDbFile, SpellEntry } from '../src/shared/types.ts'
import spellsJson from '../src/main/data/spells.json' with { type: 'json' }

const RAW = (spellsJson as SpellDbFile).spells
const NOTE = /\(Autogranted\)/
/** The rule's own notion of "the same name": apostrophes and case fold (`O'Keils` = `O\`Keil's`). */
const same = (a: string, b: string): boolean =>
  a.replace(/[`'’]/g, '').toLowerCase() === b.replace(/[`'’]/g, '').toLowerCase()

/** Same name, one page noted, SAME three sentences: one spell on two pages. Since the 2026-10-10
 *  delta run the O'Keils pair is read under two titles, `O'Keils Radiation` (classic, dropped) and
 *  `O\`Keil's Radiation` (Legends, kept); the rule folds them. */
const CONTESTED = ['Anthem De Arms', 'Burst of Flame', "O'Keils Radiation"]
/**
 * DIFFERENT sentences: two spells that used to share a title. Until the 2026-10-10 delta run the
 * scrape named a spell by its |spellname, and each of these pairs was one name, one page noted -
 * the case the sentence guard exists for. The run names a spell by its PAGE TITLE, and each second
 * page now carries its own: `Healing Water` (the druid's, which the guard kept alive), `Full Heal`
 * and `Blast of Cold`. Both rows must still survive the load, under either shape.
 */
const TWO_SPELLS: readonly (readonly [string, string])[] = [
  ['Greater Healing', 'Healing Water'],
  ['Healing', 'Full Heal'],
  ['Shock of Frost', 'Blast of Cold']
]

test('the committed corpus contests exactly these three names, each a classic page beside a Legends page', () => {
  const { report } = applyLegendsPagePreference(RAW)
  assert.deepEqual([...report.names].sort(), CONTESTED)
  assert.equal(report.dropped, 3, 'one classic row per name')
  for (const [n, twin] of TWO_SPELLS) {
    assert.equal(RAW.filter((s) => s.name === n).length, 1, `${n}: its twin page now carries its own title`)
    assert.equal(RAW.filter((s) => s.name === twin).length, 1, `${twin}: the twin, under its page title`)
  }
  for (const n of CONTESTED) {
    const rows = RAW.filter((s) => same(s.name, n))
    assert.equal(rows.length, 2, `${n}: two pages in the scrape`)
    assert.equal(rows.filter((s) => NOTE.test(s.classes ?? '')).length, 1, `${n}: one of them autogranted`)
  }
})

test('the effective DB holds one row per contested name, and it is the autogranted page', () => {
  const effective = loadSpellDb().spells
  for (const n of CONTESTED) {
    const rows = effective.filter((s) => same(s.name, n))
    assert.equal(rows.length, 1, `${n}: one row after the load`)
    assert.ok(NOTE.test(rows[0].classes ?? ''), `${n}: the survivor carries the note`)
  }
  loadSpellDb()
  assert.deepEqual(spellPagePreferenceReport()?.names.slice().sort(), CONTESTED)
})

test('HEALING WATER STAYS: a same-name pair with different sentences is two spells, and both survive', () => {
  // test.11's regression (levelUnlocks.ts couldBeSameSpell), which the first cut of this pass
  // repeated one day later. The druid's Healing Water was the wiki's second `Greater Healing`; since
  // the 2026-10-10 delta run it is read under its page title, `Healing Water`.
  const effective = loadSpellDb().spells
  for (const [n, twin] of TWO_SPELLS) {
    assert.equal(effective.filter((s) => s.name === n).length, 1, `${n}: its own page stays`)
    assert.equal(effective.filter((s) => s.name === twin).length, 1, `${twin}: and so does the twin`)
  }
  const water = effective.find((s) => s.name === 'Healing Water' && s.msgCastOnYou === 'Healing water flows over you.')
  assert.ok(water, 'Healing water flows over you - the row a friend lost once already')
  assert.equal(water.mana, 150)
})

test('THE SPELLBOOK draws one row per contested name: the unlock builder runs the same pass', () => {
  // The owner's report was a spellbook screenshot, and the spellbook is drawn off buildLevelUnlocks,
  // which loads the scrape through its own copy of the pipeline rather than loadSpellDb. Same
  // passes, same order, same six survivors - or the two surfaces disagree about what exists.
  resetLevelUnlocksCache()
  try {
    const rows = buildLevelUnlocks(null).spells
    for (const n of CONTESTED) {
      assert.equal(rows.filter((s) => s.name === n).length, 1, `${n}: one unlock row`)
    }
  } finally {
    resetLevelUnlocksCache()
  }
})

test("the survivor's numbers are the client's, where the client has the row", () => {
  // spells_us.txt (owner's install, 2026-09-12): Burst of Flame id 93 mana 4 cast 1500; Greater
  // Healing id 15 mana 115 cast 3000; Healing id 12 mana 65 cast 2500. The dropped pages said
  // 7 mana, 150 mana / 750 cast, and "* None" at 0 mana respectively.
  const noted = (n: string): SpellEntry | undefined =>
    loadSpellDb().spells.find((s) => s.name === n && NOTE.test(s.classes ?? ''))
  const fig = (s: SpellEntry | undefined): [number | undefined, number | undefined] => [s?.mana, s?.castTimeMs]
  assert.deepEqual(fig(noted('Burst of Flame')), [4, 1500])
  assert.deepEqual(fig(noted('Greater Healing')), [115, 3000])
  assert.deepEqual(fig(noted('Healing')), [65, 2500])
})

test('a name whose rows all carry the note, or none of them, or whose sentences differ, is untouched', () => {
  const rows: SpellEntry[] = [
    { name: 'Twin', classes: '* Wizard - Level 1 (Autogranted)' } as SpellEntry,
    { name: 'Twin', classes: '* Wizard - Level 9 (Autogranted)' } as SpellEntry,
    { name: 'Era', classes: '* Wizard - Level 1' } as SpellEntry,
    { name: 'Era', classes: '* Wizard - Level 4' } as SpellEntry,
    { name: 'Lone', classes: '* Wizard - Level 2' } as SpellEntry,
    { name: 'Bare' } as SpellEntry,
    { name: 'Shared', classes: '* Druid - Level 1 (Autogranted)', msgCastOnYou: 'You feel better.' } as SpellEntry,
    { name: 'Shared', classes: '* Druid - Level 34', msgCastOnYou: 'Healing water flows over you.' } as SpellEntry
  ]
  const { spells, report } = applyLegendsPagePreference(rows)
  assert.equal(spells.length, 8)
  assert.deepEqual(report, { dropped: 0, names: [] })
  // …and the same pair with the SAME sentence folds to the noted page.
  const same = applyLegendsPagePreference([
    { name: 'One', classes: '* Druid - Level 1 (Autogranted)', msgCastOnYou: 'You glow.' } as SpellEntry,
    { name: 'One', classes: '* Druid - Level 4', msgCastOnYou: 'You glow.' } as SpellEntry
  ])
  assert.equal(same.spells.length, 1)
  assert.deepEqual(same.report, { dropped: 1, names: ['One'] })
})
