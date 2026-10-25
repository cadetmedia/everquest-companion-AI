// The wiki page a Gaps row copies (owner ask, 2026-10-18), built in the layout of the wiki's own
// `Fire Beetle Eye` page: the era banner, only the fields the log fills, `dropsfrom` by zone.
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { dropsSeen, itemPage, itemWhereTable, mobFacts, mobPage, spellPage, stillNeeded, wikiCoin, wikiPageText } from '../src/shared/wikiPage'
import { vendorFinder } from '../src/shared/gapMobPage'
import { killIndex, type KillMap } from '../src/shared/kills'
import type { GapRow } from '../src/shared/gaps'
import type { LootEvent } from '../src/shared/types'

test('an item page holds the banner, only the filled fields, the zone blocks and their categories', () => {
  const text = itemPage({
    name: 'Fire Beetle Eye',
    drops: [
      { zone: 'Misty Thicket', mob: 'a Klaknak drone', drops: 1 },
      { zone: 'East Commonlands', mob: 'a fire beetle', drops: 209 }
    ],
    merchantValue: 27,
    soldBy: [],
    crafted: false
  })
  assert.equal(
    text,
    [
      '{{Classic Era}}',
      '<onlyinclude>{{Itempage',
      '|itemname = Fire Beetle Eye',
      '|merchant_value = 2s 7c',
      '|statsblock = ',
      'Size:   WT: <br>',
      'Class: <br>',
      'Race: <br>',
      '|dropsfrom = ',
      '',
      '[[East Commonlands]]',
      '',
      '* [[a fire beetle]]',
      '',
      '[[Misty Thicket]]',
      '',
      '* [[a Klaknak drone]]',
      '',
      '}}</onlyinclude>',
      '',
      '[[Category:East Commonlands]]',
      '[[Category:Misty Thicket]]',
      ''
    ].join('\n')
  )
})

