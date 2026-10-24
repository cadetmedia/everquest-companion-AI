// Items rows for items no log line names (owner, 2026-10-22: Petamorph Wand: Gelatinous Cube, a store
// purchase with no log line, listed by the inventory export only): the known-item check main answers,
// the rows built from the export and from captures, and the snapshot they join. Lines from the
// owner's own export (Drywrought_oggok-Inventory.txt, 20:49), fixtures otherwise.
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { knownIndex, knownItem, unknownOf, unknownSpells } from '../src/main/gapUnknownItems'
import { parseInventoryDump } from '../src/main/outputs/inventoryParse'
import { capturedExtras, capturedItemsOf, extraItemRows, extraSpellRows, heldCandidates, heldExtras, withCapturedItem, withExtraItemRows, withoutCapturedItem } from '../src/shared/gapExtraItems'
import { heldIndex } from '../src/shared/gapHeld'
import { gapInZone, type GapRow } from '../src/shared/gaps'
import { ownershipPayload } from '../src/shared/planner/ownership'

const EXPORT = [
  'Location\tName\tID\tCount\tSlots',
  'Any Slot\tBone-Clasped Girdle +6\t11666\t1\t11',
  'Any Slot-Slot7\tBone-Clasped Girdle (Exaltation)\t11666\t1\t11',
  'General 6\tKavruul`s Mystic Pouch\t17701\t1\t10',
  'General 6-Slot1\tGlow Lichen\t14925\t3\t11',
  'General 6-Slot2\tEmpty\t0\t0\t0',
  'General 6-Slot3\tPetamorph Wand: Gelatinous Cube\t181005\t1\t11',
  'General 6-Slot4\tSpell: Clarity\t1\t1\t11',
  'Activated\tPetamorph Wand: Werewolf\t181012',
  'Activated\tPetamorph Wand: Murderbee\t177979'
].join('\n')
const AT = '2026-10-22T23:49:00.000Z'
const KNOWN = knownIndex(["bone-clasped girdle", "kavruul's mystic pouch", 'glow lichen', 'an odd rock', 'petamorph wand: werewolf', 'petamorph wand: murderbee'], ['Clarity'])

const held = () => heldIndex(ownershipPayload({ path: 'Drywrought_oggok-Inventory.txt', loadedAt: AT, dump: parseInventoryDump(EXPORT) }), {})
const row = (name: string, kinds: GapRow['kinds'] = ['looted']): GapRow => ({ domain: 'item', name, kinds, count: 1, first: '', last: '', details: { samples: [] } })

test("THE KNOWN-ITEM CHECK FOLDS AS THE ENGINE'S: +N, (EXALTATION), QUOTES, LOOSE SPELLING, AN ARTICLE, A SCROLL'S SPELL", () => {
  // The article is dropped from the wiki's name, as gaps_keys.rs does: `Odd Rock` is `an odd rock`.
  for (const n of ['Bone-Clasped Girdle +6', 'Bone-Clasped Girdle (Exaltation)', 'Bone-Clasped Girdle (Ornamentation)', 'Kavruul`s Mystic Pouch', 'Bone Clasped Girdle', 'Odd Rock', 'Spell: Clarity']) {
    assert.ok(knownItem(n, KNOWN), n)
  }
  assert.ok(!knownItem('Petamorph Wand: Gelatinous Cube', KNOWN))
  assert.ok(!knownItem('Spell: Unknown Thing', KNOWN))
  assert.deepEqual(unknownOf(['Petamorph Wand: Gelatinous Cube', 'Glow Lichen', 'Petamorph Wand: Gelatinous Cube', '', '0'], KNOWN), ['Petamorph Wand: Gelatinous Cube'])
})

test("THE OWNER'S EXPORT GIVES ONE ROW: THE STORE WAND NO LOG LINE NAMES; A NAME A ROW ALREADY HAS IS NOT ASKED ABOUT", () => {
  const index = held()
  const asked = heldCandidates(index, [row('Glow Lichen')])
  assert.ok(!asked.includes('Glow Lichen'), 'a row names it: its own held chip says so')
  assert.ok(!asked.includes('Empty'))
  const unknown = new Set(unknownOf(asked, KNOWN))
  assert.deepEqual([...unknown], ['Petamorph Wand: Gelatinous Cube'])
  const rows = extraItemRows(heldExtras(index, unknown), [])
  assert.equal(rows.length, 1)
  assert.equal(rows[0].name, 'Petamorph Wand: Gelatinous Cube')
  assert.deepEqual(rows[0].kinds, ['held'])
  assert.equal(rows[0].count, 1)
  assert.match(rows[0].details.samples[0] ?? '', /^You: 1 in General 6-Slot3 \(inventory export 2026-10-2\d \d\d:49:00\)$/)
  // No zone: Zone I'm in still lists it.
  assert.equal(gapInZone(rows[0], 'Lake Nerius'), true)
})

