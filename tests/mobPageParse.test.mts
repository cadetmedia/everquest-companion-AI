// Mob page reader (src/main/mobLookupParse.ts, scripts/sources/mobPage.ts) on shapes found in the
// cached wiki corpus. Fixtures are trimmed copies of the pages they are named after.
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { parseMobLoot, parseMobWikitext } from '../src/main/mobLookupParse'
import { parseMobPage } from '../scripts/sources/mobPage'

test('known_loot written as [[Item]] links is read as drops (A Blood Wolf, Gnawfang)', () => {
  const wolf = '* [[Chunk of Meat]]\n* [[Mist Wolf Pelt]]\n* [[Ruined Wolf Pelt]]\n* [[Wolf Meat]]'
  assert.deepEqual(parseMobLoot(wolf).map((d) => d.item), ['Chunk of Meat', 'Mist Wolf Pelt', 'Ruined Wolf Pelt', 'Wolf Meat'])
  const gnawfang = "<ul>\n<li>  {{:Gnawfang's Pelt}}  </li>\n<li> {{:Gnawfang's Tooth}}  </li>\n<li> [[High Quality Cat Pelt]] </li>\n</ul>"
  assert.deepEqual(parseMobLoot(gnawfang).map((d) => d.item), ["Gnawfang's Pelt", "Gnawfang's Tooth", 'High Quality Cat Pelt'])
})

test('a spell link reads its Spell: label, a piped transclusion its target, underscores fold, and dupes collapse', () => {
  const block = [
    "* [[Improved Invisibility|Spell: Improved Invisibility]] <span class='drare'>(Rare)</span>",
    '* {{:A Mandible|Mandible}} (Common)',
    '* {{:Brass_Knuckles}}',
    '* [[Brass Knuckles]]',
    '* [[Category:Loot]]'
  ].join('\n')
  assert.deepEqual(parseMobLoot(block), [
    { item: 'Spell: Improved Invisibility', rarity: 'Rare' },
    { item: 'A Mandible', rarity: 'Common' },
    { item: 'Brass Knuckles' }
  ])
})

test('a link inside a note is not a drop, and a quoted scroll name is not a rarity', () => {
  const block = '* {{:Cloak of Leaves}} (Rare, [[Lesser Faydark]])\n* {{:Illegible Scroll}} ("Vok Na Zov V")'
  const drops = parseMobLoot(block)
  assert.deepEqual(drops.map((d) => d.item), ['Cloak of Leaves', 'Illegible Scroll'])
  assert.equal(drops[1].rarity, undefined)
})

test('zones separated by <br>, newlines or side-by-side links stay separate (A Tottering Gorilla, A Treant)', () => {
  const page = (zone: string): string => `{{Namedmobpage\n| name = x\n| zone = ${zone}\n| level = 10\n}}`
  assert.deepEqual(parseMobPage('A Tottering Gorilla', page('[[Burning Woods]]<br>[[Emerald Jungle]]'))?.zones, ['Burning Woods', 'Emerald Jungle'])
  assert.deepEqual(parseMobPage('A Treant', page('[[Eastern Plains of Karana]] [[Western Plains of Karana]]'))?.zones, [
    'Eastern Plains of Karana',
    'Western Plains of Karana'
  ])
  assert.deepEqual(parseMobPage('A Black Wolf', page('[[East Commonlands]]\n[[East Karana]]\n[[The Feerrott]]'))?.zones, [
    'East Commonlands',
    'East Karana',
    'The Feerrott'
  ])
  assert.equal(parseMobWikitext(page('[[Burning Woods]]<br>[[Emerald Jungle]]')).zone, 'Burning Woods, Emerald Jungle')
})

test('a |name typed with underscores reads as the spaced name the game prints', () => {
  assert.equal(parseMobWikitext('{{Namedmobpage\n| name = a_minnow\n| level = 1\n}}').pageName, 'a minnow')
})

test('the page era banner is kept as eraTag, right after page, and absent when the page states none', () => {
  const body = '{{Namedmobpage\n| name = A Hatebone Drake\n| zone = [[Plane of Hate]]\n| level = 52\n}}'
  const drake = parseMobPage('A Hatebone Drake', `{{FearHateRevamp Era}}${body}`)
  assert.equal(drake?.eraTag, 'FearHateRevamp')
  assert.deepEqual(Object.keys(drake ?? {}).slice(0, 3), ['page', 'eraTag', 'name'])
  const bare = parseMobPage('A Hatebone Drake', body)
  assert.equal(bare?.eraTag, undefined)
  assert.equal(bare !== null && 'eraTag' in bare, false)
})

test('the wiki era rule: the page banner decides, whatever zone the page names', () => {
  const page = (era: string, zone: string): string => `{{${era} Era}}{{Namedmobpage\n| name = x\n| zone = [[${zone}]]\n| level = 10\n}}`
  assert.equal(parseMobPage('A Hatebone Drake', page('FearHateRevamp', 'Plane of Hate'))?.outOfEra, true)
  // A Kunark addition to a classic zone is out: the classic zone does not rescue it.
  assert.equal(parseMobPage('Eejag', page('Kunark', 'Lavastorm Mountains'))?.outOfEra, true)
  assert.equal(parseMobPage('A Kael Drakkel guard', page('Velious', 'Kael Drakkel'))?.outOfEra, true)
  // In-era and unbannered mobs carry no flag at all.
  assert.equal(parseMobPage('A rat', page('Classic', 'Befallen'))?.outOfEra, undefined)
})
