// The Gaps review's fixes (2026-10-19, docs/community/audits/2026-10-19-gaps-review.md): what a
// copied page says about tiers, corpses, factions and redirects, and which page a chip opens.
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { dropsSeen, lootLine, mobFacts, mobPage, stillNeeded, wikiPageText } from '../src/shared/wikiPage'
import { catalogZoneCounts, wikiZoneNamer, zoneBaseName } from '../src/shared/gapWikiZone'
import { dropGaps } from '../src/shared/gapDrops'
import { factionGaps, factionKey } from '../src/shared/gapFactions'
import { groupGaps } from '../src/shared/gapGroups'
import { imageGaps } from '../src/shared/gapImages'
import { pickPage } from '../src/shared/gapMobPage'
import { doneKey, gapActions, npcOnlySpell, withoutDone, type GapRow } from '../src/shared/gaps'
import { killIndex, type KillMap } from '../src/shared/kills'
import type { LootEvent } from '../src/shared/types'

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

test('an item at any tier is one item: +N loot reaches dropsfrom, the mob page and the grouped view', () => {
  const loot: LootEvent[] = [
    { ts: 1000, item: 'Bronze Claymore +4', source: 'a shadowknight', zone: 'Befallen 4 (Refined)' },
    { ts: 2000, item: 'Bronze Claymore', source: 'a shadowknight', zone: 'Befallen' }
  ]
  const zoneName = (z: string): string => zoneBaseName(z)
  assert.deepEqual(dropsSeen('Bronze Claymore', loot, zoneName), [{ zone: 'Befallen', mob: 'a shadowknight', drops: 2 }])
  const kills = killIndex({ 'a shadowknight': { display: 'a shadowknight', count: 4, credited: 4 } } as unknown as KillMap)
  const mob = mobFacts(row('mob', 'a shadowknight'), loot, kills)
  assert.deepEqual(mob.loot, [{ item: 'Bronze Claymore', drops: 2 }])
  const shape = groupGaps([row('item', 'Bronze Claymore')], loot, zoneName).map((e) => (e.kind === 'row' ? e.row.name : e.kind === 'mob' ? e.mob : e.zone))
  assert.deepEqual(shape, ['Befallen', 'a shadowknight', 'Bronze Claymore'])
})

test('a zone is written as the wiki spells it: tiers folded, the catalog spelling preferred', () => {
  const namer = wikiZoneNamer(catalogZoneCounts([{ zones: ['Plane of Hate'] }, { zones: ['Plane of Hate'] }, { zones: ['EC'] }]))
  assert.equal(namer('The Plane of Hate - Group 4 (Refined)'), 'Plane of Hate')
  assert.equal(namer('The Plane of Hate 1 (Awakened)'), 'Plane of Hate')
  assert.equal(namer('Befallen 4 (Refined)'), 'Befallen')
})

test('one corpse is one drop, and more drops than kills prints no rate rather than Always', () => {
  const loot: LootEvent[] = [
    { ts: 5000, item: 'Armadillo Meat', source: 'an armadillo' },
    { ts: 5000, item: 'Armadillo Meat', source: 'an armadillo' },
    { ts: 5000, item: 'Armadillo Meat', source: 'an armadillo' }
  ]
  assert.deepEqual(dropsSeen('Armadillo Meat', loot), [{ zone: '', mob: 'an armadillo', drops: 1 }])
  assert.equal(lootLine('Wooden Shards', 40, 22), '<li> {{:Wooden Shards}} </li>')
})

test('a capped "better" line is a raise: it lands under opposing_factions; proven none says * None', () => {
  const kills = killIndex({ 'a rabid kobold': { display: 'a rabid kobold', count: 3, credited: 3 } } as unknown as KillMap)
  const seen = {
    killFactions: [
      { mob: 'a rabid kobold', faction: 'Kerra Isle', raised: true },
      { mob: 'a rabid kobold', faction: 'Clan Kolbok', adjust: -1, raised: false }
    ]
  }
  const page = mobPage(mobFacts(row('mob', 'a rabid kobold'), [], kills, seen))
  assert.ok(page.includes("| factions = \n\n* [[Clan Kolbok]] <span class='profac'>(-1)</span>"), page)
  assert.ok(page.includes('| opposing_factions = \n\n* [[Kerra Isle]]\n'), page)
  const none = mobPage(mobFacts(row('mob', 'a bat'), [], killIndex({ 'a bat': { display: 'a bat', count: 2, credited: 2 } } as unknown as KillMap)))
  assert.ok(none.includes('| factions = \n\n* None') && none.includes('| opposing_factions = \n\n* None'), none)
  const unknown = mobPage(mobFacts(row('mob', 'a bat'), [], {}))
  assert.ok(unknown.includes('| factions = \n'), 'no kill of your own: blank, not None')
})

