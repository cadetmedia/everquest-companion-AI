// WHAT THIS CHARACTER CANNOT USE, AND WHY (owner, 2026-10-25: "Give the user the choice, and mark
// the items they can't wear somehow so they know they can't wear it because of race or class or
// deity or whatever").
//
// Four halves: the rule with its reasons (`shared/planner/usability.ts`), the browser's choice
// between listing those rows marked and hiding them (`plannerData.filterDonors` / `hiddenByView`),
// the order that puts what you can use first (`plannerGroups.usableFirst`), and the corpus half -
// the donor rows now carry the deity line, so the browser can mark Scalp of the Ghoul Lord.

import { test } from 'node:test'
import assert from 'node:assert/strict'
import itemsJson from '../src/main/data/items.json'
import type { ItemDbFile } from '../src/main/itemsDb'
import { buildPlannerDonors } from '../src/main/planner/effectIndex'
import { deityName, unusableLabel, unusableReasons, type Wearer } from '../src/shared/planner/usability'
import { usable } from '../src/renderer/src/features/character/exaltationAudit'
import {
  DEFAULT_FILTERS,
  donorUnusable,
  filterDonors,
  hiddenByView,
  type DonorRow,
  type DonorView
} from '../src/renderer/src/features/planner/plannerData'
import { groupDonors, usableFirst } from '../src/renderer/src/features/planner/plannerGroups'
import type { ClassAbbr } from '../src/shared/classCombo'
import type { GearRow } from '../src/shared/planner/gear'

const ME: Wearer = { classes: ['PAL', 'ENC', 'MNK'], deity: 'KARANA', level: 30 }
const NOBODY: Wearer = { classes: [], deity: null, level: null }

test('each restriction names itself, and every one that applies is listed in a fixed order', () => {
  const item = { classes: ['WAR', 'ROG'] as ClassAbbr[], deities: ['CAZIC THULE', 'INNORUUK'], reqLevel: 45 }
  const reasons = unusableReasons(item, ME)
  assert.deepEqual(
    reasons.map((r) => r.kind),
    ['class', 'deity', 'level']
  )
  assert.equal(unusableLabel(reasons), "can't use: class, deity, level 45")
  assert.equal(reasons[0].why, 'Only WAR, ROG can use it - you are PAL, ENC, MNK.')
  assert.equal(reasons[1].why, 'Only followers of Cazic Thule, Innoruuk can use it - you follow Karana.')
  assert.equal(reasons[2].why, 'Its effect needs level 45 - you are level 30.')
})

test('a usable item, or one whose rule matches, carries no reason at all', () => {
  assert.deepEqual(unusableReasons({ classes: ['PAL', 'WAR'], deities: ['KARANA'], reqLevel: 30 }, ME), [])
  // The level is a floor: exactly the stated level is enough.
  assert.deepEqual(unusableReasons({ classes: [], reqLevel: 30 }, ME), [])
})

test('unknown is never "cannot": every unknown on either side checks nothing', () => {
  const strict = { classes: ['WAR'] as ClassAbbr[], deities: ['INNORUUK'], reqLevel: 60 }
  // The character side: no class chosen, no deity stated, no level stated.
  assert.deepEqual(unusableReasons(strict, NOBODY), [])
  assert.deepEqual(
    unusableReasons(strict, { ...ME, deity: null }).map((r) => r.kind),
    ['class', 'level']
  )
  assert.deepEqual(
    unusableReasons(strict, { ...ME, level: null }).map((r) => r.kind),
    ['class', 'deity']
  )
  // The item side: no class list, no deity line, no level.
  assert.deepEqual(unusableReasons({ classes: [] }, ME), [])
})

test('deity keys are spelled for a sentence', () => {
  assert.equal(deityName('CAZIC THULE'), 'Cazic Thule')
  assert.equal(deityName('TRIBUNAL'), 'Tribunal')
})

test('the board advice reads the same rule: usable() is the class and deity halves, empty or not', () => {
  const row = { classes: ['WAR'], deities: ['INNORUUK'] } as unknown as GearRow
  assert.equal(usable(row, { classes: ['WAR'], deity: 'INNORUUK' }), true)
  assert.equal(usable(row, { classes: ['PAL'], deity: 'INNORUUK' }), false)
  assert.equal(usable(row, { classes: ['WAR'], deity: 'KARANA' }), false)
  assert.equal(usable(row, { classes: ['WAR'], deity: null }), true)
  assert.equal(usable(row, { classes: [], deity: null }), true)
})

// ---- the browser ------------------------------------------------------------------------------

