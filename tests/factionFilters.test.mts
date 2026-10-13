// The work-panel filters (renderer/src/features/factions/factionFilters.ts) — the search's
// narrowing rule, pinned against the report that created it: searching "Pestilence Scythe"
// matched Gate Callers through one COST quest's turn-in, and the panel then showed the whole
// faction's list around it. A name-miss search must narrow every list to the quests that
// carried the match; a faction-name hit shows everything (the user's own rule, applied by
// factionDerive.deriveRows via the effective query).

import { test } from 'node:test'
import assert from 'node:assert/strict'
import { filterWork, questClassAbbrs, type WorkFilters } from '../src/renderer/src/features/factions/factionFilters'
import type { FactionWork } from '../src/renderer/src/features/factions/factionQuests'

const WORK: FactionWork = {
  raise: [
    {
      name: 'The Fisherman',
      page: 'The Fisherman',
      giver: 'Antus Shelbra',
      startZone: 'Paineel',
      items: ["Aglthin's Fishing Pole"],
      rewards: ['Staff of the Abattoir Initiate'],
      amount: 10
    },
    {
      name: 'Heretic Battle',
      page: 'Heretic Battle',
      giver: 'Markus Jaevins',
      startZone: 'Erudin Palace',
      items: ['Bones'],
      rewards: []
    },
    {
      name: 'Temple Donation',
      page: 'Temple Donation',
      giver: 'A Priest',
      startZone: 'Erudin Palace',
      items: [],
      rewards: [],
      coin: '2 gold'
    }
  ],
  lower: [
    {
      name: 'The Torrid Corruptor',
      page: 'The Torrid Corruptor',
      giver: 'Brother Hayle',
      startZone: 'Splitpaw Lair',
      items: ['SoulFire', 'Pestilence Scythe'],
      rewards: ['Torrid Corruptor'],
      amount: -100
    }
  ],
  homeZone: 'Erudin Palace',
  nearby: [
    {
      name: 'Clear Water Quest',
      page: 'Clear Water Quest',
      giver: 'Agryn Moonfield',
      startZone: 'Erudin Palace',
      items: [],
      rewards: []
    }
  ]
}

const NO_SLOTS = new Map<string, never[]>()
const f = (query: string, coinOnly = false, rewardsOnly = false): WorkFilters =>
  ({ classes: [], slot: 'ANY', coinOnly, rewardsOnly, query, cleanOnly: false, dontCare: new Set() })

test('a search that is not the faction name narrows EVERY list to the quests that carried it', () => {
  const scythe = filterWork(WORK, f('pestilence scythe'), NO_SLOTS)
  assert.deepEqual(scythe.raise, [], 'no raising quest carries the scythe')
  assert.deepEqual(scythe.nearby, [], 'no home-zone quest does either')
  assert.deepEqual(scythe.lower.map((q) => q.name), ['The Torrid Corruptor'], 'only the cost quest matched')
})

test('the search reaches quest names, givers, zones, turn-ins and rewards', () => {
  assert.deepEqual(filterWork(WORK, f('fisherman'), NO_SLOTS).raise.map((q) => q.name), ['The Fisherman'])
  assert.deepEqual(filterWork(WORK, f('markus'), NO_SLOTS).raise.map((q) => q.name), ['Heretic Battle'])
  assert.deepEqual(filterWork(WORK, f('abattoir'), NO_SLOTS).raise.map((q) => q.name), ['The Fisherman'])
  assert.deepEqual(filterWork(WORK, f('splitpaw'), NO_SLOTS).lower.map((q) => q.name), ['The Torrid Corruptor'])
  assert.deepEqual(filterWork(WORK, f('clear water'), NO_SLOTS).nearby.map((q) => q.name), ['Clear Water Quest'])
})

test('an empty query narrows nothing — the whole-faction view is the blank search', () => {
  const all = filterWork(WORK, f(''), NO_SLOTS)
  assert.equal(all.raise.length, 3)
  assert.equal(all.lower.length, 1)
  assert.equal(all.nearby.length, 1)
  assert.equal(all.homeZone, 'Erudin Palace')
})

test('gold-only keeps exactly the pure donation quests — coin stated, nothing to farm', () => {
  const gold = filterWork(WORK, f('', true), NO_SLOTS)
  assert.deepEqual(gold.raise.map((q) => q.name), ['Temple Donation'])
  assert.deepEqual(gold.lower, [], 'a cost quest with item turn-ins is not a donation')
  assert.deepEqual(gold.nearby, [])
})

test('the class reader stays inclusive on ambiguity (the measured wiki-prose rule)', () => {
  assert.deepEqual([...(questClassAbbrs(['Warrior', 'Shadowknight']) ?? [])].sort(), ['SHD', 'WAR'])
  assert.deepEqual([...(questClassAbbrs(['WAR PAL RNG SHD BRD ROG']) ?? [])].sort(), [
    'BRD',
    'PAL',
    'RNG',
    'ROG',
    'SHD',
    'WAR'
  ])
  assert.equal(questClassAbbrs(['All']), null, 'open by statement')
  assert.equal(questClassAbbrs(['All except INT casters']), null, 'open by unreadability')
  assert.equal(questClassAbbrs(undefined), null, 'open by absence')
})

test('rewards-only scopes the search to what a quest GRANTS - the chain-final-quest hunt', () => {
  // "soulfire" as a turn-in matches the cost quest in the plain scope…
  assert.deepEqual(filterWork(WORK, f('soulfire'), NO_SLOTS).lower.map((q) => q.name), ['The Torrid Corruptor'])
  // …and matches NOTHING rewards-only: no quest here grants a SoulFire.
  assert.deepEqual(filterWork(WORK, f('soulfire', false, true), NO_SLOTS).lower, [])
  // The quest that grants the Torrid Corruptor is exactly what rewards-only finds.
  assert.deepEqual(
    filterWork(WORK, f('torrid corruptor', false, true), NO_SLOTS).lower.map((q) => q.name),
    ['The Torrid Corruptor']
  )
})