test('a faction row copies its amount and direction, and folds the wiki spelling', () => {
  const catalog = [{ name: 'a minotaur slaver', page: 'A minotaur slaver', factions: ['Opal Dark Briar'] }]
  const rows = factionGaps(
    [
      { mob: 'a minotaur slaver', faction: 'Opal Darkbriar', n: 3, zone: '' },
      { mob: 'a minotaur slaver', faction: "King Ak`Anon", n: 5, zone: '', adjust: 5, raised: true }
    ],
    catalog
  )
  assert.deepEqual(rows.map((r) => r.name), ['King Ak`Anon (a minotaur slaver)'])
  assert.equal(wikiPageText(rows[0], [], {}), "* [[King Ak`Anon]] <span class='oppfac'>(5)</span>\n")
  assert.equal(factionKey('King Ak\'Anon (Faction)'), factionKey("King AkAnon"))
})

test('a chip opens the catalog page for the zone the mob was met in, never a page the log name invents', () => {
  const pages = [
    { name: 'Orc Centurion', page: 'Orc Centurion (Crushbone)', zones: ['Crushbone'] },
    { name: 'Orc Centurion', page: 'Orc Centurion (Deathfist)', zones: ['West Commonlands'] }
  ]
  assert.equal(pickPage(pages, 'Clan Crushbone'), undefined, 'a zone neither page names picks none')
  assert.equal(pickPage(pages, 'West Commonlands'), 'Orc Centurion (Deathfist)')
  const catalog = [{ name: 'a shadowknight', page: 'A shadowknight (Human)', zones: ['Befallen'], drops: ['Rusty Weapons'] }]
  const [drop] = dropGaps([{ ts: 1, item: 'Smoked Glass Key', source: 'a shadowknight', zone: 'Befallen' }], catalog, {})
  assert.equal(gapActions(drop, 'unchecked')[0].href, 'https://eqlwiki.com/index.php?title=A_shadowknight_(Human)&action=edit')
})

test('common_loot and a redirect title both count as the page listing the drop', () => {
  const catalog = [{ name: 'a treant', page: 'A treant', drops: ['A Wooden Heart'], commonDrops: ['Treant Bark'] }]
  const loot: LootEvent[] = [
    { ts: 1, item: 'Wooden Heart', source: 'a treant' },
    { ts: 2, item: 'Treant Bark', source: 'a treant' }
  ]
  assert.equal(dropGaps(loot, catalog, {}, { aliases: { 'A Wooden Heart': 'Wooden Heart' } }).length, 0)
})

test('a near-miss row copies a redirect from the game spelling, not a second page', () => {
  const r = row('item', 'Teir`Dal Arcane Insignia', {}, { suggest: { name: "Tier'Dal Arcane Insignia", page: "Tier'Dal Arcane Insignia", distance: 2 } })
  assert.equal(wikiPageText(r, [], {}), "#REDIRECT [[Tier'Dal Arcane Insignia]]\n")
})

test('a one-word caster the catalog has is a mob, so the spell is NPC-only', () => {
  const r = row('spell', 'Specter Stun', { casters: { entries: [{ name: 'Zazamoukh', n: 9 }, { name: 'a specter', n: 3 }], distinct: 2 } })
  assert.equal(npcOnlySpell(r), false)
  assert.equal(npcOnlySpell(r, (n) => n === 'Zazamoukh'), true)
  assert.equal(npcOnlySpell(r, () => false), false)
})

test('a conned mob with no image is an Images row, under the zone it was conned in', () => {
  const catalog = [{ name: 'Marda', page: 'Marda', noImage: true as const }]
  const [r] = imageGaps({}, [], catalog, [{ mob: 'Marda', zone: 'Oggok', cons: 2 }])
  assert.deepEqual([r.name, r.kinds, r.details.zones?.all], ['Marda', ['considered'], ['Oggok']])
})

test('Done marks hide rows by domain and name; the details say what the page still needs', () => {
  const a = row('item', 'A')
  const b = row('mob', 'A')
  assert.deepEqual(withoutDone([a, b], new Set([doneKey(a)])), [b])
  assert.deepEqual(stillNeeded(row('mob', 'a scout'), [], {}), ['level (/con)', 'location (/loc beside a hail or /con)', 'factions (a kill of your own)', 'image (a screenshot)'])
  assert.deepEqual(stillNeeded(row('drop', 'X (a scout)'), [], {}), [])
})

test('Check wiki names the data date and calls it a miss in the data, not a verdict', () => {
  const [chip] = gapActions(row('item', 'Shrubbery'), 'unchecked', { dataDate: '2026-10-19' })
  assert.equal(chip.label, 'Check wiki')
  assert.match(chip.why, /wiki data from 2026-10-19/)
})