function donor(name: string, extra: Partial<DonorRow> = {}): DonorRow {
  return {
    key: name.toLowerCase(),
    name,
    slots: ['PRIMARY'],
    classes: [],
    effect: 'Shared Proc',
    socket: 'proc',
    tierRequired: 4,
    hasteLocked: false,
    quest: false,
    playerCrafted: false,
    eraTag: 'Classic',
    searchKey: name.toLowerCase(),
    ...extra
  }
}

const FREE = donor('Free Sword')
const GODLY = donor('Godly Sword', { deities: ['INNORUUK'] })
const HIGH = donor('High Sword', { reqLevel: 50 })
const WARRIOR = donor('Warrior Sword', { classes: ['WAR'] })
const ROWS = [GODLY, FREE, HIGH, WARRIOR]
const TRIO: ClassAbbr[] = ['PAL', 'ENC', 'MNK']
// The class filter off, so the class half is the new mark's to show or hide.
const FILTERS = { ...DEFAULT_FILTERS, trioOnly: false }
const VIEW: DonorView = { eraOnly: true, nonEquip: false, wearer: { deity: 'KARANA', level: 30 } }
const names = (rows: readonly DonorRow[]): string[] => rows.map((d) => d.name)

test('by default the rows you cannot use are listed, each with its reasons', () => {
  assert.deepEqual(names(filterDonors(ROWS, FILTERS, TRIO, VIEW)), names(ROWS))
  assert.deepEqual(donorUnusable(GODLY, TRIO, VIEW).map((r) => r.kind), ['deity'])
  assert.deepEqual(donorUnusable(HIGH, TRIO, VIEW).map((r) => r.kind), ['level'])
  assert.deepEqual(donorUnusable(WARRIOR, TRIO, VIEW).map((r) => r.kind), ['class'])
  assert.deepEqual(donorUnusable(FREE, TRIO, VIEW), [])
  // No wearer known at all: nothing is marked but the class half the browse itself states.
  assert.deepEqual(donorUnusable(GODLY, TRIO, { eraOnly: true, nonEquip: false }), [])
})

test('the choice hides them, and an empty list then says how many it is holding back', () => {
  const hiding: DonorView = { ...VIEW, hideUnusable: true }
  assert.deepEqual(names(filterDonors(ROWS, FILTERS, TRIO, hiding)), ['Free Sword'])
  const search = { ...FILTERS, text: 'godly' }
  assert.equal(filterDonors(ROWS, search, TRIO, hiding).length, 0)
  assert.deepEqual(hiddenByView(ROWS, search, TRIO, hiding), { era: 0, nonEquip: 0, unusable: 1 })
  // Off, it holds nothing back and says so.
  assert.deepEqual(hiddenByView(ROWS, { ...FILTERS, text: 'nothing' }, TRIO, VIEW), {
    era: 0,
    nonEquip: 0,
    unusable: 0
  })
})

test('what you can use comes first, inside a group and across groups, each half in its old order', () => {
  const cant = new Set([GODLY, HIGH])
  // One effect, one group: the usable rows lead, the unusable keep their relative order after.
  const [one] = usableFirst(groupDonors([GODLY, FREE, HIGH], 'effect', () => null), (d) => cant.has(d))
  assert.deepEqual(names(one.donors), ['Free Sword', 'Godly Sword', 'High Sword'])
  // Two groups: the one with nobody usable sinks below, though the effect axis put it first.
  const lone = donor('Lone Axe', { effect: 'Other Proc' })
  const groups = groupDonors([GODLY, HIGH, lone], 'effect', () => null)
  assert.deepEqual(groups.map((g) => g.label), ['Shared Proc', 'Other Proc'])
  assert.deepEqual(
    usableFirst(groups, (d) => cant.has(d)).map((g) => g.label),
    ['Other Proc', 'Shared Proc']
  )
})

// ---- the corpus -------------------------------------------------------------------------------

test('a donor row carries its page deity line, so the browser can mark it', () => {
  const donors = buildPlannerDonors(itemsJson as unknown as ItemDbFile)
  // The owner's own report (2026-09-11): it looked usable on Malkil and was not, by deity.
  const scalp = donors.find((d) => d.name === 'Scalp of the Ghoul Lord')
  assert.ok(scalp, 'Scalp of the Ghoul Lord is a donor')
  assert.deepEqual(scalp.deities, ['BERTOXXULOUS', 'CAZIC THULE', 'INNORUUK', 'RALLOS ZEK', 'VEESHAN'])
  assert.deepEqual(unusableReasons(scalp, { classes: [], deity: 'KARANA', level: null }).map((r) => r.kind), [
    'deity'
  ])
  // A floor, not a count (frozen numbers rot): about twenty donors state a deity line.
  const withDeity = donors.filter((d) => d.deities !== undefined)
  assert.ok(withDeity.length >= 15, `${String(withDeity.length)} donors state a deity`)
  assert.ok(withDeity.every((d) => d.deities !== undefined && d.deities.length > 0))
})
