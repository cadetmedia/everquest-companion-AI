// "You're holding it" on an Items gap row (review C6; owner, 2026-10-19): the inventory export says
// where each copy was, the log's loot since it lands in the bags, its destroys come off. Fixtures only.
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { gapHeld, heldCaption, heldChipLabel, heldIndex, heldLine, heldPickOf, heldPickText, heldTitle, isOwnExport, joinHeld, onlyHeld } from '../src/shared/gapHeld'
import type { GapRow } from '../src/shared/gaps'
import type { OwnershipEntry, OwnershipRow } from '../src/shared/planner/ownership'
import type { LootEvent } from '../src/shared/types'
import { computeDestroyedAfter, computeHeldCountsAfter } from '../src/renderer/src/features/posky/heldCounts'

const row = (name: string, domain: GapRow['domain'] = 'item'): GapRow => ({ domain, name, kinds: ['looted'], count: 1, first: '', last: '', details: { samples: [] } })
const own = (key: string, place: OwnershipRow['place'], count: number, extra: Partial<OwnershipRow> = {}): OwnershipRow =>
  ({ key, name: key, rawName: key, place, location: '', count, section: 'Location', exaltation: false, containment: 'top', itemId: 0, line: 1, ...extra }) as OwnershipRow
const EXPORTED = '2026-10-19T12:00:00.000Z'
const AT = Date.parse(EXPORTED)

test('an item in the export is held, at any tier and any case, with its places in reading order', () => {
  const entries: OwnershipEntry[] = [['glowing stone', [own('glowing stone', 'bank', 1), own('glowing stone', 'inventory', 2, { tier: 3 })]]]
  const index = heldIndex({ entries, loadedAt: EXPORTED }, {})
  for (const name of ['Glowing Stone', 'GLOWING STONE +3', 'glowing stone +1']) {
    assert.equal(gapHeld(row(name), index)[0]?.total, 3, name)
  }
  const held = gapHeld(row('Glowing Stone'), index)
  assert.equal(heldLine(held[0] ?? assert.fail()), 'You hold 3 (2 bags, 1 bank): screenshot it for the wiki now.')
  assert.match(heldTitle(held), /inventory export of 2026-10-19/)
  assert.equal(heldChipLabel(held), 'held')
})

test('one place reads as the place alone; the line is the owner example', () => {
  const index = heldIndex({ entries: [['rat ear', [own('rat ear', 'inventory', 2)]]], loadedAt: EXPORTED }, {})
  assert.equal(heldLine(gapHeld(row('Rat Ear'), index)[0] ?? assert.fail()), 'You hold 2 (bags): screenshot it for the wiki now.')
})

test('loot after the export lands in the bags; destroys after it come off the bags first', () => {
  const loot = [
    { item: 'Rat Ear +2', source: 'a rat', ts: AT - 1000 },
    { item: 'Rat Ear', source: 'a rat', ts: AT + 1000 },
    { item: 'rat ear +1', source: 'a rat', ts: AT + 2000, count: 2 },
    { item: 'Bat Wing', source: 'a bat', ts: AT + 3000, disposition: 'sold' },
    { item: 'Snake Scale', source: 'a snake', ts: AT + 4000 },
    { item: 'Snake Scale', ts: AT + 5000, disposition: 'destroyed' }
  ] as LootEvent[]
  const entries: OwnershipEntry[] = [['rat ear', [own('rat ear', 'bank', 1)]]]
  const index = heldIndex({ entries, loadedAt: EXPORTED }, computeHeldCountsAfter(loot, AT), computeDestroyedAfter(loot, AT))
  assert.equal(heldLine(gapHeld(row('Rat Ear'), index)[0] ?? assert.fail()), 'You hold 4 (3 bags, 1 bank): screenshot it for the wiki now.')
  // Auto-sold on loot never reached the bags; looted then destroyed is gone.
  assert.equal(gapHeld(row('Bat Wing'), index).length, 0)
  assert.equal(gapHeld(row('Snake Scale'), index).length, 0)
})

test('no export is no claim; an exaltation row is the gem, not a copy; another domain is never held', () => {
  const loot = [{ item: 'Rat Ear', source: 'a rat', ts: 5 }] as LootEvent[]
  assert.equal(heldIndex({ entries: [], loadedAt: null }, computeHeldCountsAfter(loot, 0)).size, 0)
  const entries: OwnershipEntry[] = [['golden efreeti boots', [own('golden efreeti boots', 'equipped', 1, { exaltation: true })]]]
  const index = heldIndex({ entries, loadedAt: EXPORTED }, {})
  assert.equal(gapHeld(row('Golden Efreeti Boots'), index).length, 0)
  const rats = heldIndex({ entries: [['a rat', [own('a rat', 'inventory', 1)]]], loadedAt: EXPORTED }, {})
  assert.equal(gapHeld(row('a rat', 'mob'), rats).length, 0)
})

