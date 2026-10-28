// WORN IS NOT BENEFIT (owner, 2026-10-27: "if they didn't select ALL for the classes, an ALL item
// that doesn't BENEFIT them is useless for them"; Malkil, 2026-10-26: a bard instrument is
// "All/All, but it provides absolutely no benefit unless I have Bard in my loadout").
//
// One rule (`usability.benefitsClasses`, the Character tab's `helps` reads it too), asked by every
// class selector: the Exaltations browser's class filter and its "can't use" mark, and the Gear tab.
// The corpus half pins that the donor rows now carry the benefit the gear rows already did.

import { test } from 'node:test'
import assert from 'node:assert/strict'
import itemsJson from '../src/main/data/items.json'
import type { ItemDbFile } from '../src/main/itemsDb'
import { buildPlannerDonors } from '../src/main/planner/effectIndex'
import { benefitsClasses, unusableLabel, unusableReasons } from '../src/shared/planner/usability'
import { helps } from '../src/renderer/src/features/character/exaltationAudit'
import { DEFAULT_FILTERS, donorUnusable, filterDonors, type DonorRow } from '../src/renderer/src/features/planner/plannerData'
import { benefitMismatch, effectMatches } from '../src/renderer/src/features/gear/gearFilter'
import type { ClassAbbr } from '../src/shared/classCombo'
import type { FocusBenefit, GearEffect, GearRow } from '../src/shared/planner/gear'

const TRIO: ClassAbbr[] = ['WAR', 'MNK', 'SHM']
const BARD: FocusBenefit = { classes: ['BRD'], needs: 'BRD' }
const ALL_CLASSES: ClassAbbr[] = ['WAR', 'MNK', 'SHM', 'BRD', 'BER', 'BST']

test('a proven limit narrows, and every unknown helps', () => {
  assert.equal(benefitsClasses(BARD, TRIO), false)
  assert.equal(benefitsClasses(BARD, [...TRIO, 'BRD']), true)
  // No class chosen ("All") and no limit proven both help.
  assert.equal(benefitsClasses(BARD, []), true)
  assert.equal(benefitsClasses(undefined, TRIO), true)
  // The Character tab's advice reads the same answer.
  assert.equal(helps({ benefit: BARD }, { classes: TRIO, deity: null } as never), false)
  assert.equal(helps({ benefit: BARD }, { classes: [], deity: null } as never), true)
})

test('wearable but useless is its own reason, and never said on top of the class reason', () => {
  const horn = { classes: ALL_CLASSES, benefit: BARD }
  const reasons = unusableReasons(horn, { classes: TRIO, deity: null, level: null })
  assert.deepEqual(reasons.map((r) => r.kind), ['benefit'])
  assert.equal(unusableLabel(reasons), "can't use: no benefit")
  assert.equal(reasons[0].why, 'Its effect only helps BRD - you are WAR, MNK, SHM.')
  const wrongClass = { classes: ['ROG'] as ClassAbbr[], benefit: BARD }
  assert.deepEqual(
    unusableReasons(wrongClass, { classes: TRIO, deity: null, level: null }).map((r) => r.kind),
    ['class']
  )
})

function donor(name: string, extra: Partial<DonorRow> = {}): DonorRow {
  return {
    key: name.toLowerCase(),
    name,
    slots: ['PRIMARY'],
    classes: ALL_CLASSES,
    effect: 'Brass Resonance 9',
    family: 'Brass Resonance',
    familyTier: 9,
    socket: 'focus',
    tierRequired: 1,
    hasteLocked: false,
    quest: false,
    playerCrafted: false,
    eraTag: 'Classic',
    searchKey: name.toLowerCase(),
    ...extra
  }
}

test('the Exaltations class filter hides a donor none of the classes can benefit from', () => {
  const horn = donor('Alluring Horn', { benefit: BARD })
  const ring = donor('Plain Ring', { effect: 'Improved Damage I', family: 'Improved Damage' })
  const filters = { ...DEFAULT_FILTERS, socket: 'focus' as const, trioOnly: true }
  const view = { eraOnly: false, nonEquip: true }
  const names = (rows: readonly DonorRow[]): string[] => rows.map((d) => d.name)
  assert.deepEqual(names(filterDonors([horn, ring], filters, TRIO, view)), ['Plain Ring'])
  // A Bard in the trio, or no class chosen: the horn is back.
  assert.deepEqual(names(filterDonors([horn, ring], filters, ['WAR', 'BRD'], view)), ['Alluring Horn', 'Plain Ring'])
  assert.deepEqual(names(filterDonors([horn, ring], filters, [], view)), ['Alluring Horn', 'Plain Ring'])
  // The filter off: listed, and marked with why.
  const off = { ...filters, trioOnly: false }
  assert.deepEqual(names(filterDonors([horn, ring], off, TRIO, view)), ['Alluring Horn', 'Plain Ring'])
  assert.deepEqual(donorUnusable(horn, TRIO, view).map((r) => r.kind), ['benefit'])
})

test('the corpus: an ALL instrument donor carries the bard limit', () => {
  const donors = buildPlannerDonors(itemsJson as unknown as ItemDbFile)
  const horn = donors.find((d) => d.name === "Denon's Horn of Disaster" && d.socket === 'focus')
  assert.ok(horn, "Denon's Horn of Disaster is a focus donor")
  assert.ok(horn.classes.includes('WAR'), 'it states ALL')
  assert.deepEqual(horn.benefit?.classes, ['BRD'])
  assert.equal(benefitsClasses(horn.benefit, TRIO), false)
})

function gear(name: string, over: Partial<GearRow> = {}): GearRow {
  return {
    key: name.toLowerCase(),
    name,
    searchKey: name.toLowerCase(),
    slots: ['PRIMARY', 'SECONDARY'],
    classes: ALL_CLASSES,
    races: ['ALL'],
    flags: [],
    quest: false,
    playerCrafted: false,
    stats: { WEIGHT: 1 },
    effects: [],
    ...over
  }
}

const RESONANCE: GearEffect = { name: 'Brass Resonance 1', kind: 'focus', socket: 'focus', tierRequired: 1, benefit: BARD }

test('the Gear tab drops a row whose only value is an effect that helps none of the classes', () => {
  const trumpet = gear('Unfinished Brass Trumpet', { effects: [RESONANCE] })
  assert.equal(benefitMismatch(trumpet, TRIO), true)
  assert.equal(benefitMismatch(trumpet, ['BRD']), false)
  assert.equal(benefitMismatch(trumpet, []), false)
  // Any stat or save is a benefit, so the row stays.
  assert.equal(benefitMismatch(gear("Denon's Horn", { effects: [RESONANCE], stats: { WEIGHT: 2, HP: 50 } }), TRIO), false)
  // An item with no effect at all is not this rule's to judge.
  assert.equal(benefitMismatch(gear('Plain Rock'), TRIO), false)
})

test("the Gear tab's effect filter counts only effects that help the classes", () => {
  const horn = gear("Denon's Horn", { effects: [RESONANCE], stats: { HP: 50 } })
  assert.equal(effectMatches(horn, 'focus', TRIO), false)
  assert.equal(effectMatches(horn, 'has', TRIO), false)
  assert.equal(effectMatches(horn, 'focus', []), true)
  assert.equal(effectMatches(horn, 'any', TRIO), true)
})
