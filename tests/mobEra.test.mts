// Unit tests for src/shared/mobEra.ts: a mob is out of era exactly when the data build flagged it
// (`outOfEra: true`); its raw banner decides nothing here. Synthetic fixtures.

import test from 'node:test'
import assert from 'node:assert/strict'
import type { MobEntry } from '../src/shared/mobTypes'
import { mobOutOfEra } from '../src/shared/mobEra'

test('a mob flagged outOfEra is out; an unflagged one is in, whatever its banner', () => {
  const tagged = (eraTag: string, outOfEra?: true): Pick<MobEntry, 'eraTag' | 'outOfEra'> =>
    outOfEra === undefined ? { eraTag } : { eraTag, outOfEra }
  assert.equal(mobOutOfEra(tagged('FearHateRevamp', true)), true)
  assert.equal(mobOutOfEra(tagged('Classic')), false)
  assert.equal(mobOutOfEra(tagged('Hate')), false)
  assert.equal(mobOutOfEra(tagged('Velious')), false, 'a banner alone hides nothing (a cave bat)')
  assert.equal(mobOutOfEra({}), false, 'no flag is in era')
})