test('A CAPTURED ITEM WITH NO ROW IS A ROW; HELD AND CAPTURED JOIN; A ROW ALREADY THERE WINS; THE SNAPSHOT COUNTS THEM', () => {
  const captured = capturedExtras([{ name: 'Petamorph Wand: Gelatinous Cube', at: '2026-10-23T00:10:00.000Z' }, { name: 'Odd Stone', at: AT }])
  const index = held()
  const rows = extraItemRows([...heldExtras(index, new Set(['Petamorph Wand: Gelatinous Cube'])), ...captured], [row('Odd Stone +2')])
  assert.deepEqual(rows.map((r) => [r.name, r.kinds]), [['Petamorph Wand: Gelatinous Cube', ['captured', 'held']]])
  const snap = withExtraItemRows({ rows: [row('Rat Ear')], totals: { item: 1, mob: 0 } }, rows)
  assert.equal(snap.rows.length, 2)
  assert.deepEqual(snap.totals, { item: 2, mob: 0 })
  const same = { rows: [], totals: { item: 0 } }
  assert.equal(withExtraItemRows(same, []), same)
})

test('THE KEPT CAPTURES READ BACK WHOLE; A SECOND CAPTURE OF A NAME MOVES ITS TIME; THE NEWEST ARE KEPT', () => {
  assert.deepEqual(capturedItemsOf([{ name: 'A', at: 'x' }, { name: 3 }, null, 'junk']), [{ name: 'A', at: 'x' }])
  assert.deepEqual(capturedItemsOf('nope'), [])
  const list = withCapturedItem([{ name: 'A', at: '1' }, { name: 'B', at: '2' }], 'a', '3', 300)
  assert.deepEqual(list, [{ name: 'B', at: '2' }, { name: 'a', at: '3' }])
  assert.equal(withCapturedItem(list, 'C', '4', 2).length, 2)
  // Remove capture (owner, 2026-10-23: a misread `Altunable`): that name goes, any case; the rest stay.
  assert.deepEqual(withoutCapturedItem(list, 'A'), [{ name: 'B', at: '2' }])
})

test('A PASTED SPELL WINDOW WHOSE SPELL THE WIKI DATA LACKS IS A SPELLS ROW, IN EVERY ZONE; A KNOWN SPELL OR ONE A ROW HAS IS NOT', () => {
  // The bundle's data knows Summon Fang (any case); the Gelatinous Cube illusion it does not.
  assert.deepEqual(unknownSpells(['Pet Illusion: Gelatinous Cube', 'Summon Fang', 'summon fang']), ['Pet Illusion: Gelatinous Cube'])
  const windows = [
    { name: 'Pet Illusion: Gelatinous Cube', at: '2026-10-23T21:55:00.000Z' },
    { name: 'Familiar: Mummy', at: '2026-10-23T21:50:00.000Z' },
    { name: 'Summon Familiar: Werewolf', at: '2026-10-23T21:40:00.000Z' }
  ]
  const logged = { domain: 'spell', name: 'Familiar: Mummy', kinds: ['cast'], count: 1, first: '', last: '', details: {} } as unknown as GapRow
  const rows = extraSpellRows(windows, new Set(['Pet Illusion: Gelatinous Cube', 'Familiar: Mummy']), [logged])
  assert.deepEqual(rows.map((r) => [r.domain, r.name, r.kinds]), [['spell', 'Pet Illusion: Gelatinous Cube', ['captured']]])
  assert.ok(gapInZone(rows[0], 'Lake Nerius'), 'no zone of its own: shown wherever you stand')
  const snap = withExtraItemRows({ rows: [logged], totals: { spell: 1, item: 0 } as Record<string, number> }, rows)
  assert.deepEqual(snap.totals, { spell: 2, item: 0 })
})
