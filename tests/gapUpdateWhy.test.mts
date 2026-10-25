// Why an "Update page" row is an update (owner, 2026-10-25: "it would be nice to know WHY we have an
// update"): what the existing page lacks, in its chip's own words, for every update kind; none for a
// new page. Fixtures only.
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { updateWhy } from '../src/shared/gapUpdateWhy'
import { gapJob } from '../src/shared/gapJob'
import type { GapRow } from '../src/shared/gaps'

const row = (extra: Partial<GapRow>): GapRow => ({ domain: 'item', name: 'Rat Ear', kinds: ['looted'], count: 3, first: '', last: '', details: { samples: [] }, ...extra }) as GapRow
/** A faction, drop or image row, filed under its mob as the engine serves it (the mob is the source). */
const under = (domain: GapRow['domain'], what: string, mob: string, extra: Partial<GapRow> = {}): GapRow =>
  row({ domain, name: `${what} (${mob})`, details: { samples: [], sources: { distinct: 1, entries: [{ name: mob, n: 1 }] } }, ...extra })
const one = (r: GapRow, ctx = {}): string => {
  assert.equal(gapJob(r, ctx), 'update')
  const why = updateWhy(r, 'unchecked', ctx)
  assert.equal(why.length, 1, JSON.stringify(why))
  return why[0] ?? ''
}

test('a faction row: the page lacks the faction, or states another amount', () => {
  assert.equal(one(under('faction', 'Deathfist Orcs', 'a Deathfist templar')), 'The wiki page for a Deathfist templar does not list this faction.')
  const fix = one(under('faction', 'Da Bashers', 'A Troll Slayer', { fix: 'amount', adjust: -200 }))
  assert.ok(fix.startsWith('The wiki page for A Troll Slayer lists this faction as ') && fix.endsWith('; your log: (-200).'), fix)
})

test('a drop row: the mob page lacks the item, and the item page the mob', () => {
  assert.equal(one(under('drop', 'Gnoll Fang', 'a gnoll')), 'The wiki page for a gnoll does not list Gnoll Fang.')
  const both = updateWhy(under('drop', 'Wolf Pelt', 'a gnoll', { itemPage: 'lacksMob' } as Partial<GapRow>))
  assert.deepEqual(both, ['The wiki page for a gnoll does not list Wolf Pelt.', 'The page for Wolf Pelt does not name a gnoll under dropsfrom.'])
})

test('an image row: the picture to upload, and the imagefilename line', () => {
  assert.equal(one(under('image', 'npc_marda.png', 'Marda', { image: 'npc_marda.png' } as Partial<GapRow>)), 'Upload a screenshot as npc_marda.png; add an imagefilename line if the page has none.')
})

test('a notice row: the notice the log disproves', () => {
  const r = row({ domain: 'notice', name: 'a rotting citizen', page: 'A Rotting Citizen', notices: ['DNE'], subject: 'mob' } as Partial<GapRow>)
  assert.equal(one(r), 'The page carries {{DNE}} (not Legends), but your log met this mob 3 times: remove the notice and cite the lines.')
})

test('a redirect row: the redirect to check', () => {
  assert.ok(one(row({ name: 'Halfling Blood', viaRedirect: 'Vial of Halfling Blood' } as Partial<GapRow>)).startsWith('The wiki sends Halfling Blood to Vial of Halfling Blood.'))
})

test('a quest the wiki has a page for: what to add from the log', () => {
  assert.equal(one(row({ domain: 'quest', name: 'Call for Aid', page: 'Call for Aid' } as Partial<GapRow>)), 'The wiki has Call for Aid: add what it is missing from your log (Copy wiki page gives the rows).')
})

test('a merchant the catalog has as a mob: the merchant layout, under its edited name when it has one', () => {
  const ctx = { isMob: (n: string) => n === 'Klok Koglin' }
  const r = row({ domain: 'merchant', name: 'Klok Koglin' })
  assert.equal(one(r, ctx), 'The wiki has a page for Klok Koglin as a mob, not as a merchant: it lacks the merchant layout.')
  assert.ok(one({ ...r, edit: { name: 'Klok Koglin (Oggok)' } }, ctx).includes('Klok Koglin (Oggok) as a mob'))
})

test('a new-page row has no update reason, so the tag keeps its general tooltip', () => {
  for (const r of [row({}), row({ domain: 'mob', name: 'a giant snake' }), row({ domain: 'merchant', name: 'Nobody Known' }), row({ domain: 'quest', name: 'Lost Quest' })]) {
    assert.equal(gapJob(r, { isMob: () => false }), 'new')
    assert.deepEqual(updateWhy(r, 'unchecked', { isMob: () => false }), [])
  }
})
