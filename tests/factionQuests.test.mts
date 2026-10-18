// The FACTION-WORK JOIN behind the Factions tab (renderer/src/features/factions/factionQuests.ts):
// faction name → the quests that raise or lower it, projected from the committed quest catalog's
// receipt lines. Pure module, real catalog — the identities here are the tab's whole claim.

import { test } from 'node:test'
import assert from 'node:assert/strict'
import { buildFactionWorkIndex, raisedKeysOf } from '../src/renderer/src/features/factions/factionQuests'
import { inEraQuests, questOutOfEra } from '../src/shared/questEra'
import questsJson from '../src/renderer/src/data/eqlegends/quests.json'
import { factionNameKey } from '../src/shared/outputs/factions'
import type { QuestData, QuestEntry } from '../src/shared/types'

const CATALOG = (questsJson as QuestData).quests

test('the join splits raise from lower and sorts biggest known payout first', () => {
  const quests: QuestEntry[] = [
    {
      name: 'Small Favor',
      page: 'Small Favor',
      requiredItems: ['Bone Chips'],
      factions: [{ name: 'Kaladim Citizens', up: true, amount: 5 }]
    },
    {
      name: 'Big Favor',
      page: 'Big Favor',
      factions: [
        { name: 'Kaladim Citizens', up: true, amount: 25 },
        { name: 'Craknek Warriors', up: false, amount: -10 }
      ]
    },
    {
      name: 'Unpriced Favor',
      page: 'Unpriced Favor',
      factions: [{ name: 'Kaladim Citizens', up: true }]
    }
  ]
  const index = buildFactionWorkIndex(quests)
  const kaladim = index.get('kaladim citizens')
  assert.ok(kaladim)
  assert.deepEqual(
    kaladim.raise.map((q) => q.name),
    ['Big Favor', 'Small Favor', 'Unpriced Favor'],
    'numeric payouts first, biggest first, unknown last'
  )
  assert.deepEqual(kaladim.lower, [])
  assert.deepEqual(index.get('craknek warriors')?.lower.map((q) => q.name), ['Big Favor'])
  assert.deepEqual(kaladim.raise[1].items, ['Bone Chips'], 'turn-in items ride the ref')
})

test('the real catalog answers the questions the tab was built for', () => {
  const index = buildFactionWorkIndex(CATALOG)
  assert.ok(index.size > 150, `expected work for >150 factions, got ${String(index.size)}`)

  // The Bone Chips ask: something in Kaladim takes them, and the ref says who and where.
  const underfoot = index.get('clerics of underfoot')
  assert.ok(underfoot)
  const kaladimBones = underfoot.raise.find((q) => q.name === 'Bone Chips (Kaladim)')
  assert.ok(kaladimBones)
  assert.equal(kaladimBones.giver, 'Gunlok Jure')
  assert.equal(kaladimBones.startZone, 'North Kaladim')
  assert.deepEqual(kaladimBones.items, ['Bone Chips'])
  assert.equal(kaladimBones.amount, 10)

  // The Kerra Isle ask: the necklace quests that raise the island's regard. Rat Teeth and Gnomish
  // Toy used to answer it, but both pages now open `{{Unknown Era}}` over a `{{delete|…revamped…}}`
  // notice — retired quests the era rule keeps out of the work list (questEra.ts).
  const kerra = index.get('kerra isle')
  assert.ok(kerra)
  assert.ok(!kerra.raise.some((q) => q.name === 'Rat Teeth'), 'a retired Unknown Era page is not work')
  assert.ok(!kerra.raise.some((q) => q.name === 'Gnomish Toy'), 'a retired Unknown Era page is not work')

  // THE SILENT HOME-ZONE QUESTS: the wiki attributes 2 of Kerra Island's quests; the regen
  // necklace the user actually quested (This Means Warrr → Talisman of Kejaar Kerrath) is on a
  // page with no receipt line, and the home-zone inference is what surfaces it.
  //
  // THE WIKI CAUGHT UP ON THAT ONE (read by the 2026-10-10 delta run): the This Means Warrr page now
  // states `Kerra Isle +20`, so it rides the RAISE list with its amount and leaves the nearby list -
  // the rule asserted just below. The home-zone inference still carries the island's other silent
  // quests; Fang Tooth (the Fishbone Necklace) is the one pinned now.
  assert.equal(kerra.homeZone, 'Kerra Island')
  const warrr = kerra.raise.find((q) => q.name === 'This Means Warrr')
  assert.ok(warrr, 'the regen necklace quest now states its Kerra Isle raise')
  assert.equal(warrr.amount, 20)
  assert.deepEqual(warrr.rewards, ['Talisman of Kejaar Kerrath'])
  assert.ok(!kerra.nearby.some((q) => q.name === 'This Means Warrr'), 'and so is no longer a nearby candidate')
  const fang = kerra.nearby.find((q) => q.name === 'Fang Tooth (quest)')
  assert.ok(fang, 'the silent Kerra Island quests ride the nearby list')
  assert.deepEqual(fang.rewards, ['Fishbone Necklace'])
  // A quest with a stated faction effect is never ALSO a nearby candidate.
  assert.ok(!kerra.nearby.some((q) => q.name === 'Rat Teeth'))
})

