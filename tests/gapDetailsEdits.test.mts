// A Gaps row's details read a hand edit where one applies and never break on one (owner, 2026-10-25:
// "Just make sure that if a user changes the values it doesn't break anything"). Edits ride on the row
// (shared/gapEdits.ts `withGapEdits`, keyed by `doneKey`); these pin each detail against an edited,
// a blank and a malformed value. Fixtures only.
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { gapHeld, heldChipLabel, heldIndex, heldLine, heldTitle, joinHeld, onlyHeld } from '../src/shared/gapHeld'
import { heldPlain } from '../src/shared/gapHeldTier'
import { applyEditText, readEdit, tidyEdit, withGapEdits, type GapEdit } from '../src/shared/gapEdits'
import { wikiPageText } from '../src/shared/wikiPage'
import { dropGaps } from '../src/shared/gapDrops'
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

test('D1: an edited item name is written into itemname and the soldby ItemWhereTable stays; a malformed edit breaks nothing', () => {
  const grubs: GapRow = {
    ...row('Fishing Grubs'),
    kinds: ['bought'],
    details: { samples: [], sources: { distinct: 1, entries: [{ name: 'Dansie McVicker', n: 1 }] }, zones: { distinct: 1, entries: [{ name: 'Everfrost Peaks', n: 1 }] } }
  }
  const table = '{{ItemWhereTable|\n{{ItemWhereRow   | [[Everfrost Peaks]]               | [[Dansie McVicker]]           |               |  }}\n}}\n'
  const plain = copied(grubs)
  assert.ok(plain.includes(table), plain)
  const renamed = copied(edited(grubs, { name: 'Fishing Grubs (Live)' }))
  assert.match(renamed, /\|itemname = Fishing Grubs \(Live\)\n/)
  assert.ok(renamed.includes(table), renamed)
  for (const edit of MALFORMED) assert.ok((copied(edited(grubs, edit))).includes(table), JSON.stringify(edit))
})

test('D2: a group drop line keeps its rate whatever edit rides on the row (a Drops row takes none from the Edit button)', () => {
  const at = (ts: number, item: string): LootEvent => ({ ts, item, source: 'a gnoll', zone: 'Eastern Karana' })
  const [drop] = dropGaps([at(5000, 'Bronze Axe'), at(9000, 'Bronze Dagger +1')], [{ page: 'A gnoll', name: 'a gnoll', drops: [] }], { 'Bronze Weapons': ['Bronze Axe', 'Bronze Dagger'] })
  const kills = killsOf('a gnoll', 10)
  const line = "<li> [[Bronze Weapons]] <span class='drare'>(Rare)</span> <span class='ddb'>[Overall: ~20%]</span> </li>\n"
  assert.equal(copied(drop ?? assert.fail(), [], kills), line)
  for (const edit of [...MALFORMED, { name: 'Iron Weapons' }, { fields: { level: '12' } }]) assert.equal(copied(edited(drop ?? assert.fail(), edit), [], kills), line, JSON.stringify(edit))
})

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

// ---- the tier of a held copy (owner, 2026-10-25: "held by <playername> is useless if we need the +0 version") ----

test('held: a holder of only +N copies carries its tiers; a +0 copy, or an unknown tier, carries none', () => {
  const at = (tier: number | undefined, place: OwnershipRow['place'] = 'inventory'): OwnershipRow => ({ ...own('rat ear', place, 1), ...(tier === undefined ? {} : { tier, name: `Rat Ear +${String(tier)}` }) }) as OwnershipRow
  const dry = heldIndex({ entries: [['rat ear', [at(4)]]], loadedAt: EXPORTED }, {}, {}, 'Drywrought')
  const kal = heldIndex({ entries: [['rat ear', [at(2, 'bank'), at(3, 'bank')]]], loadedAt: EXPORTED }, {}, {}, 'Kaltinril')
  const both = gapHeld(row('Rat Ear'), joinHeld([dry, kal]))
  assert.equal(heldChipLabel(both), '+4 held by Drywrought, +2 held by Kaltinril')
  assert.equal(heldPlain(both), false, 'no +0 anywhere: the Update colour')
  assert.deepEqual(both.map(heldLine), ['Drywrought holds 1 (bags) at +4: not the +0 the page needs.', 'Also on Kaltinril: 2 (bank) at +2, +3.'])
  assert.ok(heldTitle(both).startsWith('Drywrought holds 1 (bags) at +4, per the inventory export'), heldTitle(both))
  // A +0 copy anywhere: green, as before, naming the holders of one.
  const val = heldIndex({ entries: [['rat ear', [at(undefined), at(4)]]], loadedAt: EXPORTED }, {}, {}, 'Valtari')
  const three = gapHeld(row('Rat Ear'), joinHeld([dry, val]))
  assert.equal(heldChipLabel(three), 'held by Valtari')
  assert.equal(heldPlain(three), true)
  assert.equal(heldLine(three[1] ?? assert.fail()), 'Also on Valtari: 2 (bags).')
  // One character, a +4 looted since the export (the loot line's own name), nothing else.
  const mine = heldIndex({ entries: [], loadedAt: EXPORTED }, { 'Rat Ear +4': 1 })
  assert.equal(heldChipLabel(gapHeld(row('Rat Ear'), mine)), '+4 held')
  assert.equal(heldLine(gapHeld(row('Rat Ear'), mine)[0] ?? assert.fail()), 'You hold 1 (bags) at +4: not the +0 the page needs.')
  // A +0 loot since the export makes it plain again; "I have it" keeps every tier either way.
  const plain = heldIndex({ entries: [['rat ear', [at(4)]]], loadedAt: EXPORTED }, { 'Rat Ear': 1 })
  assert.equal(heldChipLabel(gapHeld(row('Rat Ear'), plain)), 'held')
  assert.equal(onlyHeld([row('Rat Ear')], mine).length, 1, 'I have it stays any tier')
})
