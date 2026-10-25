// A Gaps row's details read a hand edit where one applies and never break on one (owner, 2026-10-25:
// "Just make sure that if a user changes the values it doesn't break anything"). Edits ride on the row
// (shared/gapEdits.ts `withGapEdits`, keyed by `doneKey`); these pin each detail against an edited,
// a blank and a malformed value. Fixtures only.
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { gapHeld, heldIndex, heldLine, joinHeld } from '../src/shared/gapHeld'
import { applyEditText, readEdit, tidyEdit, withGapEdits, type GapEdit } from '../src/shared/gapEdits'
import { wikiPageText } from '../src/shared/wikiPage'
import { killIndex, type KillMap } from '../src/shared/kills'
import type { LootEvent } from '../src/shared/types'
import { gapMapZones, headingMapZone } from '../src/shared/gapMapZones'
import { doneKey, type GapRow } from '../src/shared/gaps'
import type { OwnershipRow } from '../src/shared/planner/ownership'

const row = (name: string, domain: GapRow['domain'] = 'item'): GapRow => ({ domain, name, kinds: ['captured'], count: 1, first: '', last: '', details: { samples: [] } })
const edited = (r: GapRow, edit: unknown): GapRow => withGapEdits([r], { [doneKey(r)]: edit as GapEdit })[0] ?? assert.fail()
const own = (key: string, place: OwnershipRow['place'], count: number): OwnershipRow =>
  ({ key, name: key, rawName: key, place, location: '', count, section: 'Location', exaltation: false, containment: 'top', itemId: 0, line: 1 }) as OwnershipRow
const EXPORTED = '2026-10-25T12:00:00.000Z'

test('C6: held is found under the log name, then under a hand-edited name (a misread capture put right)', () => {
  const index = heldIndex({ entries: [['tunable shard', [own('tunable shard', 'inventory', 1)]]], loadedAt: EXPORTED }, {})
  const misread = row('Altunable Shard')
  assert.deepEqual(gapHeld(misread, index), [])
  const fixed = edited(misread, { name: 'Tunable Shard' })
  assert.equal(heldLine(gapHeld(fixed, index)[0] ?? assert.fail()), 'You hold 1 (bags): screenshot it for the wiki now.')
  // The log's own name still wins when it is held.
  const index2 = heldIndex({ entries: [['altunable shard', [own('altunable shard', 'bank', 2)]]], loadedAt: EXPORTED }, {})
  assert.equal(gapHeld(fixed, index2)[0]?.total, 2)
})

test('C6: a blank, missing or malformed edited name never breaks the held lookup', () => {
  const index = heldIndex({ entries: [['rat ear', [own('rat ear', 'inventory', 1)]]], loadedAt: EXPORTED }, {})
  for (const edit of [{}, { name: '' }, { name: '   ' }, { name: 42 }, { name: null }, { fields: { zone: 'Befallen' } }]) {
    assert.deepEqual(gapHeld(edited(row('Bat Wing'), edit), index), [], JSON.stringify(edit))
    assert.equal(gapHeld(edited(row('Rat Ear'), edit), index).length, 1, JSON.stringify(edit))
  }
  assert.deepEqual(gapHeld(edited(row('Rat Ear', 'mob'), { name: 'Rat Ear' }), index), [], 'only Items rows are held')
})

test('C6: with All characters, the first holder carries the screenshot line and the rest read "Also on" (owner, 2026-10-21)', () => {
  const dry = heldIndex({ entries: [['rat ear', [own('rat ear', 'inventory', 2)]]], loadedAt: EXPORTED }, {}, {}, 'Drywrought')
  const kal = heldIndex({ entries: [['rat ear', [own('rat ear', 'bank', 1)]]], loadedAt: EXPORTED }, {}, {}, 'Kaltinril')
  const val = heldIndex({ entries: [['rat ear', [own('rat ear', 'inventory', 1), own('rat ear', 'bank', 3)]]], loadedAt: EXPORTED }, {}, {}, 'Valtari')
  assert.deepEqual(gapHeld(row('Rat Ear'), joinHeld([dry, kal, val])).map(heldLine), [
    'Drywrought holds 2 (bags): screenshot it for the wiki now.',
    'Also on Kaltinril: 1 (bank).',
    'Also on Valtari: 4 (1 bags, 3 bank).'
  ])
  // The attached character holds none: the first character that does is the one it is on.
  const none = heldIndex({ entries: [], loadedAt: EXPORTED }, {}, {}, 'Drywrought')
  assert.deepEqual(gapHeld(row('Rat Ear'), joinHeld([none, kal])).map(heldLine), ['Kaltinril holds 1 (bank): screenshot it for the wiki now.'])
  // One character alone is never "also".
  assert.equal(gapHeld(row('Rat Ear'), joinHeld([dry]))[0]?.also, undefined)
})

