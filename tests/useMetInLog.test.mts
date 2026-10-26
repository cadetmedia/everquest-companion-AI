// lib/useMetInLog — the name lists the root feed hands `shared/metInLog.ts`, built from the served
// module snapshots, and the feeder that folds them only when a source moved. Pure halves only (the
// hook is four `useModule`s and one effect over the feeder).
//
// Run: `npm test`.

import { test } from 'node:test'
import assert from 'node:assert/strict'
import type { ConsiderSnap, KillsSnap, LootSnap, ProgressionSnap } from '../src/shared/types'
import {
  createMetFeed,
  metItemNames,
  metMobNames,
  metZoneNames,
  sameNames,
  type MetSources
} from '../src/renderer/src/lib/useMetInLog'
import { metVersion, setMet, wasMet, type MetKind } from '../src/shared/metInLog'

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

// ---- the feeder: a kind re-folds only when a source it reads moved (re-measure 2026-10-26) ----

const prog = (zoneName: string[], lastTs = 0): ProgressionSnap => ({ zoneName, lastTs }) as unknown as ProgressionSnap
const NONE: MetSources = { kills: null, loot: null, consider: null, progression: null }

function clearAll(): void {
  setMet('mobs', [])
  setMet('items', [])
  setMet('zones', [])
}

/** A feeder over a counting `setMet`: which kinds each push folded. */
function countingFeed(): { feed: (s: MetSources) => boolean; folds: MetKind[] } {
  const folds: MetKind[] = []
  const feed = createMetFeed((kind, names) => {
    folds.push(kind)
    setMet(kind, names)
  })
  return { feed, folds }
}

test('sameNames: same order and length only', () => {
  assert.equal(sameNames(['a', 'b'], ['a', 'b']), true)
  assert.equal(sameNames([], []), true)
  assert.equal(sameNames(['a', 'b'], ['a', 'b', 'c']), false)
  assert.equal(sameNames(['a', 'x', 'c'], ['a', 'y', 'c']), false, 'a middle change with the same ends')
})

test('a progression push that moved only its timestamps folds nothing', () => {
  const { feed, folds } = countingFeed()
  try {
    const s0: MetSources = { kills: KILLS, loot: LOOT, consider: CONSIDER, progression: prog(['Lower Guk'], 1) }
    feed(s0)
    assert.deepEqual(folds, ['mobs', 'items', 'zones'], 'the first push folds every kind')
    folds.length = 0
    for (let t = 2; t < 10; t++) assert.equal(feed({ ...s0, progression: prog(['Lower Guk'], t) }), false)
    assert.deepEqual(folds, [], 'a new snapshot with the same zone timeline is no new evidence')
    feed({ ...s0, kills: { ...KILLS }, progression: prog(['Lower Guk'], 11) })
    assert.deepEqual(folds, ['mobs'], 'a kill re-folds the mobs alone')
  } finally {
    clearAll()
  }
})

test('the skip never misses a new zone, mob or item', () => {
  const { feed } = countingFeed()
  try {
    const s0: MetSources = { ...NONE, progression: prog(['Lower Guk', 'Plane of Fear']) }
    feed(s0)
    assert.equal(feed({ ...s0, progression: prog(['Lower Guk', 'Plane of Fear', "Sleeper's Tomb"]) }), true)
    assert.equal(wasMet('zones', "Sleeper's Tomb"), true, 'an appended zone')
    assert.equal(feed({ ...s0, progression: prog(['Plane of Fear', "Sleeper's Tomb", 'Kael Drakkel']) }), true)
    assert.equal(wasMet('zones', 'Kael Drakkel'), true, 'the capped ring: oldest dropped, newest added, same length')
    assert.equal(wasMet('zones', 'Lower Guk'), false, 'and the dropped zone ages out, as before')
    assert.equal(feed({ ...s0, progression: prog(['Plane of Fear', 'Upper Guk', 'Kael Drakkel']) }), true)
    assert.equal(wasMet('zones', 'Upper Guk'), true, 'a middle change with the same length and ends')
    const s1: MetSources = { ...NONE, kills: KILLS }
    feed(s1)
    assert.equal(wasMet('mobs', 'lord nagafen'), true, 'a kill')
    feed({ ...s1, loot: LOOT })
    assert.equal(wasMet('items', 'wasp wing'), true, 'a loot item')
    assert.equal(wasMet('zones', 'Greater Faydark'), true, 'a loot zone')
    feed({ ...s1, loot: LOOT, consider: CONSIDER })
    assert.equal(wasMet('mobs', 'a fire beetle'), true, 'a con')
    assert.equal(wasMet('zones', 'Misty Thicket'), true, 'a con zone')
    feed(NONE)
    assert.equal(wasMet('mobs', 'lord nagafen') || wasMet('zones', 'Misty Thicket'), false, 'a character switch empties it')
  } finally {
    clearAll()
  }
})

