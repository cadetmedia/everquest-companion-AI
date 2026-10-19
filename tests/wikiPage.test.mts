// The wiki page a Gaps row copies (owner ask, 2026-10-18), built in the layout of the wiki's own
// `Fire Beetle Eye` page: the era banner, only the fields the log fills, `dropsfrom` by zone.
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { dropsSeen, itemPage, mobFacts, mobPage, spellPage, wikiCoin, wikiPageText } from '../src/shared/wikiPage'
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
  const text = itemPage({ name: 'Bread', drops: [], soldBy: ['Baker Ian'], crafted: true })
  assert.match(text, /\|soldby = \n\n\* \[\[Baker Ian\]\]\n/)
  assert.match(text, /\[\[Category:Vendor Sold\]\]\n\[\[Category:Player Crafted\]\]/)
  const bare = itemPage({ name: 'X', drops: [], soldBy: [], crafted: false })
  assert.equal(bare, '{{Classic Era}}\n<onlyinclude>{{Itempage\n|itemname = X\n|statsblock = \n}}</onlyinclude>\n')
})

test('prices are written the wiki way', () => {
  assert.deepEqual([wikiCoin(27), wikiCoin(40), wikiCoin(1143), wikiCoin(0)], ['2s 7c', '4s', '1p 1g 4s 3c', '0c'])
})

test('drops are counted per zone and mob from the loot ledger; a mob page rates each item by its kills', () => {
  const loot: LootEvent[] = [
    { ts: 1, item: 'Black Lizard Talon', source: 'a lizardman forager', zone: 'The Feerrott' },
    { ts: 2, item: 'black lizard talon', source: 'a lizardman forager', zone: 'The Feerrott', count: 2 },
    { ts: 3, item: 'Black Lizard Talon', source: 'a hatchling', zone: 'The Feerrott' },
    { ts: 4, item: 'Other', source: 'a hatchling', zone: 'The Feerrott' }
  ]
  const kills = killIndex({ 'a lizardman forager': { display: 'a lizardman forager', count: 10 } } as unknown as KillMap)
  assert.deepEqual(dropsSeen('Black Lizard Talon', loot), [
    { zone: 'The Feerrott', mob: 'a lizardman forager', drops: 3 },
    { zone: 'The Feerrott', mob: 'a hatchling', drops: 1 }
  ])
  // On the mob's page, as the wiki keeps drop chances (owner, 2026-10-18).
  const forager: GapRow = { domain: 'mob', name: 'a lizardman forager', kinds: [], count: 1, first: '', last: '', details: { samples: [] } }
  assert.deepEqual(mobFacts(forager, loot, kills).loot, [{ item: 'Black Lizard Talon', drops: 3 }])
  assert.equal(mobFacts(forager, loot, kills).kills, 10)
  assert.match(wikiPageText(forager, loot, kills), /<li> \{\{:Black Lizard Talon\}\} <span class='ddb'>~30% \(Drops: 3, Kills: 10\)<\/span> <\/li>/)
})

test('a mob page names its levels, zones and loot; an NPC-only spell says so', () => {
  const mob = mobPage({ name: 'Hoptor', zones: ['Lower Guk'], levels: [45, 47], loot: [{ item: 'Scalp', drops: 1 }], kills: 0 })
  assert.match(mob, /^\{\{Classic Era\}\}\n\{\{Namedmobpage\n\|name = Hoptor\n\|level = 45 - 47\n\|zone = \[\[Lower Guk\]\]\n\|known_loot = /)
  assert.match(mob, /<li> \{\{:Scalp\}\} <\/li>/)
  assert.match(mob, /\[\[Category:Lower Guk\]\]\n$/)
  const spell = spellPage({ name: 'Flame Jet', npcOnly: true })
  assert.match(spell, /\| ?spellname = Flame Jet/)
  assert.match(spell, /This spell is cast by NPCs only\./)
  assert.match(spell, /\[\[Category:NPC Only Spells\]\]/)
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
