// shared/gapEdits.ts: a Gaps row corrected by hand (owner, 2026-10-23: "Perhaps we should be able to
// EDIT values in the gaps tab?") shows and copies the corrections, keyed as the Done marks are.

import { test } from 'node:test'
import assert from 'node:assert/strict'
import { applyEditText, shownName, shownRow, tidyEdit, withGapEdits } from '../src/shared/gapEdits'
import type { GapRow } from '../src/shared/gaps'

const row = (domain: GapRow['domain'], name: string, extra: Partial<GapRow> = {}): GapRow =>
  ({ domain, name, kinds: ['killed'], count: 1, first: '', last: '', details: {}, ...extra }) as GapRow

const MOB_PAGE = [
  '{{Namedmobpage',
  '| imagefilename     = npc_a_fragile.png',
  '| name              = a fragile',
  '| race              = ',
  '| level             = 1',
  '| zone              = [[Tutorial Zone]]',
  '}}'
].join('\n')

test('an edit rides on its row by the Done key, and This is an NPC clears may be a player', () => {
  const rows = [row('mob', 'Doug', { maybePlayer: true }), row('mob', 'a fragile')]
  const out = withGapEdits(rows, { 'mob:Doug': { kind: 'mob' }, 'mob:a fragile': { name: 'a fragile pet' } })
  assert.equal(out[0]?.maybePlayer, false)
  assert.equal(shownName(out[1] as GapRow), 'a fragile pet')
  assert.equal(shownRow(out[1] as GapRow).name, 'a fragile pet')
  assert.equal(out[1]?.name === 'a fragile' && out[1]?.edit?.name, 'a fragile pet', 'the log name stays the key')
  assert.strictEqual(withGapEdits(rows, {}), rows, 'no edits: the same rows')
})

test('blank values are dropped, and an edit with nothing left is none', () => {
  assert.deepEqual(tidyEdit({ name: '  ', fields: { level: ' 3 ', race: '' } }), { fields: { level: '3' } })
  assert.equal(tidyEdit({ name: '', fields: { race: ' ' } }), null)
})

test('Copy writes a mob edit into the template, the picture renamed with it', () => {
  const r = { ...row('mob', 'a fragile'), edit: { name: 'a fragile pet', fields: { race: 'Skeleton', level: '2' } } }
  const out = applyEditText(MOB_PAGE, r)
  assert.ok(out.includes('| name              = a fragile pet'), out)
  assert.ok(out.includes('| imagefilename     = npc_a_fragile_pet.png'), out)
  assert.ok(out.includes('| race              = Skeleton'), out)
  assert.ok(out.includes('| level             = 2'), out)
  assert.ok(out.includes('| zone              = [[Tutorial Zone]]'), 'an unedited field stays')
  assert.equal(applyEditText(MOB_PAGE, row('mob', 'a fragile')), MOB_PAGE, 'no edit, no change')
})

test('Copy writes a quest edit into the top table, Start Zone being Starts In', () => {
  const page = "{| class=\"questTopTable\"\n! ''' Start Zone: '''\n| ?\n|-\n! ''' Minimum Level: '''\n| ?\n|}"
  const r = { ...row('quest', 'Doug errands'), edit: { fields: { 'Starts In': '[[Tutorial Zone]]', 'Minimum Level': '1' } } }
  const out = applyEditText(page, r)
  assert.ok(out.includes("! ''' Start Zone: '''\n| [[Tutorial Zone]]"), out)
  assert.ok(out.includes("! ''' Minimum Level: '''\n| 1"), out)
  assert.equal(out.split('\n').length, page.split('\n').length, 'lines kept, so the dialog highlights stay')
})

test('an item edit renames itemname', () => {
  const r = { ...row('item', 'Fragile Pets Skull'), edit: { name: "Fragile Pet's Skull" } }
  assert.equal(applyEditText('| itemname = Fragile Pets Skull', r), "| itemname = Fragile Pet's Skull")
})

test('Not a misspelling drops the near-name guess, so the row is a page of its own, not a redirect (owner, 2026-10-24)', () => {
  const shoes = row('item', 'Pyrosilk Lined Shoes', { suggest: { name: 'Cryosilk Lined Shoes', page: 'Cryosilk Lined Shoes', distance: 2 } } as Partial<GapRow>)
  const [out] = withGapEdits([shoes], { 'item:Pyrosilk Lined Shoes': { distinct: true } })
  assert.equal(out?.suggest, undefined)
  assert.equal(out?.edit?.distinct, true)
  assert.deepEqual(tidyEdit({ distinct: true }), { distinct: true }, 'the mark alone is an edit')
  assert.equal(withGapEdits([shoes], {})[0]?.suggest?.name, 'Cryosilk Lined Shoes', 'unmarked keeps the guess')
})

test('a spell row takes a name edit: its spellname (owner, 2026-10-24)', async () => {
  const { editable } = await import('../src/shared/gapEdits')
  const r = { ...row('spell', 'Supemova'), edit: { name: 'Supernova' } }
  assert.ok(editable(r))
  assert.equal(applyEditText('| spellname = Supemova', r), '| spellname = Supernova')
})
