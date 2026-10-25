// shared/iconTokenCleanup.ts: the `1 <name>` data a robe's icon read as `1` left behind moves to the
// real name once (owner, 2026-10-24: "can you clean up my bad data for the 1's?").

import { test } from 'node:test'
import assert from 'node:assert/strict'
import { cleanCaptured, cleanEdits, cleanShots } from '../src/shared/iconTokenCleanup'

test('a 1 <name> reading moves onto <name>: a +0 window wins over a +N one, else the newer', () => {
  const shots = {
    "Jenni's Robe": { statsblock: 'plus four', tier: 4, at: '2026-10-23T23:49:00Z' },
    "1 Jenni's Robe": { statsblock: 'tier zero', at: '2026-10-24T19:56:00Z' },
    "1 Alexa's Robe": { statsblock: 'only one', at: '2026-10-24T19:53:00Z' },
    "Deirdre's Robe": { statsblock: 'newer zero', at: '2026-10-24T20:00:00Z' },
    "1 Deirdre's Robe": { statsblock: 'older zero', at: '2026-10-24T17:56:00Z' },
    '5 Dose Potion of Cold': { statsblock: 'its own', at: '2026-10-01T00:00:00Z' }
  }
  const out = cleanShots(shots)
  assert.deepEqual(Object.keys(out).sort(), ["Alexa's Robe", "Deirdre's Robe", "Jenni's Robe", '5 Dose Potion of Cold'].sort())
  assert.equal(out["Jenni's Robe"]?.statsblock, 'tier zero')
  assert.equal(out["Alexa's Robe"]?.statsblock, 'only one')
  assert.equal(out["Deirdre's Robe"]?.statsblock, 'newer zero')
})

test('a 1 <name> captured item is <name>, once, at its newest time', () => {
  const out = cleanCaptured([
    { name: "1 Crysta's Robe", at: '2026-10-23T23:49:12Z' },
    { name: "Crysta's Robe", at: '2026-10-24T01:00:00Z' },
    { name: 'Pet Illusion: Gelatinous Cube', at: '2026-10-23T21:55:00Z' }
  ])
  assert.deepEqual(out, [
    { name: "Crysta's Robe", at: '2026-10-24T01:00:00Z' },
    { name: 'Pet Illusion: Gelatinous Cube', at: '2026-10-23T21:55:00Z' }
  ])
})

test('an edit that only renamed a 1 <name> row to <name> goes; one with more moves to <name>', () => {
  const out = cleanEdits({
    drywrought: {
      "item:1 Deirdre's Robe": { name: "Deirdre's Robe" },
      "item:1 Sheila's Robe": { name: "Sheila's Robe", distinct: true },
      'mob:a fragile': { name: 'a fragile pet' }
    }
  })
  assert.deepEqual(out, { drywrought: { "item:Sheila's Robe": { distinct: true }, 'mob:a fragile': { name: 'a fragile pet' } } })
})
