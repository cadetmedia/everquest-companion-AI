// lib/useMetInLog — the name lists the root feed hands `shared/metInLog.ts`, built from the served
// module snapshots. Pure halves only (the hook is four `useModule`s and one effect over these).
//
// Run: `npm test`.

import { test } from 'node:test'
import assert from 'node:assert/strict'
import type { ConsiderSnap, KillsSnap, LootSnap, ProgressionSnap } from '../src/shared/types'
import { metItemNames, metMobNames, metZoneNames } from '../src/renderer/src/lib/useMetInLog'

const KILLS = {
  v: 5,
  mobs: { 'a gnoll pup': { display: 'A gnoll pup' }, 'lord nagafen': { display: 'Lord Nagafen' } }
} as unknown as KillsSnap

const LOOT: LootSnap = [
  { ts: 1, item: 'Wasp Wing', source: 'a giant wasp drone', zone: 'Greater Faydark' },
  { ts: 2, item: 'Bone Chips' },
  { ts: 3, item: 'Ghoulbane +1', source: '' }
]

const CONSIDER = [
  { id: 'a fire beetle', mob: 'a fire beetle', zone: 'Misty Thicket' },
  { id: 'a bat', mob: 'a bat' }
] as unknown as ConsiderSnap

test('mobs: every mob killed, every corpse looted from, every mob conned', () => {
  assert.deepEqual(metMobNames(KILLS, LOOT, CONSIDER), [
    'A gnoll pup',
    'Lord Nagafen',
    'a giant wasp drone',
    'a fire beetle',
    'a bat'
  ])
})

test('items: every item looted', () => {
  assert.deepEqual(metItemNames(LOOT), ['Wasp Wing', 'Bone Chips', 'Ghoulbane +1'])
})

test('zones: the zone timeline, then the zone of every loot and con', () => {
  const prog = { zoneName: ['Lower Guk', 'Plane of Fear'] } as unknown as ProgressionSnap
  assert.deepEqual(metZoneNames(prog, LOOT, CONSIDER), [
    'Lower Guk',
    'Plane of Fear',
    'Greater Faydark',
    'Misty Thicket'
  ])
})

test('no state yet is no evidence, never a throw', () => {
  assert.deepEqual(metMobNames(null, null, null), [])
  assert.deepEqual(metItemNames(null), [])
  assert.deepEqual(metZoneNames(null, null, null), [])
})
