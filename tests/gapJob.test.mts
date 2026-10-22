// What job a Gaps row is (owner, 2026-10-21: "a small update needed vs a missing item"): a new page
// where the wiki has none, an update where a page exists and lacks something. Fixtures only.
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { gapJob, gapShowOf, jobCaption, onlyJob } from '../src/shared/gapJob'
import type { GapDomain, GapRow, GapsSnap } from '../src/shared/gaps'

const row = (domain: GapDomain, name: string, zone?: string): GapRow => ({
  domain,
  name,
  kinds: ['looted'],
  count: 1,
  first: '',
  last: '',
  details: { samples: [], ...(zone === undefined ? {} : { zones: { distinct: 1, entries: [{ name: zone, n: 1 }] } }) }
})
const isMob = (name: string): boolean => name === 'Klok Koglin'

test('a name the wiki has no page for is a new page; a line for a page that exists is an update', () => {
  for (const d of ['item', 'mob', 'spell'] as const) assert.equal(gapJob(row(d, 'x')), 'new', d)
  for (const d of ['faction', 'drop', 'image'] as const) assert.equal(gapJob(row(d, 'x (a gnoll)')), 'update', d)
  // A faction row whose mob the data lacks stays an update: the mob's own row is the new page.
  assert.equal(gapJob({ ...row('faction', 'Da Bashers (a troll)'), noPage: true }), 'update')
  // A trader the catalog has as a mob: its page exists and lacks only the merchant layout.
  assert.equal(gapJob(row('merchant', 'Klok Koglin'), { isMob }), 'update')
  assert.equal(gapJob(row('merchant', 'Elder Jantiz'), { isMob }), 'new')
  assert.equal(gapJob(row('merchant', 'Klok Koglin')), 'new', 'no catalog test: a new page')
})

test('Show keeps one job, All keeps the same rows; an unreadable stored choice is All', () => {
  const rows = [row('merchant', 'Klok Koglin'), row('merchant', 'Elder Jantiz'), row('drop', 'Rat Ear (a rat)')]
  assert.equal(onlyJob(rows, 'all', { isMob }), rows)
  assert.deepEqual(onlyJob(rows, 'new', { isMob }).map((r) => r.name), ['Elder Jantiz'])
  assert.deepEqual(onlyJob(rows, 'update', { isMob }).map((r) => r.name), ['Klok Koglin', 'Rat Ear (a rat)'])
  assert.equal(gapShowOf(null), 'all')
  assert.equal(gapShowOf('update'), 'update')
  assert.equal(gapShowOf('nonsense'), 'all')
})

test('the toggle caption splits a domain that holds both jobs, hidden rows left out; one job keeps "N unknown"', () => {
  const rows = [row('merchant', 'Klok Koglin', 'Oggok'), row('merchant', 'Elder Jantiz', 'Oggok'), row('merchant', 'Bob', 'Befallen'), row('drop', 'Rat Ear (a rat)')]
  // The engine counts 7 merchants and serves 3 of them: 6 missing, 1 to update.
  const snap: GapsSnap = { rows, totals: { item: 4, mob: 0, spell: 0, merchant: 7, faction: 0, drop: 1, image: 0 }, seen: { item: 0, mob: 0, spell: 0, merchant: 0, faction: 0, drop: 0, image: 0 } }
  const none = (): boolean => false
  assert.equal(jobCaption(snap, 'merchant', { zone: null, hidden: none }, { isMob }), '6 missing · 1 to update')
  assert.equal(jobCaption(snap, 'merchant', { zone: 'Oggok', hidden: none }, { isMob }), '1 missing here · 1 to update')
  assert.equal(jobCaption(snap, 'merchant', { zone: null, hidden: (r) => r.name === 'Bob' }, { isMob }), '5 missing · 1 to update')
  // No update among them, or a domain of updates alone: the plain count.
  assert.equal(jobCaption(snap, 'merchant', { zone: null, hidden: none }), '7 unknown')
  assert.equal(jobCaption(snap, 'drop', { zone: null, hidden: none }, { isMob }), '1 unknown')
  assert.equal(jobCaption(snap, 'item', { zone: null, hidden: none }, { isMob }), '4 unknown')
})
