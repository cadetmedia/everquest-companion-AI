// Ready (owner, 2026-10-21: "so they know they don't have to capture more information"; "have it as
// a filter"): a Gaps row is Ready when nothing is left that the player can capture. Per domain, from
// `stillNeeded` and the kept screenshots. Fixtures only.
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { needsWords, openNeeds, type KeptCaptures } from '../src/shared/gapReady'
import { onlyJob } from '../src/shared/gapJob'
import { stillNeeded, type MobSightings, type PageExtras } from '../src/shared/wikiPage'
import { killIndex, type KillMap } from '../src/shared/kills'
import type { GapRow } from '../src/shared/gaps'

const row = (domain: GapRow['domain'], name: string, details: Partial<GapRow['details']> = {}, extra: Partial<GapRow> = {}): GapRow => ({
  domain,
  name,
  kinds: [],
  count: 1,
  first: '',
  last: '',
  details: { samples: [], ...details },
  ...extra
})
const none: KeptCaptures = { pictures: {} }
/** What is left for a row: `stillNeeded`, then the kept pictures, as the tab reads it. */
const left = (r: GapRow, seen: MobSightings & PageExtras = {}, kept: KeptCaptures = none, kills: KillMap = {}): string => needsWords(openNeeds(r, stillNeeded(r, [], kills, seen), kept))

test('ITEMS: READY ONCE THE +0 WINDOW IS KEPT, AND ITS LORE TAB WHEN THE WINDOW SHOWS ONE', () => {
  const robe = row('item', 'Ruined Robe')
  assert.equal(left(robe), 'stats')
  assert.equal(left(robe, { itemShots: { 'Ruined Robe': { statsblock: 'MAGIC ITEM' } } }), '')
  // The window showed a Lore tab: the lore is still to capture, then Ready.
  assert.equal(left(robe, { itemShots: { 'Ruined Robe': { statsblock: 'MAGIC ITEM', loreTab: true } } }), 'lore')
  assert.equal(left(robe, { itemShots: { 'Ruined Robe': { statsblock: 'MAGIC ITEM', loreTab: true, lore: 'Once fine.' } } }), '')
  assert.equal(left(robe, { itemShots: { 'Ruined Robe': { lore: 'Once fine.' } } }), 'stats')
  // An upgraded window is not the page's numbers.
  assert.equal(left(robe, { itemShots: { 'Ruined Robe': { statsblock: 'MAGIC ITEM', tier: 3 } } }), 'stats at +0')
  // A near miss copies as a redirect: nothing to capture.
  assert.equal(left(row('item', 'Rusty Sowrd', {}, { suggest: { name: 'Rusty Sword', page: 'Rusty Sword', distance: 1 } })), '')
})

test('SPELLS: READY ONCE THE DESCRIPTION IS KNOWN, FROM THE INSTALL OR A PASTED SPELL WINDOW', () => {
  const heal = row('spell', 'Minor Healing')
  assert.equal(left(heal), 'description')
  assert.equal(left(heal, { spellFacts: { 'Minor Healing': { classes: [], description: 'Mends wounds.' } } }), '')
  assert.equal(left(heal, { spellShots: { 'Minor Healing': { description: 'Mends wounds.' } } }), '')
})

test('MOBS AND MERCHANTS: A LEVEL, A LOCATION, A KILL OF YOUR OWN (MOBS) AND A SAVED PICTURE', () => {
  const scout = row('mob', 'a scout', { cons: { distinct: 1, entries: [{ name: 'L12 indifferent', n: 1 }] }, killers: { distinct: 1, entries: [{ name: 'you', n: 2 }] } })
  const kills = killIndex({ 'a scout': { display: 'a scout', count: 2, credited: 2 } } as unknown as KillMap)
  const seen = { mobLocs: [{ mob: 'a scout', points: [[10, 20]] }] }
  assert.equal(left(row('mob', 'a scout')), 'level, location, factions, image')
  assert.equal(left(scout, seen, none, kills), 'image')
  // The picture is kept by its wiki file name (shared/mobPicture.ts pictureFile).
  assert.equal(left(scout, seen, { pictures: { 'npc_a_scout.png': { path: 'C:/pics/npc_a_scout.png' } } }, kills), '')
  assert.equal(left(row('merchant', 'Klok Koglin'), {}, { pictures: { 'npc_klok_koglin.png': {} } }), 'level, location')
})

test('UPDATES: DROPS ARE READY BY NATURE, A FACTION NEEDS ITS AMOUNT, AN IMAGES ROW ITS PICTURE', () => {
  assert.equal(left(row('drop', 'Rat Ear (a rat)')), '')
  assert.equal(left(row('faction', 'Da Bashers (a troll)')), 'amount')
  assert.equal(left(row('faction', 'Da Bashers (a troll)', {}, { adjust: -30 })), '')
  const image = row('image', 'a lizardman scout', {}, { image: 'npc_a_lizardman_scout.png' })
  assert.equal(left(image), 'image')
  assert.equal(left(image, {}, { pictures: { 'npc_a_lizardman_scout.png': {} } }), '')
})

test('SHOW: READY KEEPS THE READY ROWS, AND THE STORED CHOICE READS BACK', () => {
  const rows = [row('drop', 'Rat Ear (a rat)'), row('item', 'Ruined Robe'), row('faction', 'Da Bashers (a troll)')]
  const isReady = (r: GapRow): boolean => openNeeds(r, stillNeeded(r, [], {}), none).length === 0
  assert.deepEqual(onlyJob(rows, 'ready', {}, isReady).map((r) => r.name), ['Rat Ear (a rat)'])
  // No readiness given: nothing is Ready.
  assert.deepEqual(onlyJob(rows, 'ready'), [])
})
