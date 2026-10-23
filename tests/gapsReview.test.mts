// The Gaps review's fixes (2026-10-19, docs/community/audits/2026-10-19-gaps-review.md): what a
// copied page says about tiers, corpses, factions and redirects, and which page a chip opens.
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { dropsSeen, factionLine, lootLine, mobFacts, mobPage, stillNeeded, wikiPageText } from '../src/shared/wikiPage'
import { catalogZoneCounts, wikiZoneLink, wikiZoneNamer, zoneBaseName } from '../src/shared/gapWikiZone'
import { dropGaps } from '../src/shared/gapDrops'
import { factionGaps, factionKey } from '../src/shared/gapFactions'
import { groupGaps } from '../src/shared/gapGroups'
import { imageGaps } from '../src/shared/gapImages'
import { pickPage } from '../src/shared/gapMobPage'
import { allDone, doneKey, gapActions, gapsCaption, hiddenBy, keptDoneMarks, npcOnlySpell, uncertainGap, withDoneMarks, withoutDone, withoutUncertain, type GapRow } from '../src/shared/gaps'
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

test('the Temple of Cazic-Thule is the wiki zone Cazic Thule, linked to its (Zone) page and filed under its plain category', () => {
  const namer = wikiZoneNamer(catalogZoneCounts([{ zones: ['Cazic Thule'] }]))
  for (const raw of ['Temple of Cazic-Thule', 'The Temple of Cazic-Thule', 'Temple of Cazic-Thule - Group 4 (Refined)']) assert.equal(namer(raw), 'Cazic Thule', raw)
  assert.equal(wikiZoneLink('Cazic Thule'), '[[Cazic Thule (Zone)|Cazic Thule]]')
  assert.equal(wikiZoneLink('Erudin'), '[[Erudin]]')
  const mob = row('mob', 'a lizard crusader', { zones: { entries: [{ name: 'Temple of Cazic-Thule', n: 1 }], distinct: 1 } })
  const text = wikiPageText(mob, [], {}, { zoneName: namer })
  assert.ok(text.includes('| zone              = [[Cazic Thule (Zone)|Cazic Thule]]'), text)
  assert.match(text, /\[\[Category:Cazic Thule\]\]\n$/)
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
  // No amount stated: the sign alone (owner, 2026-10-22).
  assert.ok(page.includes("| opposing_factions = \n\n* [[Kerra Isle]] <span class='oppfac'>(+)</span>\n"), page)
  const batKills = killIndex({ 'a bat': { display: 'a bat', count: 2, credited: 2 } } as unknown as KillMap)
  const own = { killers: { entries: [{ name: 'you', n: 2 }], distinct: 1 } }
  const none = mobPage(mobFacts(row('mob', 'a bat', own), [], batKills))
  assert.ok(none.includes('| factions = \n\n* None') && none.includes('| opposing_factions = \n\n* None'), none)
  // Experience-credited kills with no killing blow of your own prove nothing: a pet's kill while you
  // are feigned pays experience and moves no faction (owner, 2026-10-23, Guard S`Tal).
  const petOnly = mobPage(mobFacts(row('mob', 'a bat'), [], batKills))
  assert.ok(petOnly.includes('| factions = \n') && !petOnly.includes('* None'), petOnly)
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

test('a drop the wiki files as shared loot goes under common_loot; the mob own drops under known_loot', async () => {
  const { commonLootNames } = await import('../src/shared/gapMobPage')
  const catalog = [1, 2, 3].map((n) => ({ name: `raid boss ${n}`, page: `Raid boss ${n}`, commonDrops: ['Classic Raid Tier Treasures'] }))
  const common = commonLootNames(catalog)
  assert.ok(common.has('classic raid tier treasures'))
  const kills = killIndex({ 'a new boss': { display: 'a new boss', count: 2, credited: 2 } } as unknown as KillMap)
  const loot: LootEvent[] = [
    { ts: 1, item: 'Classic Raid Tier Treasures', source: 'a new boss' },
    { ts: 2, item: 'Boss Claw', source: 'a new boss' }
  ]
  const text = mobPage(mobFacts(row('mob', 'a new boss'), loot, kills), common)
  assert.match(text, /\| known_loot = \n\n<ul>\n<li> \{\{:Boss Claw\}\}/)
  assert.match(text, /\| common_loot = \n\n<ul>\n<li> \{\{:Classic Raid Tier Treasures\}\}/)
})

test('a spell page fills from the install spell files: classes, mana, range, times, resist, messages', async () => {
  const { spellFactsFrom } = await import('../src/main/gapSpellFacts')
  const levels = Array.from({ length: 16 }, (_, i) => (i === 9 ? '43' : '255'))
  const head = ['4093', 'Odium', '0', '', '200', '0', '0', '0', '3000', '1500', '6000', '7', '5', '0', '409']
  const fields = [...head, ...Array.from({ length: 14 }, () => '0'), '1', ...Array.from({ length: 6 }, () => '0'), ...levels]
  while (fields.length < 79) fields.push('0')
  fields[78] = '-10'
  const str = '4093^^^You stagger under a dark curse.^ staggers under a dark curse.^You are no longer cursed.^'
  const facts = spellFactsFrom(fields.join('^'), str, ['Odium', 'Not There'])
  assert.deepEqual(facts.Odium, {
    classes: [{ cls: 'Shaman', level: 43 }],
    mana: 409,
    range: 200,
    castTime: '3.00',
    recastTime: '6.00',
    resist: 'Magic (-10)',
    msgOnYou: 'You stagger under a dark curse.',
    msgOnOther: 'Someone staggers under a dark curse.',
    msgWearsOff: 'You are no longer cursed.'
  })
  assert.equal(facts['Not There'], undefined)
  const page = wikiPageText(row('spell', 'Odium'), [], {}, { spellFacts: facts })
  assert.match(page, /\| classes =\n\n\* \[\[Shaman\]\] - Level 43/)
  assert.match(page, /\| mana = 409/)
  assert.doesNotMatch(page, /NPC Only/)
})

test('Hide uncertain drops only the rows whose very existence as a gap is in doubt: a name that may be a player', () => {
  const maybe = row('mob', 'Grapok', {}, { maybePlayer: true })
  const npc = row('mob', 'Rognok')
  const nearMiss = row('item', 'Rusty Sowrd', {}, { suggest: { name: 'Rusty Sword', page: 'Rusty Sword', distance: 1 } })
  const unsureFaction = row('faction', 'Guards of Qeynos (a guard)')
  assert.equal(uncertainGap(maybe), true)
  // A near miss still owes a redirect; a faction with no direction is a real gap with an unsure detail.
  assert.deepEqual(withoutUncertain([maybe, npc, nearMiss, unsureFaction]).map((r) => r.name), ['Rognok', 'Rusty Sowrd', 'Guards of Qeynos (a guard)'])
})

test('a gray kill of your own proves no factions: own killing blows count as credited kills do', () => {
  // A scout from zanivar, 16 of the player's own kills, no experience (gray), no faction line.
  const scout = row('mob', 'a scout from zanivar', { killers: { entries: [{ name: 'you', n: 16 }], distinct: 1 } })
  const kills = killIndex({ 'a scout from zanivar': { display: 'a scout from zanivar', count: 16, credited: 0 } } as unknown as KillMap)
  const page = mobPage(mobFacts(scout, [], kills))
  assert.ok(page.includes('| factions = \n\n* None') && page.includes('| opposing_factions = \n\n* None'), page)
  assert.ok(!stillNeeded(scout, [], kills).includes('factions (a kill of your own)'))
  // Kills by someone else alone prove nothing.
  const theirs = row('mob', 'a scout from zanivar', { killers: { entries: [{ name: 'Xober', n: 3 }], distinct: 1 } })
  assert.ok(!mobPage(mobFacts(theirs, [], {})).includes('* None'))
})

test('Done marks clear when the wiki data is newer than them, whatever rows are on the tab', () => {
  const marks = { 'item:Bat Wing': '2026-10-19', 'mob:a gnoll': '2026-10-01', 'drop:Rat Ear (a rat)': '2026-10-19' }
  // The same data as the marks (launch, a character switch, All characters): kept.
  assert.deepEqual(Object.keys(keptDoneMarks(marks, '2026-10-19')).sort(), ['drop:Rat Ear (a rat)', 'item:Bat Wing'])
  // After a scrape: every older mark is cleared, so a row the wiki still lacks comes back.
  assert.deepEqual(Object.keys(keptDoneMarks(marks, '2026-11-02')), [])
})

test("a mob heading's Done marks every row under it, keeps an older mark's day, and clears them all again (owner ask, 2026-10-21)", () => {
  const rows = [row('drop', 'Ruined Robe (Eleann Morkul)'), row('drop', 'Rusty Dagger (Eleann Morkul)')]
  const marks = { [doneKey(rows[0])]: '2026-10-20', 'item:Bat Wing': '2026-10-20' }
  assert.equal(allDone(rows, new Set(Object.keys(marks))), false)
  const on = withDoneMarks(marks, rows, true, '2026-10-21')
  assert.deepEqual(on, { [doneKey(rows[0])]: '2026-10-20', [doneKey(rows[1])]: '2026-10-21', 'item:Bat Wing': '2026-10-20' })
  assert.equal(allDone(rows, new Set(Object.keys(on))), true)
  assert.deepEqual(withDoneMarks(on, rows, false, '2026-10-21'), { 'item:Bat Wing': '2026-10-20' })
  assert.equal(allDone([], new Set()), false, 'an empty heading is never all done')
})

test('the list buttons count only what the player sees: Done and, when hidden, uncertain rows are left out', () => {
  const rows = [row('mob', 'a troll raider'), row('mob', 'Basher Dreg'), row('mob', 'a fallen froglok'), { ...row('mob', 'Kujanko'), maybePlayer: true }]
  const snap = { rows, totals: { item: 0, mob: 4, spell: 0, merchant: 0, faction: 0, drop: 0, image: 0 }, seen: {} } as never
  const done = new Set([doneKey(rows[2])])
  assert.equal(gapsCaption(snap, 'mob', null, hiddenBy(done, false, false)), '3 unknown')
  assert.equal(gapsCaption(snap, 'mob', null, hiddenBy(done, true, false)), '4 unknown')
  assert.equal(gapsCaption(snap, 'mob', null, hiddenBy(done, false, true)), '2 unknown')
})

test('ten kills of your own with nothing looted write * None under known_loot; fewer, or any loot, do not', () => {
  const killedBy = (n: number) => row('mob', 'a fallen froglok', { killers: { entries: [{ name: 'you', n }], distinct: 1 } })
  const kills = killIndex({ 'a fallen froglok': { display: 'a fallen froglok', count: 10, credited: 10 } } as unknown as KillMap)
  assert.ok(mobPage(mobFacts(killedBy(10), [], kills)).includes('| known_loot = \n\n* None'))
  assert.ok(!mobPage(mobFacts(killedBy(9), [], kills)).includes('| known_loot = \n\n* None'))
  const loot = [{ item: 'Froglok Leg', source: 'a fallen froglok', ts: 1 }] as LootEvent[]
  assert.ok(!mobPage(mobFacts(killedBy(10), loot, kills)).includes('* None\n\n| common_loot'))
})

test("A PET'S KILL IS THE PLAYER'S FOR LOOT, NEVER FOR FACTIONS; FACTION LINES SEEN AT A KILL NEED NO MORE (OWNER, 2026-10-22: GONEKN, FEIGN DEATH)", () => {
  const killers = { entries: [{ name: 'Gonekn', n: 1 }] } as GapRow['details']['killers']
  const templar = row('mob', 'a Deathfist templar', { killers })
  assert.ok(stillNeeded(templar, [], {}).includes('factions (a kill of your own)'))
  // The player's pet: its corpse is the player's to loot, but a kill while the player is feigned
  // moves no faction, so with no faction lines the factions are still unknown.
  const pets = { ownPets: ['Gonekn'] }
  assert.equal(mobFacts(templar, [], {}, pets).ownKills, 1)
  assert.equal(mobFacts(templar, [], {}, pets).credited, 0)
  assert.ok(stillNeeded(templar, [], {}, pets).includes('factions (a kill of your own)'))
  // Faction lines seen at a kill of the mob are the proof, whoever landed the blow.
  const seen = { killFactions: [{ mob: 'a Deathfist templar', faction: 'Death Fist Orcs', adjust: -3, raised: false }] }
  assert.ok(!stillNeeded(templar, [], {}, seen).includes('factions (a kill of your own)'))
})

test("A CAPPED FACTION LINE WRITES ITS SIDE'S SIGN WHEN NO AMOUNT WAS STATED (OWNER, 2026-10-22: KNIGHTS OF TRUTH 'COULD NOT POSSIBLY GET ANY BETTER')", () => {
  assert.equal(factionLine({ faction: 'Knights of Truth', raised: true }), "* [[Knights of Truth]] <span class='oppfac'>(+)</span>")
  assert.equal(factionLine({ faction: 'Death Fist Orcs', raised: false }), "* [[Death Fist Orcs]] <span class='profac'>(-)</span>")
  assert.equal(factionLine({ faction: 'Ashen Order', adjust: 5, raised: true }), "* [[Ashen Order]] <span class='oppfac'>(5)</span>")
  assert.equal(factionLine({ faction: 'Unknown Side' }), '* [[Unknown Side]]')
})
