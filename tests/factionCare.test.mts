// THE DON'T-CARE READING behind the Factions tab's "No loss I care about" switch
// (renderer/src/features/factions/factionCare.ts + factionFilters.filterWork): a quest is clean
// when every loss its page states lands on a faction the player marked don't-care. Real catalog
// where the claim is about the catalog (the owner's Miners Guild 628 question, 2026-10-12).

import { test } from 'node:test'
import assert from 'node:assert/strict'
import { buildFactionWorkIndex, raisedKeysOf } from '../src/renderer/src/features/factions/factionQuests'
import { caredLosses, isCleanQuest } from '../src/renderer/src/features/factions/factionCare'
import { filterWork, type WorkFilters } from '../src/renderer/src/features/factions/factionFilters'
import questsJson from '../src/renderer/src/data/eqlegends/quests.json'
import { factionNameKey } from '../src/shared/outputs/factions'
import type { QuestData, QuestEntry } from '../src/shared/types'

const CATALOG = (questsJson as QuestData).quests
const NO_SLOTS = new Map<string, never[]>()
const clean = (dontCare: Iterable<string>): WorkFilters => ({
  classes: [],
  slot: 'ANY',
  coinOnly: false,
  query: '',
  rewardsOnly: false,
  cleanOnly: true,
  dontCare: new Set([...dontCare].map(factionNameKey))
})

const QUESTS: QuestEntry[] = [
  {
    name: 'Rat Run',
    page: 'Rat Run',
    startZone: 'North Kaladim',
    factions: [
      { name: 'Butcherblock Bandits', up: false },
      { name: 'Miners Guild 628', up: true, amount: 5 },
      { name: 'Hall of the Ebon Mask', up: false, amount: -1 }
    ]
  },
  {
    name: 'Gnome Snatch',
    page: 'Gnome Snatch',
    startZone: 'North Kaladim',
    factions: [
      { name: 'Miners Guild 628', up: true, amount: 5 },
      { name: 'Clockworks of Ak`Anon', up: false, amount: -5 }
    ]
  },
  { name: 'Unstated', page: 'Unstated', startZone: 'North Kaladim' }
]

test('every quest carries its whole receipt, raises first, keyed for the marks', () => {
  const work = buildFactionWorkIndex(QUESTS).get(factionNameKey('Miners Guild 628'))
  const rat = work?.raise.find((q) => q.name === 'Rat Run')
  assert.deepEqual(
    rat?.hits.map((h) => `${h.up ? '+' : '-'}${h.name}`),
    ['+Miners Guild 628', '-Butcherblock Bandits', '-Hall of the Ebon Mask']
  )
  assert.equal(rat?.hits[2]?.amount, -1)
  assert.equal(rat?.hits[1]?.key, factionNameKey('Butcherblock Bandits'))
})

test('a quest is clean only when every stated loss is marked don\'t care', () => {
  const work = buildFactionWorkIndex(QUESTS).get(factionNameKey('Miners Guild 628'))
  const rat = work?.raise.find((q) => q.name === 'Rat Run')
  assert.ok(rat !== undefined)
  const marks = new Set([factionNameKey('Butcherblock Bandits')])
  assert.equal(isCleanQuest(rat, marks), false, 'Ebon Mask still counts')
  assert.deepEqual(caredLosses(rat, marks).map((h) => h.name), ['Hall of the Ebon Mask'])
  marks.add(factionNameKey('Hall of the Ebon Mask'))
  assert.equal(isCleanQuest(rat, marks), true)
})

test('the clean switch narrows the raising quests and drops the unstated home-zone ones', () => {
  const work = buildFactionWorkIndex(QUESTS).get(factionNameKey('Miners Guild 628'))
  assert.ok(work !== undefined)
  assert.equal(work.nearby.length, 1, 'the unstated quest is a home-zone candidate')
  const narrowed = filterWork(work, clean(['Butcherblock Bandits', 'Hall of the Ebon Mask']), NO_SLOTS)
  assert.deepEqual(narrowed.raise.map((q) => q.name), ['Rat Run'], 'the gnome quest costs Ak`Anon')
  assert.deepEqual(narrowed.nearby, [], 'silence is not a receipt')
})

test('the real catalog answers the Miners Guild 628 question with Rat Patrol', () => {
  const work = buildFactionWorkIndex(CATALOG).get(factionNameKey('Miners Guild 628'))
  assert.ok(work !== undefined)
  const narrowed = filterWork(
    work,
    clean(['Butcherblock Bandits', 'Circle Of Unseen Hands', 'Hall of the Ebon Mask']),
    NO_SLOTS
  )
  const names = narrowed.raise.map((q) => q.name)
  assert.ok(names.includes('Rat Patrol'), names.join(', '))
  assert.ok(!names.includes('The Gnome Take'), 'it costs Clockworks of Ak`Anon')
})

test('a faction no quest raises is known: Butcherblock Bandits can only fall', () => {
  const raised = raisedKeysOf(CATALOG)
  assert.equal(raised.has(factionNameKey('Butcherblock Bandits')), false)
  assert.equal(raised.has(factionNameKey('Miners Guild 628')), true)
})