test('C7: the map links are the zones the row was named in, tiers folded, one per map; a refused spelling has none', () => {
  const r: GapRow = { ...row('a giant snake', 'mob'), details: { samples: [], zones: { distinct: 3, entries: [{ name: 'Befallen 4 (Refined)', n: 9 }, { name: 'Befallen', n: 2 }, { name: 'Nektulos Forest', n: 1 }] } } }
  const zones = gapMapZones(r)
  assert.deepEqual(zones.map((z) => z.label), ['Befallen 4 (Refined)', 'Nektulos Forest'])
  assert.equal(zones[0]?.short, headingMapZone('Befallen'))
  assert.notEqual(zones[0]?.short, zones[1]?.short)
  assert.deepEqual(gapMapZones({ ...r, details: { samples: [], zones: { distinct: 1, entries: [{ name: 'Nowhere At All', n: 1 }] } } }), [])
  assert.deepEqual(gapMapZones(row('Rat Ear')), [], 'no zones, no links')
  assert.equal(headingMapZone('Nowhere At All'), null)
  assert.equal(headingMapZone('Lake Nerius'), null, 'a zone with no map file has no link')
})

test("C7: a hand-edited zone opens first, typed plain or as a link; a refused, blank or malformed one changes nothing", () => {
  const r: GapRow = { ...row('a giant snake', 'mob'), details: { samples: [], zones: { distinct: 1, entries: [{ name: 'Befallen', n: 2 }] } } }
  const base = gapMapZones(r)
  for (const zone of ['Nektulos Forest', '[[Nektulos Forest]]', '[[Nektulos Forest|the forest]]', '  Nektulos Forest  ']) {
    const z = gapMapZones(edited(r, { fields: { zone } }))
    assert.deepEqual(z.map((x) => x.label), ['Nektulos Forest', 'Befallen'], zone)
  }
  // The edit names the zone the log saw already: one link, not two.
  assert.equal(gapMapZones(edited(r, { fields: { zone: 'Befallen' } })).length, 1)
  for (const edit of [{ fields: { zone: 'Not A Zone' } }, { fields: { zone: '' } }, { fields: { zone: 7 } }, { fields: null }, { fields: 'zone' }, { name: 'X' }, {}]) {
    assert.deepEqual(gapMapZones(edited(r, edit)), base, JSON.stringify(edit))
  }
  // A row with no zone tally and a malformed edit is still no crash.
  assert.deepEqual(gapMapZones(edited(row('X', 'mob'), { fields: { zone: ['Befallen'] } })), [])
})

// ---- Copy wiki page with an edit on the row: the built review facts survive it (D1, D2, E3) ----

const MALFORMED: unknown[] = [{}, { name: '' }, { name: 42 }, { name: null }, { fields: { level: 7, zone: null } }, { fields: 'zone' }, { fields: null }, { kind: 'mob' }]
/** What Copy wiki page copies for a row: its page, then its edit written in (GapRowButtons). */
const copied = (r: GapRow, loot: readonly LootEvent[] = [], kills: KillMap = {}, seen: Parameters<typeof wikiPageText>[3] = {}): string => applyEditText(wikiPageText(r, loot, kills, seen), r)
const killsOf = (mob: string, count: number): KillMap => killIndex({ [mob]: { display: mob, count } } as unknown as KillMap)

test("E3: a renamed or re-zoned mob keeps its loot rates and MONEY DROPS, which are the log's name's; a malformed edit breaks nothing", () => {
  const kobold: GapRow = { ...row('a rabid kobold', 'mob'), kinds: ['killed'], details: { samples: [], zones: { distinct: 1, entries: [{ name: 'Qeynos Hills', n: 1 }] } } }
  const loot = [1, 2, 3].map((s) => ({ ts: s * 1000, item: 'Rabid Kobold Fang', source: 'a rabid kobold', zone: 'Qeynos Hills' }))
  const kills = killsOf('a rabid kobold', 12)
  const seen = { mobCoin: [{ mob: 'a rabid kobold', n: 4, min: [0, 0, 0, 1], max: [0, 2, 4, 9] }] }
  const fang = "<li> {{:Rabid Kobold Fang}} <span class='drare'>(Uncommon)</span> <span class='ddb'>[Overall: ~25%]</span> </li>"
  const money = '<li> 0 - 2 <span style="color:gold"><b>Golds</b></span></li>'
  const page = copied(edited(kobold, { name: 'A Rabid Kobold Pup', fields: { level: '3 - 5', zone: '[[Qeynos Hills]]' } }), loot, kills, seen)
  assert.match(page, /^\| name\s*= A Rabid Kobold Pup$/m)
  assert.match(page, /^\| level\s*= 3 - 5$/m)
  assert.ok(page.includes(fang) && page.includes(money), page)
  for (const edit of MALFORMED) {
    const text = copied(edited(kobold, edit), loot, kills, seen)
    assert.ok(text.includes(fang) && text.includes(money), JSON.stringify(edit))
  }
})

test('a stored edit is read with its non-text values dropped; the store is never rewritten', () => {
  assert.deepEqual(readEdit({ name: 'Grapok', fields: { level: '12', zone: 7, race: null }, kind: 'mob', distinct: true }), { name: 'Grapok', fields: { level: '12' }, kind: 'mob', distinct: true })
  for (const raw of [null, 'Grapok', 42, [], {}, { name: 5 }, { fields: ['a'] }, { kind: 'pet' }, { distinct: 'yes' }]) assert.equal(readEdit(raw), undefined, JSON.stringify(raw))
  // What the Edit button saves still reads back exactly.
  const saved = tidyEdit({ name: ' Grapok ', fields: { level: '12', zone: '' } })
  assert.deepEqual(readEdit(JSON.parse(JSON.stringify(saved))), saved)
})
