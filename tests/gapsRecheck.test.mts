// Another character's saved Gaps rows are re-checked against today's data (owner, 2026-10-20:
// "Bull Alligator Tooth" stayed under Items after the delta scrape gave it a page).
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { withoutNowKnown, type KnownNow } from '../src/shared/gapsRecheck'

const known: KnownNow = (domain, name) => (domain === 'item' && name === 'Bull Alligator Tooth') || (domain === 'mob' && name === 'a bull alligator')

test('a saved row today\'s data now knows is dropped, and its domain\'s total lowered', () => {
  const saved = {
    rows: [
      { domain: 'item', name: 'Bull Alligator Tooth' },
      { domain: 'item', name: 'Pristine Lizard Talon' },
      { domain: 'mob', name: 'a bull alligator' },
      { domain: 'spell', name: 'Summon Holy Steed Bridle' }
    ],
    totals: { item: 2, mob: 1, spell: 1 },
    killFactions: []
  }
  const out = withoutNowKnown(saved, known) as typeof saved
  assert.deepEqual(out.rows.map((r) => r.name), ['Pristine Lizard Talon', 'Summon Holy Steed Bridle'])
  assert.deepEqual(out.totals, { item: 1, mob: 0, spell: 1 })
  assert.equal(out.killFactions, saved.killFactions, 'everything else is kept as saved')
  assert.equal(saved.rows.length, 4, 'the saved snapshot itself is not touched')
})

test('a domain this cannot check, and anything not the snapshot shape, are handed back as they are', () => {
  const allKnown: KnownNow = () => true
  const spellsOnly = { rows: [{ domain: 'spell', name: 'X' }], totals: { spell: 1 } }
  assert.equal(withoutNowKnown(spellsOnly, allKnown), spellsOnly)
  assert.equal(withoutNowKnown(null, allKnown), null)
  assert.equal(withoutNowKnown({ rows: 'nope' }, allKnown) instanceof Object, true)
})
