import { test } from 'node:test'
import assert from 'node:assert/strict'
import { castBySentence, withCastBy } from '../src/shared/spellCastBy'
import { spellPage } from '../src/shared/wikiPage'
import type { GapRow } from '../src/shared/gaps'

const spellRow = (casters: string[]): GapRow =>
  ({
    domain: 'spell',
    name: 'Throw Pool Ball',
    kinds: ['cast'],
    count: casters.length,
    first: '',
    last: '',
    details: { samples: [], casters: { distinct: casters.length, entries: casters.map((name, i) => ({ name, n: 10 - i })) } }
  }) as unknown as GapRow

const known = (name: string): boolean => name !== 'a nameless thing'

test('an NPC spell names its casters the way the wiki does, most-seen first (owner, 2026-10-25)', () => {
  assert.equal(castBySentence(spellRow(['The Game Master']), known), 'Cast by [[The Game Master]].')
  assert.equal(castBySentence(spellRow(['Trakanon', 'a nameless thing']), known), 'Cast by [[Trakanon]] and a nameless thing.', 'no page, no link')
  assert.equal(castBySentence(spellRow(['A', 'B', 'C', 'D', 'E', 'F', 'G']), known), 'Cast by [[A]], [[B]], [[C]], [[D]], [[E]] and others.')
  assert.equal(castBySentence(spellRow([]), known), undefined)
})

test('the casters follow what the description already says, or stand alone', () => {
  assert.equal(withCastBy('| description = Blinds you with terror.', 'Cast by [[Trakanon]].'), '| description = Blinds you with terror. Cast by [[Trakanon]].')
  assert.equal(withCastBy(undefined, 'Cast by [[Trakanon]].'), '| description = Cast by [[Trakanon]].')
  assert.equal(withCastBy('| description = Kept.', undefined), '| description = Kept.')
})

test('only an NPC-only page gets the line', () => {
  const castBy = 'Cast by [[The Game Master]].'
  assert.ok(spellPage({ name: 'Throw Pool Ball', npcOnly: true, castBy }).includes('| description = Cast by [[The Game Master]].'))
  assert.ok(!spellPage({ name: 'Spark', npcOnly: false, castBy }).includes('Cast by'))
})
