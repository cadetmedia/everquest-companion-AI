// An immunity is not a resist (owner, 2026-10-28). The fold side is pinned in the engine
// (`engine/crates/fold/src/modules/resist/immunity_tests.rs`); this is the app side: the sentence
// list the TypeScript copy keeps, the merge, the estimate that must not read the count, and the
// profile's separate list.

import test from 'node:test'
import assert from 'node:assert/strict'
import { isImmunitySentence, messageTextOf } from '../src/shared/resistImmunity'
import { estimate } from '../src/shared/resistModel'
import { repoolAtWeek } from '../src/main/resist/ledger'
import { immuneSpells } from '../src/main/resist/profile'
import { LANDS_ELSEWHERE, SPELLS, blank } from './resistFixtures.mts'

test('the client immunity sentences are recognised and the two portion sentences are not', () => {
  for (const yes of [
    'Your target is immune to root spells.',
    'Your target is immune to snare spells.',
    'Your target is immune to changes in its attack speed.',
    'Your target cannot be mesmerized (with this spell).',
    'This NPC cannot be charmed.',
    'A kobold noble is immune to gravitate spells.',
  ]) {
    assert.ok(isImmunitySentence(yes), yes)
  }
  // The stun portion is followed by the spell LANDING (tests/fixtures/e2e-combat.log, Discordant Mind).
  assert.ok(!isImmunitySentence('Your target is immune to the stun portion of this effect.'))
  assert.ok(!isImmunitySentence('Your target is immune to the memory blur portion of this effect.'))
  assert.equal(
    messageTextOf('[Sat Oct 24 02:16:44 2026] Your target is immune to root spells.'),
    'Your target is immune to root spells.'
  )
})

test('an immune count never moves the estimate', () => {
  const resists = blank({ spellKey: 'test hold', family: 'cast', resist: 4, land: 6 })
  const opts = { axis: 'magic' as const, mobLevel: 50, unobservable: LANDS_ELSEWHERE }
  const plain = estimate([resists], SPELLS, opts)
  const withImmune = estimate([{ ...resists, immune: 40 }], SPELLS, opts)
  assert.equal(withImmune.R, plain.R)
  assert.equal(withImmune.n, plain.n)
  // A row the game only ever answered with immunity says nothing about the axis at all.
  const onlyImmune = estimate([blank({ spellKey: 'test hold', family: 'cast', immune: 12 })], SPELLS, opts)
  assert.equal(onlyImmune.n, 0)
})

test('re-pooling a row keeps its immune count', () => {
  const a = blank({ spellKey: 'test hold', family: 'cast', resist: 1, immune: 2, week: '2026-W40' })
  const b = blank({ spellKey: 'test hold', family: 'cast', resist: 1, immune: 3, week: '2026-W41' })
  const [merged] = repoolAtWeek([a, b], '2026-W43')
  assert.equal(merged.resist, 2)
  assert.equal(merged.immune, 5)
})

test('the profile lists each immune spell once, sorted, and only where the count is above zero', () => {
  const rows = [
    blank({ spellKey: 'snare', family: 'cast', immune: 2 }),
    blank({ spellKey: 'beguile', family: 'cast', immune: 1, week: '2026-W40' }),
    blank({ spellKey: 'beguile', family: 'cast', immune: 4, week: '2026-W41' }),
    blank({ spellKey: 'test hold', family: 'cast', resist: 9 }),
  ]
  assert.deepEqual(immuneSpells(rows), ['beguile', 'snare'])
})
