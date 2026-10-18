// metInLog — what the player's own log met (owner ruling, 2026-10-17: the log outranks an era
// banner). Pins the evidence store's set/version semantics and the one mob predicate that reads it
// (`shared/mobEra.ts mobOutOfEra`), the zone table (`zoneEra`) and the item verdict (`donorEra`). Every test empties what it filled, so the suite's other tests
// see the wiki's verdicts only.
//
// Run: `npm test`.

import { test } from 'node:test'
import assert from 'node:assert/strict'
import { metVersion, setMet, wasMet } from '../src/shared/metInLog'
import { mobOutOfEra } from '../src/shared/mobEra'
import { CURRENT_ERA, eraVerdict, withoutOutOfEraMobs, zoneEra } from '../src/shared/planner/era'
import { donorEra, eraHides, type EraSubject } from '../src/renderer/src/features/planner/plannerData'

function clearAll(): void {
  setMet('mobs', [])
  setMet('items', [])
  setMet('zones', [])
}

test('setMet replaces a kind, and the version moves only on a real change', () => {
  try {
    const v0 = metVersion()
    setMet('mobs', ['A Gnoll Pup', 'a gnoll pup'])
    const v1 = metVersion()
    assert.ok(v1 > v0, 'new evidence moves the version')
    assert.equal(wasMet('mobs', 'a gnoll pup'), true)
    setMet('mobs', ['a gnoll pup'])
    assert.equal(metVersion(), v1, 'the same set again is no change')
    setMet('mobs', ['a fire beetle'])
    assert.ok(metVersion() > v1, 'a different set is a change')
    assert.equal(wasMet('mobs', 'a gnoll pup'), false, 'a set REPLACES the kind, it does not add')
    assert.equal(wasMet('items', 'a fire beetle'), false, 'kinds are separate')
  } finally {
    clearAll()
  }
})

test('each kind folds its own way: a mob by mobKey, a zone by zoneKey, an item without its +N tier', () => {
  try {
    setMet('mobs', ['An elemental capturer (14)'])
    setMet('items', ['Ghoulbane +2'])
    setMet('zones', ['Lower Guk'])
    assert.equal(wasMet('mobs', 'an elemental capturer'), true)
    assert.equal(wasMet('items', 'ghoulbane'), true)
    assert.equal(wasMet('items', 'Ghoulbane +1'), true)
    assert.equal(wasMet('zones', 'LOWER GUK'), true)
    assert.equal(wasMet('zones', 'Upper Guk'), false)
  } finally {
    clearAll()
  }
})

test('mobOutOfEra: a flagged mob the log met is in era; by its name or by its page', () => {
  const fiend = { name: 'a revamp fiend', page: 'A revamp fiend (Plane of Fear)', outOfEra: true as const }
  try {
    assert.equal(mobOutOfEra(fiend), true, 'the wiki flag decides while the log is silent')
    setMet('mobs', ['A revamp fiend'])
    assert.equal(mobOutOfEra(fiend), false, 'the log met it, so it is in era for this player')
    setMet('mobs', ['A revamp fiend (Plane of Fear)'])
    assert.equal(mobOutOfEra(fiend), false, 'the page spelling counts too')
    assert.deepEqual(withoutOutOfEraMobs([fiend]), [fiend], 'and the roster keeps it')
    setMet('mobs', [])
    assert.equal(mobOutOfEra(fiend), true, 'evidence gone, the flag speaks again')
    assert.equal(mobOutOfEra({ name: 'a plain rat' }), false, 'no flag is in era, met or not')
  } finally {
    clearAll()
  }
})

test('zoneEra: a zone the log entered is the current era, whatever the zone table says', () => {
  try {
    assert.equal(zoneEra("Sleeper's Tomb"), 'velious')
    assert.equal(eraVerdict(["Sleeper's Tomb"]), 'out-of-era')
    setMet('zones', ["Sleeper's Tomb"])
    assert.equal(zoneEra("Sleeper's Tomb"), CURRENT_ERA)
    assert.equal(zoneEra("SLEEPER'S TOMB"), CURRENT_ERA, 'joined by zoneKey')
    assert.equal(eraVerdict(["Sleeper's Tomb"]), 'in-era')
    assert.equal(zoneEra('Kael Drakkel'), 'velious', 'only the zone the log met')
  } finally {
    clearAll()
  }
})

test('donorEra: an item the log looted is in era, over every wiki layer, and the cache sees it', () => {
  // A Velious drop by its only zone, and a revamp-bannered one: both out of era on the wiki.
  const tomb: EraSubject = { key: 'a test warder blade', zones: ["Sleeper's Tomb"] }
  const revamp: EraSubject = { key: 'a test revamp choker', eraTag: 'FearHateRevamp', zones: ['Plane of Fear'] }
  try {
    assert.equal(donorEra(tomb).verdict, 'out-of-era')
    assert.equal(donorEra(revamp).verdict, 'out-of-era')
    setMet('items', ['A Test Warder Blade +2', 'a test revamp choker'])
    assert.equal(donorEra(tomb).verdict, 'in-era', 'looted, so in era: the cached out-of-era answer is gone')
    assert.equal(donorEra(tomb).by, 'log')
    assert.equal(donorEra(revamp).verdict, 'in-era', 'the log outranks even a no-expansion banner')
    assert.equal(eraHides(tomb, true), false)
    setMet('items', [])
    assert.equal(donorEra(tomb).verdict, 'out-of-era', 'evidence gone, the wiki speaks again')
  } finally {
    clearAll()
  }
})