test('a quest page that drops the dump spelling still attaches to the dump row', () => {
  const index = buildFactionWorkIndex([
    { name: 'Short Name', page: 'Short Name', factions: [{ name: 'Freeport Militia', up: true, amount: 10 }] },
    { name: 'Full Name', page: 'Full Name', factions: [{ name: 'The Freeport Militia', up: true, amount: 5 }] }
  ])
  const militia = index.get(factionNameKey('The Freeport Militia'))
  assert.deepEqual(militia?.raise.map((q) => q.name), ['Short Name', 'Full Name'])
  // The real catalog spells both factions both ways; every spelling lands on the dump's row.
  const real = buildFactionWorkIndex(CATALOG)
  for (const [short, dump] of [['Freeport Militia', 'The Freeport Militia'], ['Da Bashers', 'DaBashers']]) {
    const named = CATALOG.filter((q) => q.factions?.some((f) => f.name === short)).map((q) => q.name)
    const work = real.get(factionNameKey(dump))
    const attached = [...(work?.raise ?? []), ...(work?.lower ?? [])].map((q) => q.name)
    assert.ok(named.length > 0 && named.every((n) => attached.includes(n)), short)
  }
})

test('an out-of-era quest is not offered as work; an in-era and an un-bannered one are', () => {
  const quests: QuestEntry[] = [
    {
      name: 'Dragon Scales Quest',
      page: 'Dragon Scales Quest',
      eraTag: 'Kunark',
      startZone: 'Firiona Vie',
      factions: [
        { name: 'Temple Of Sol Ro', up: true },
        { name: 'Shadowed Men', up: false }
      ]
    },
    {
      name: 'Classic Turn-in',
      page: 'Classic Turn-in',
      eraTag: 'Classic',
      startZone: 'Temple of Solusek Ro',
      factions: [{ name: 'Temple Of Sol Ro', up: true, amount: 10 }]
    },
    {
      name: 'Unbannered Turn-in',
      page: 'Unbannered Turn-in',
      startZone: 'Temple of Solusek Ro',
      factions: [{ name: 'Temple Of Sol Ro', up: true }]
    },
    // a silent Kunark quest in the home zone must not slip in as a nearby candidate either
    { name: 'Silent Kunark Quest', page: 'Silent Kunark Quest', eraTag: 'Kunark', startZone: 'Temple of Solusek Ro' },
    { name: 'Silent Classic Quest', page: 'Silent Classic Quest', startZone: 'Temple of Solusek Ro' }
  ]
  const index = buildFactionWorkIndex(quests, 'classic')
  const sol = index.get(factionNameKey('Temple Of Sol Ro'))
  assert.ok(sol)
  assert.deepEqual(sol.raise.map((q) => q.name), ['Classic Turn-in', 'Unbannered Turn-in'])
  assert.deepEqual(sol.nearby.map((q) => q.name), ['Silent Classic Quest'])
  assert.equal(index.get(factionNameKey('Shadowed Men')), undefined, 'its cost is not on record either')
  assert.equal(raisedKeysOf(quests.slice(0, 1), 'classic').size, 0, 'nor is it a win-back witness')

  // The same rule, read the day the server opens Kunark: the banner stops being a reason.
  assert.ok(buildFactionWorkIndex(quests, 'kunark').get(factionNameKey('Shadowed Men')))

  // The predicate itself: out names a shipped-later expansion or a no-expansion token; silence is in.
  assert.equal(questOutOfEra({ eraTag: 'Kunark' }, 'classic'), true)
  assert.equal(questOutOfEra({ eraTag: 'Unknown' }, 'kunark'), true)
  assert.equal(questOutOfEra({ eraTag: 'Classic' }, 'classic'), false)
  assert.equal(questOutOfEra({}, 'classic'), false)
  assert.equal(inEraQuests(quests, 'classic').length, 3)
})

test('the real catalog no longer offers the Kunark Dragon Scales Quest for Temple Of Sol Ro', () => {
  const dragon = CATALOG.find((q) => q.page === 'Dragon Scales Quest')
  assert.equal(dragon?.eraTag, 'Kunark')
  assert.ok(dragon?.factions?.some((f) => f.name === 'Temple Of Sol Ro' && f.up), 'the page does quote the raise')
  const sol = buildFactionWorkIndex(CATALOG, 'classic').get(factionNameKey('Temple Of Sol Ro'))
  const offered = [...(sol?.raise ?? []), ...(sol?.lower ?? []), ...(sol?.nearby ?? [])].map((q) => q.name)
  assert.ok(!offered.includes('Dragon Scales Quest'))
})
