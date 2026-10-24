// The item page's categories, Effect line, Pet Illusion line and Lore repairs, as the wiki's Item Page
// Blueprint writes them (Help:Contents; owner's Petamorph Wand: Mummy against the Werewolf page, 2026-10-23).

import { test } from 'node:test'
import assert from 'node:assert/strict'
import { classesOf, itemCategoryGroups } from '../src/shared/itemCategories.ts'
import { effectText, petIllusionLine, petIllusionOf } from '../src/shared/itemEffects.ts'
import { bestLoreLine, withSplitCapital } from '../src/shared/itemLore.ts'
import { tabRowAt } from '../src/shared/itemTabRow.ts'

const NONE = { crafted: false, soldBy: false, zones: [] }

test('CLASSES: ALL IS ALL SIXTEEN, SHADOW KNIGHT BEFORE SHAMAN; "ALL EXCEPT" AND CODES FILE ONLY THOSE', () => {
  assert.equal(classesOf('ALL').length, 16)
  assert.deepEqual(classesOf('ALL').slice(12, 14), ['Shadow Knight Equipment', 'Shaman Equipment'])
  assert.deepEqual(classesOf('ALL except BRD WAR').includes('Bard Equipment'), false)
  assert.equal(classesOf('ALL except BRD WAR').length, 14)
  assert.deepEqual(classesOf('WAR PAL SHD'), ['Paladin Equipment', 'Shadow Knight Equipment', 'Warrior Equipment'])
})

test('GROUPS: CLASSES, SLOTS, SKILL, KINDS, ZONES; A BLOCK WITH NO SLOT FILES NO CLASS', () => {
  const sword = 'Magic Item<br>\nSlot: PRIMARY SECONDARY<br>\nSkill: 1H Piercing Atk Delay: 20<br>\nEffect: [[Fire|x]] (Combat)<br>\nClass: WAR ROG<br>\nRace: ALL<br>'
  assert.deepEqual(itemCategoryGroups(sword, { crafted: true, soldBy: true, zones: ['Qeynos Hills', 'Befallen', 'Befallen'] }), [
    ['Rogue Equipment', 'Warrior Equipment'],
    ['Primary', 'Secondary'],
    ['Piercing'],
    ['Player Crafted', 'Vendor Sold', 'Weapon Procs'],
    ['Befallen', 'Qeynos Hills']
  ])
  assert.deepEqual(itemCategoryGroups('Quest Item, No Trade<br>\nClass: ALL<br>', NONE), [['Quest Items']])
  assert.deepEqual(itemCategoryGroups('Slot: FINGER<br>\nClass: ALL<br>', NONE)[1], ['Fingers'])
  assert.deepEqual(itemCategoryGroups(undefined, NONE), [])
})

test('THE EFFECT LINE IN THE PAGES\' FORM: SPAN LINK, KIND WORD, THE BRACKET, CAST TIME, COOLDOWN IN SECONDS, LEVEL', () => {
  const info = new Map([['Casting Time', '5.0'], ['Cooldown', '10']])
  assert.equal(
    effectText('Click', 'Summon Familiar: Mummy', 'Can Equip', info),
    "Effect: [[Summon Familiar: Mummy|<span class='itemeff'>Summon Familiar: Mummy</span>]] (Clicky, Can Equip, Casting Time: 5.0, Cooldown: 10 seconds)"
  )
  assert.equal(effectText('Worn', 'Spirit of Wolf', undefined, new Map()), "Effect: [[Spirit of Wolf|<span class='itemeff'>Spirit of Wolf</span>]] (Worn)")
  assert.match(effectText('Click', 'Firestrike', 'Must Equip', new Map([['Level', '40']])), /\(Clicky, Must Equip\) at Level 40$/)
})

test('PET ILLUSION: THE WINDOW\'S LINES NAME IT; THE LINE IS THE PAGES\' FORM; THE DESCRIPTION LINE IS TAKEN', () => {
  const lines = ['Effect: Pet Illusion: Mummy (Casting Time: 5.0)', 'Pet Illusion: Mummy', 'Changes your pet to look like a Mummy', 'Size: SMALL']
  const p = petIllusionOf(lines)
  assert.equal(p.name, 'Mummy')
  assert.deepEqual([...p.taken].sort(), [0, 1, 2])
  assert.equal(petIllusionLine('Mummy'), "Pet Illusion: [[Pet Illusion: Mummy|<span class='itemeff'>Mummy</span>]]<br>")
  assert.equal(petIllusionOf(['Size: SMALL']).name, undefined)
})

test('LORE: A CAPITAL OCR SPLIT OFF ITS WORD COMES BACK; A, I AND O ARE WORDS OF THEIR OWN', () => {
  assert.equal(withSplitCapital("T hey haven't unraveled yet!", "hey haven't unraveled yet!"), "They haven't unraveled yet!")
  assert.equal(withSplitCapital('A mummy wraps', 'mummy wraps'), 'mummy wraps')
  assert.equal(bestLoreLine(['7 WIC 2d 0d 7 PAC', "They haven't unraveled yet!"]), "They haven't unraveled yet!")
})

test('THE TAB ROW READ AS GARBLE IS STILL THE TAB ROW; A LORE LINE OPENING "DESTINY" IS NOT', () => {
  assert.equal(tabRowAt(['"FCT Desorgwtngy 7 WIC 2d 0d 7 PAC', "They haven't unraveled yet!"]), 0)
  assert.equal(tabRowAt(['Destiny awaits those who wait']), -1)
})