const ZONES = ['Lower Guk', 'Plane of Fear', "Sleeper's Tomb", 'Kael Drakkel', 'Greater Faydark', 'Misty Thicket']
const MOBS = ['a gnoll pup', 'Lord Nagafen', 'a fire beetle', 'A revamp fiend', 'an elemental capturer (14)', 'a black wolf']
const ITEMS = ['Wasp Wing', 'Bone Chips', 'Ghoulbane +1', 'A Test Warder Blade +2']

/** Every name of the walk's universe the store holds, per kind: the evidence as a string. */
function held(): string {
  const universe = { mobs: MOBS, items: ITEMS, zones: ZONES }
  return (['mobs', 'items', 'zones'] as const)
    .map((k) => universe[k].map((n) => (wasMet(k, n) ? n : '-')).join('|'))
    .join(' / ')
}

/** One random push: mostly timestamp-only progression, then zones (ring of 4), kills, loot, cons, a
 *  switch. Each source has a name only it gives, so a source the feeder forgot shows. */
function walkStep(s: MetSources, rand: (n: number) => number, step: number): MetSources {
  const pick = <T>(xs: readonly T[]): T => xs[rand(xs.length)]
  const zones = s.progression?.zoneName ?? []
  const r = rand(10)
  if (r < 4) return { ...s, progression: prog([...zones], step) }
  if (r === 4) return { ...s, progression: prog([...zones, pick(ZONES.slice(0, 4))].slice(-4), step) }
  if (r === 5) return { ...s, kills: { v: 5, mobs: { [String(step)]: { display: pick(MOBS.slice(0, 2)) } } } as unknown as KillsSnap }
  if (r === 6) {
    const row = { ts: step, item: pick(ITEMS), source: pick(MOBS.slice(1, 4)), zone: pick(ZONES.slice(2, 5)) }
    return { ...s, loot: [...(s.loot ?? []), row].slice(-5) }
  }
  if (r === 7) return { ...s, consider: [{ id: 'x', mob: pick(MOBS.slice(3)), zone: pick([ZONES[3], ZONES[5]]) }] as unknown as ConsiderSnap }
  return r === 8 && rand(4) === 0 ? NONE : s
}

test('evidence parity: the feeder holds what a fold of every kind on every push holds', () => {
  let seed = 7 // mulberry32: a seeded walk, the same every run
  const rand = (n: number): number => {
    seed = (seed + 0x6d2b79f5) | 0
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed)
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t
    return Math.floor((((t ^ (t >>> 14)) >>> 0) / 4294967296) * n)
  }
  const { feed, folds } = countingFeed()
  let s: MetSources = NONE
  try {
    for (let step = 0; step < 2000; step++) {
      s = walkStep(s, rand, step)
      const before = metVersion()
      const said = feed(s)
      const fed = held()
      assert.equal(said, metVersion() !== before, `step ${step}: a move is reported exactly when one happened`)
      setMet('mobs', metMobNames(s.kills, s.loot, s.consider))
      setMet('items', metItemNames(s.loot))
      setMet('zones', metZoneNames(s.progression, s.loot, s.consider))
      assert.equal(fed, held(), `step ${step}: the feeder's evidence matches the full fold`)
    }
    assert.ok(folds.length < 3 * 2000 * 0.75, `the walk skipped folds (${String(folds.length)} of ${String(3 * 2000)})`)
  } finally {
    clearAll()
  }
})