test('a bought or crafted item says so; nothing seen leaves only the name and the open stats', () => {
  const text = itemPage({ name: 'Bread', drops: [], soldBy: [{ vendor: 'Baker Ian', zone: 'Qeynos Hills' }], crafted: true })
  assert.match(text, /\|soldby = \n\n\{\{ItemWhereTable\|\n/)
  // The blueprint's kinds, alphabetical (Help:Contents, Item Page Blueprint).
  assert.match(text, /\[\[Category:Player Crafted\]\]\n\[\[Category:Vendor Sold\]\]/)
  const bare = itemPage({ name: 'X', drops: [], soldBy: [], crafted: false })
  assert.equal(bare, '{{Classic Era}}\n<onlyinclude>{{Itempage\n|itemname = X\n|statsblock = \nSize:   WT: <br>\nClass: <br>\nRace: <br>\n}}</onlyinclude>\n')
})

// Review D1: the wiki's own `|soldby` on 1,243 of 1,278 pages. The rows below are copied byte for
// byte from cached pages (Fishing Grubs, Kael Drakkel's Bjorak Stonefist, Qeynos Aqueducts).
test('soldby is the wiki ItemWhereTable: padded cells, an empty directions cell, the loc in /loc order, closed on its own line', () => {
  const text = itemPage({
    name: 'Fishing Grubs',
    drops: [],
    soldBy: [
      { vendor: 'Kubder Restona', zone: 'Qeynos Aqueducts|Qeynos Catacombs', loc: [277, -384] },
      { vendor: 'Dansie McVicker', zone: 'Everfrost Peaks', loc: [3638, 697] },
      { vendor: 'Daria Smith', zone: 'Freeport|East Freeport', loc: [46, -226] }
    ],
    crafted: false
  })
  assert.ok(
    text.includes(
      [
        '|soldby = ',
        '',
        '{{ItemWhereTable|',
        '{{ItemWhereRow   | [[Everfrost Peaks]]               | [[Dansie McVicker]]           |               | (3638, 697) }}',
        '{{ItemWhereRow   | [[Freeport|East Freeport]]        | [[Daria Smith]]               |               | (46, -226) }}',
        '{{ItemWhereRow   | [[Qeynos Aqueducts|Qeynos Catacombs]] | [[Kubder Restona]]            |               | (277, -384) }}',
        '}}',
        '',
        '}}</onlyinclude>'
      ].join('\n')
    ),
    text
  )
  // A vendor whose spot is unknown leaves the cell empty, as the wiki's own rows do.
  assert.ok(itemWhereTable([{ vendor: 'Baker Ian', zone: 'Qeynos Hills' }]).includes('| [[Baker Ian]]                 |               |  }}\n}}\n'))
})

test('a soldby row places its vendor by the catalog: the page picked by zone, one spawn point or none', () => {
  const catalog = [
    { page: 'Dansie McVicker', name: 'Dansie McVicker', zones: ['Everfrost Peaks'], loc: [{ ns: 3638, ew: 697 }] },
    { page: 'Merchant Tyslin (South Felwithe)', name: 'Merchant Tyslin', zones: ['South Felwithe'], loc: [{ ns: 450, ew: -775 }] },
    { page: 'Merchant Tyslin (Rivervale)', name: 'Merchant Tyslin', zones: ['Rivervale'], loc: [{ ns: 1, ew: 2 }] },
    { page: 'Two Spot', name: 'Two Spot', zones: ['Halas'], loc: [{ ns: 1, ew: 2 }, { ns: 3, ew: 4 }] }
  ]
  const vendorAt = vendorFinder(catalog)
  assert.deepEqual(vendorAt('dansie mcvicker', []), { page: 'Dansie McVicker', zone: 'Everfrost Peaks', loc: [3638, 697] })
  assert.deepEqual(vendorAt('Merchant Tyslin', ['South Felwithe']), { page: 'Merchant Tyslin (South Felwithe)', zone: 'South Felwithe', loc: [450, -775] })
  assert.equal(vendorAt('Merchant Tyslin', ['Halas']), undefined, 'two pages and no zone to choose: none')
  assert.deepEqual(vendorAt('Two Spot', []), { page: 'Two Spot', zone: 'Halas' }, 'several spawn points: not placed')
  const row = (sources: string[], zones: string[]): GapRow => ({
    domain: 'item',
    name: 'Tyslin Tea',
    kinds: ['bought'],
    count: 1,
    first: '',
    last: '',
    details: { samples: [], sources: { entries: sources.map((name) => ({ name, n: 1 })), distinct: sources.length }, zones: { entries: zones.map((name) => ({ name, n: 1 })), distinct: zones.length } }
  })
  const page = wikiPageText(row(['Merchant Tyslin'], ['South Felwithe']), [], {}, { vendorAt })
  assert.match(page, /\{\{ItemWhereRow {3}\| \[\[South Felwithe\]\] +\| \[\[Merchant Tyslin \(South Felwithe\)\]\] \| {15}\| \(450, -775\) \}\}/)
  // A vendor the catalog lacks: its name as printed, the item's one zone, no loc.
  assert.match(wikiPageText(row(['Gnomish Peddler'], ['Ak`Anon']), [], {}, { vendorAt }), /\| \[\[Ak`Anon\]\] +\| \[\[Gnomish Peddler\]\] +\| {15}\| {2}\}\}/)
})

test('prices are written the wiki way', () => {
  assert.deepEqual([wikiCoin(27), wikiCoin(40), wikiCoin(1143), wikiCoin(0)], ['2s 7c', '4s', '1p 1g 4s 3c', '0c'])
})

test('drops are counted in corpses per zone and mob from the loot ledger; a mob page rates each item by its kills in the wiki shape', () => {
  const loot: LootEvent[] = [
    { ts: 1, item: 'Black Lizard Talon', source: 'a lizardman forager', zone: 'The Feerrott' },
    { ts: 2, item: 'black lizard talon', source: 'a lizardman forager', zone: 'The Feerrott', count: 2 },
    { ts: 3, item: 'Black Lizard Talon', source: 'a hatchling', zone: 'The Feerrott' },
    { ts: 4, item: 'Other', source: 'a hatchling', zone: 'The Feerrott' }
  ]
  const kills = killIndex({ 'a lizardman forager': { display: 'a lizardman forager', count: 10 } } as unknown as KillMap)
  assert.deepEqual(dropsSeen('Black Lizard Talon', loot), [
    // A stack of 2 off one corpse is one drop: the rate is drops per kill.
    { zone: 'The Feerrott', mob: 'a lizardman forager', drops: 2 },
    { zone: 'The Feerrott', mob: 'a hatchling', drops: 1 }
  ])
  // On the mob's page, as the wiki keeps drop chances (owner, 2026-10-18).
  const forager: GapRow = { domain: 'mob', name: 'a lizardman forager', kinds: [], count: 1, first: '', last: '', details: { samples: [] } }
  assert.deepEqual(mobFacts(forager, loot, kills).loot, [{ item: 'Black Lizard Talon', drops: 2 }])
  assert.equal(mobFacts(forager, loot, kills).kills, 10)
  assert.match(wikiPageText(forager, loot, kills), /<li> \{\{:Black Lizard Talon\}\} <span class='drare'>\(Rare\)<\/span> <span class='ddb'>\[Overall: ~20%\]<\/span> <\/li>/)
})

test('a mob page names its levels, zones and loot; an NPC-only spell says so', () => {
  const mob = mobPage({
    name: 'a scout from zanivar',
    zones: ['The Feerrott'],
    levels: [11, 13],
    loot: [{ item: 'Scalp', drops: 1 }],
    kills: 0,
    credited: 0,
    specials: ['Rampages'],
    points: [[-791, 173, -12]],
    factions: [
      { faction: 'Guards of Qeynos', adjust: -30 },
      { faction: 'Ring of Scale', adjust: 10 }
    ]
  })
  // The NPC Page Blueprint's whole layout, the log's values filled, the rest blank.
  for (const line of [
    '| imagefilename     = npc_a_scout_from_zanivar.png',
    '| name              = a scout from zanivar',
    '| race              = ',
    '| level             = 11-13',
    '| zone              = [[The Feerrott]]',
    '| location          = (-791, 173)',
    '| AC                = ',
    '| special           = Rampages',
    '| attacks_per_round = ',
    "| factions = \n\n* [[Guards of Qeynos]] <span class='profac'>(-30)</span>",
    "| opposing_factions = \n\n* [[Ring of Scale]] <span class='oppfac'>(10)</span>",
    '| related_quests = '
  ]) {
    assert.ok(mob.includes(line), line)
  }
  assert.match(mob, /<li> \{\{:Scalp\}\} <\/li>/)
  assert.match(mob, /\[\[Category:The Feerrott\]\]\n$/)
  // The wiki's Spell Page Blueprint layout, every field, empty where nothing states it: the template
  // prints a missing one as its raw name, `{{{slots}}}` (owner, 2026-10-24).
  const empty = (name: string, classes: string): string =>
    `{{Classic Era}}\n\n{{Spellpage|\n\n| spellname = ${name}\n\n| spellicon =\n\n| description =\n\n${classes}\n\n| items_with_effect =\n\n| slots =\n\n| skill =\n\n| mana =\n\n| range =\n\n| casting_time =\n\n| fizzle_time =\n\n| recast_time =\n\n| duration =\n\n| target_type =\n\n| spell_type =\n\n| resist =\n\n| msg_cast_on_you =\n\n| msg_cast_on_other =\n\n| msg_wears_off =\n\n| where_to_obtain =\n\n}}\n`
  assert.equal(spellPage({ name: 'Flame Jet', npcOnly: true }), `${empty('Flame Jet', '| classes =\n\nThis spell is cast by NPCs only.')}\n[[Category:NPC Only Spells]]\n`)
  assert.equal(spellPage({ name: 'Spark', npcOnly: false }), empty('Spark', '| classes ='))
})

test('a Gaps row picks its page by domain and takes the vendor value from a sale on loot', () => {
  const row: GapRow = {
    domain: 'item',
    name: 'Black Lizard Talon',
    kinds: ['looted'],
    count: 3,
    first: '',
    last: '',
    details: { samples: [], sales: { entries: [{ name: '3 silver', n: 2 }], distinct: 1 } }
  }
  assert.match(wikiPageText(row, [], {}), /\|merchant_value = 4s\n/)
})

// Review E3: a mob page's MONEY DROPS, in the layout of the wiki's 406 blocks, at the end of known_loot.
test('a mob page ends known_loot with MONEY DROPS, each coin least to most over the kills that paid; none seen writes none', () => {
  const coin = { mob: 'A rabid kobold', n: 2, min: [0, 0, 0, 1], max: [0, 2, 4, 9] }
  const kobold: GapRow = { domain: 'mob', name: 'a rabid kobold', kinds: [], count: 1, first: '', last: '', details: { samples: [] } }
  const loot: LootEvent[] = [{ ts: 1, item: 'Rabid Kobold Fang', source: 'a rabid kobold' }]
  const text = wikiPageText(kobold, loot, {}, { mobCoin: [coin] })
  assert.ok(
    text.includes(
      [
        '| known_loot = ',
        '',
        '<ul>',
        '<li> {{:Rabid Kobold Fang}} </li>',
        '</ul>',
        '<p><b>MONEY DROPS</b></p>',
        '<ul>',
        '<li> 0 - 0 <span style="color:#e5e4e2"><b>Platinums</b></span></li>',
        '<li> 0 - 2 <span style="color:gold"><b>Golds</b></span></li>',
        '<li> 0 - 4 <span style="color:silver"><b>Silvers</b></span></li>',
        '<li> 1 - 9 <span style="color:#CD7F32"><b>Coppers</b></span></li>',
        '</ul>',
        ''
      ].join('\n')
    ),
    text
  )
  // No coin seen: the log cannot prove "NO MONEY DROPS", so the page says nothing about money.
  const none = wikiPageText(kobold, loot, {}, {})
  assert.ok(!none.includes('MONEY'), none)
  // Coin and no loot: the block alone.
  assert.match(wikiPageText(kobold, [], {}, { mobCoin: [coin] }), /\| known_loot = \n\n<p><b>MONEY DROPS<\/b><\/p>\n<ul>\n/)
})

test('AN ITEM SEEN ONLY IN A CAPTURE OR THE BAGS IS NOT READY UNTIL SOMETHING SAYS WHERE IT COMES FROM (owner, 2026-10-24)', () => {
  const captured = { domain: 'item', name: 'Burning Fighters Blade', kinds: ['captured'], count: 1, first: '', last: '', details: {} } as unknown as GapRow
  const shots = { itemShots: { 'Burning Fighters Blade': { statsblock: 'DMG: 9<br>' } } }
  assert.ok(stillNeeded(captured, [], {}, shots).some((n) => n.startsWith('where it comes from')))
  const looted = { ...captured, kinds: ['looted'] } as GapRow
  assert.deepEqual(stillNeeded(looted, [], {}, shots), [])
})