test("only a character's own export counts, and with All characters each holder is named", () => {
  // The Gear read falls back to the newest export of ANY character; that file is not this one's.
  assert.equal(isOwnExport('C:/EQ/Drywrought_oggok-Inventory.txt', 'Drywrought', 'oggok'), true)
  assert.equal(isOwnExport('C:\\EQ\\Drywrought_oggok-Inventory.txt', 'Drywrought', 'oggok'), true)
  assert.equal(isOwnExport('C:\\EQ\\Drywrought_oggok-Inventory.txt', 'Prettyboygeorge', 'qeynos'), false)
  assert.equal(isOwnExport(null, 'Drywrought', 'oggok'), false)
  const dry = heldIndex({ entries: [['minotaur blood', [own('minotaur blood', 'inventory', 2)]]], loadedAt: EXPORTED }, {}, {}, 'Drywrought')
  const kal = heldIndex({ entries: [['minotaur blood', [own('minotaur blood', 'bank', 1)]]], loadedAt: EXPORTED }, {}, {}, 'Kaltinril')
  const both = gapHeld(row('Minotaur Blood'), joinHeld([dry, kal]))
  assert.equal(heldChipLabel(both), 'held by Drywrought, Kaltinril')
  assert.deepEqual(both.map(heldLine), [
    'Drywrought holds 2 (bags): screenshot it for the wiki now.',
    'Kaltinril holds 1 (bank): screenshot it for the wiki now.'
  ])
})

test('"I have it" keeps the Items rows someone holds; another domain passes; the caption counts the held, in the zone, less hidden', () => {
  const dry = heldIndex({ entries: [['minotaur blood', [own('minotaur blood', 'inventory', 2)]], ['rat ear', [own('rat ear', 'bank', 1)]]], loadedAt: EXPORTED }, {}, {}, 'Drywrought')
  const kal = heldIndex({ entries: [['glowing stone', [own('glowing stone', 'bank', 1)]]], loadedAt: EXPORTED }, {}, {}, 'Kaltinril')
  const inZone = (name: string, zone: string): GapRow => ({ ...row(name), details: { samples: [], zones: { distinct: 1, entries: [{ name: zone, n: 1 }] } } })
  const rows = [inZone('Minotaur Blood +2', 'Befallen'), inZone('Rat Ear', 'Oggok'), row('Bat Wing'), row('Glowing Stone'), row('a minotaur blood', 'mob')]
  assert.deepEqual(onlyHeld(rows, dry).map((r) => r.name), ['Minotaur Blood +2', 'Rat Ear', 'a minotaur blood'])
  // All characters: held by any character whose own export was read.
  assert.deepEqual(onlyHeld(rows, joinHeld([dry, kal])).map((r) => r.name), ['Minotaur Blood +2', 'Rat Ear', 'Glowing Stone', 'a minotaur blood'])
  // No export: nothing is held, so no Items row stays.
  assert.deepEqual(onlyHeld(rows, new Map()).map((r) => r.name), ['a minotaur blood'])
  assert.equal(heldCaption(rows, null, () => false, { index: dry, where: 'any' }), '2 held')
  assert.equal(heldCaption(rows, 'Befallen 4 (Refined)', () => false, { index: dry, where: 'any' }), '1 held')
  assert.equal(heldCaption(rows, null, (r) => r.name === 'Rat Ear', { index: dry, where: 'any' }), '1 held')
})

test('"I have it" in bags or in bank, by the export places: worn and keyring with the bags; shared bank and the depot with the bank', () => {
  const entries: OwnershipEntry[] = [
    ['rat ear', [own('rat ear', 'inventory', 1)]],
    ['bat wing', [own('bat wing', 'equipped', 1)]],
    ['sky key', [own('sky key', 'keyring', 1)]],
    ['glowing stone', [own('glowing stone', 'bank', 1)]],
    ['snake scale', [own('snake scale', 'sharedBank', 1)]],
    ['spider silk', [own('spider silk', 'personalDepot', 2)]],
    ['minotaur blood', [own('minotaur blood', 'bank', 1), own('minotaur blood', 'inventory', 1)]],
    ['odd thing', [own('odd thing', 'unknown', 1)]]
  ]
  const index = heldIndex({ entries, loadedAt: EXPORTED }, { 'fire beetle eye': 1 })
  const rows = ['Rat Ear', 'Bat Wing', 'Sky Key', 'Glowing Stone', 'Snake Scale', 'Spider Silk +2', 'Minotaur Blood', 'Odd Thing', 'Fire Beetle Eye', 'Bone Chips'].map((n) => row(n))
  const names = (where: 'any' | 'bags' | 'bank'): string[] => onlyHeld(rows, index, where).map((r) => r.name)
  assert.deepEqual(names('any'), ['Rat Ear', 'Bat Wing', 'Sky Key', 'Glowing Stone', 'Snake Scale', 'Spider Silk +2', 'Minotaur Blood', 'Odd Thing', 'Fire Beetle Eye'])
  // Loot since the export is in the bags; a copy in both places is in both lists.
  assert.deepEqual(names('bags'), ['Rat Ear', 'Bat Wing', 'Sky Key', 'Minotaur Blood', 'Fire Beetle Eye'])
  assert.deepEqual(names('bank'), ['Glowing Stone', 'Snake Scale', 'Spider Silk +2', 'Minotaur Blood'])
  assert.equal(heldCaption(rows, null, () => false, { index, where: 'bags' }), '5 in bags')
  assert.equal(heldCaption(rows, null, () => false, { index, where: 'bank' }), '4 in bank')
  assert.equal(heldCaption(rows, null, () => false, { index, where: 'any' }), '9 held')
})

test('the stored pick: the old box stored 1 for on, which is Anywhere and 0 is Off, and Anywhere is stored as 1 again', () => {
  assert.equal(heldPickOf('1'), 'any')
  assert.equal(heldPickOf('0'), 'off')
  assert.equal(heldPickOf(null), 'off')
  assert.equal(heldPickOf('bank'), 'bank')
  assert.equal(heldPickOf('nonsense'), 'off')
  for (const p of ['off', 'any', 'bags', 'bank'] as const) assert.equal(heldPickOf(heldPickText(p)), p)
  assert.equal(heldPickText('any'), '1')
})
