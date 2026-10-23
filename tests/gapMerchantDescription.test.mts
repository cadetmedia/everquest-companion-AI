// A new merchant page's description (owner, 2026-10-23: "why don't the vendors have descriptions, we
// can make a lot of assumptions based on: 1. screenshot ... 2. items sold could tell us the type of
// merchant so description 3. any text they say when hailed"). The item lists are what the owner's
// merchants quoted in Neriak and Oggok on 2026-10-23, 01:55-02:20, read against the committed corpus.
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { itemTrades } from '../src/main/gapItemTrades'
import { catalogStates, descriptionLines, itemsTrade, maskedGreeting, merchantDescription, subtitleSentence } from '../src/shared/gapMerchantDescription'
import { stillNeeded, wikiPageText } from '../src/shared/wikiPage'
import type { GapRow } from '../src/shared/gaps'

/** Main's answer as the renderer keeps it: under the lower-cased name. */
const trades = (items: readonly string[]): Record<string, string[]> =>
  Object.fromEntries(Object.entries(itemTrades(items)).map(([k, v]) => [k.toLowerCase(), v]))
const tradeOf = (items: readonly string[]): string | undefined => itemsTrade(items, trades(items))?.trade

const UKBOG = ['Small Plate Pauldron Mold', 'Small Breastplate Mold', 'Small Plate Greaves Mold', 'Small Plate Boot Mold', 'Small Plate Vambrace Mold', 'Small Plate Helm Mold', 'Small Field Splinted Cloak Mold', 'Small Plate Belt Mold', 'Small Plate Bracer Mold', 'Small Plate Visor Mold', 'Small Plate Gauntlet Mold', 'Small Plate Gorget Mold', 'Rings, Chains, and Arrowheads', 'Metal Tempering Chemicals', 'Ikthars Fine Steel Skin', 'Fireprides Guide to Shield Craft', 'Crude Coal', 'Small Tower Shield Mold', 'Small Targ Shield Mold', 'Small Round Shield Mold', 'Small Kite Shield Mold', 'Small Buckler Mold']
const KAELIN = ['Platinum Bar', 'Fire Emerald', 'Star Ruby', 'Fire Opal', 'Gold Bar', 'Electrum Bar', "Jeweler's Kit", 'Silver Bar', 'Legacy of Jewel Craft']
const BLARGRAAH = ['Yarrow', 'Celandine Herb', 'Valerian Root', 'Wolf Blood', 'Medicine Bag', 'Sage Leaf', 'Night Shade', 'Mullein', 'Mandrake Root', 'Maidenhair Fern', 'Lucerne', 'Figwort', 'Fenugreek', 'Birthwort', 'Benzoin', 'Allspice', 'Agrimony', 'Blue Vervain Bulb']
const DRIP_DROP = ['Spit', 'Loaf of Bread', 'Vinegar', 'Mixing Bowl', 'Jug of Sauces', 'Frosting', 'Spices', 'Muffin', 'Garnish', 'Bottle of Milk', 'Cup of Flour']
const RAUL = ['Regal Weapon Tailoring', 'Glorious Weapon Tailoring', 'Whip Pattern', 'Quiver Pattern', 'Large Sewing Kit', 'Fleeting Quiver Pattern', 'Backpack Pattern', 'How to Sew: Small Sizes', 'How to Sew: Medium Sizes', 'How to Sew: Large Sizes', 'Thimble Mold', 'Needle Mold', 'Tanning Chemicals', 'Tailoring', 'Silk Wristband Template Pattern', 'Silk Tunic Template Pattern', 'Silk Sleeve Template Pattern', 'Silk Robe Template Pattern', 'Silk Shoulderpad Template Pattern', 'Silk Pant Template Pattern']
const TROONI = ['Small Cloth Shirt', 'Small Cloth Pants', 'Small Sewing Kit', 'Small Cloth Gloves', 'Small Cloth Cape', 'How to Sew: Small Sizes', 'Small Cloth Sleeves', 'Small Cloth Cap', 'Small Cloth Wristband', 'Small Cloth Shawl', 'Small Cloth Cord', 'Small Cloth Veil', 'Small Cloth Choker']

test('the corpus names an item\'s tradeskills by its recipes, grouped or by the skill\'s page', () => {
  // Named by pages that state the trade either way in every data refresh so far: a skill page
  // link (Agrimony) and a grouped line or link (Sage Leaf's page changed between the two, 2026-10-23).
  const t = itemTrades(['Agrimony', 'Sage Leaf', 'Small Plate Helm Mold', 'No Such Item Anywhere'])
  assert.deepEqual(t['Agrimony'], ['Alchemy'])
  assert.ok(t['Sage Leaf'].includes('Baking'), String(t['Sage Leaf']))
  assert.deepEqual(t['Small Plate Helm Mold'], ['Blacksmithing'])
  assert.deepEqual(t['No Such Item Anywhere'], [])
})

test('the owner\'s merchants: a clear majority of what each sold names its trade; finished cloth armor names none', () => {
  assert.equal(tradeOf(UKBOG), 'Smithing')
  assert.equal(tradeOf(KAELIN), 'Jewelcraft')
  assert.equal(tradeOf(BLARGRAAH), 'Alchemy')
  assert.equal(tradeOf(DRIP_DROP), 'Baking')
  // Most of Raul's patterns are not in the corpus: their names say tailoring.
  assert.equal(tradeOf(RAUL), 'Tailoring')
  assert.equal(tradeOf(TROONI), undefined, 'two sewing items of thirteen is no majority')
})

test('no majority, or too few items naming a trade, says nothing', () => {
  assert.equal(itemsTrade(['Small Plate Helm Mold', 'Sage Leaf'], trades(['Small Plate Helm Mold', 'Sage Leaf'])), undefined, 'two items')
  const tie = { a: ['Baking'], b: ['Baking'], c: ['Brewing'], d: ['Brewing'] }
  assert.equal(itemsTrade(['A', 'B', 'C', 'D'], tie), undefined)
})

test('a nameplate subtitle is the wiki\'s `<trade> merchant.`; a bare Merchant says nothing', () => {
  assert.equal(subtitleSentence('(Tailoring Supplies)'), 'Tailoring supplies merchant.')
  assert.equal(subtitleSentence('Tailoring Supplies'), 'Tailoring supplies merchant.')
  assert.equal(subtitleSentence('Weapons Merchant'), 'Weapons merchant.')
  assert.equal(subtitleSentence('(Merchant)'), undefined)
})

test('a hail answer writes the player as `____`, as the cached pages do', () => {
  assert.equal(maskedGreeting('Good day, Drywrought! Have you visited Taria?', ['Drywrought', 'Primitive']), 'Good day, ____! Have you visited Taria?')
})

const row = (extra: object): GapRow =>
  ({ domain: 'merchant', name: 'Konro Strongfoot', kinds: ['quoted'], count: 1, first: '', last: '', details: { samples: [] }, ...extra }) as GapRow

test('Copy wiki page: the nameplate first, then the hail answer, in the cached pages\' form', () => {
  const r = row({ itemsSold: UKBOG.map((item) => ({ item })), greeting: "Aye, you looking for materials or tools of the trade? I have it all! Don't mind Ukbog, Drywrought." })
  const extras = { nameplate: () => 'Smithing Supplies', itemTrades: trades(UKBOG), ownNames: ['Drywrought'] }
  const text = wikiPageText(r, [], {}, extras)
  assert.ok(
    text.includes("| description = \n\nSmithing supplies merchant.\n\n:You say, 'Hail Konro Strongfoot'\n\nKonro Strongfoot says, 'Aye, you looking for materials or tools of the trade? I have it all! Don't mind Ukbog, ____.'\n\n| items_sold"),
    text
  )
  assert.deepEqual(descriptionLines(r, extras), [
    'Description: Smithing supplies merchant. (from its nameplate)',
    "Hail answer, quoted in the description: 'Aye, you looking for materials or tools of the trade? I have it all! Don't mind Ukbog, ____.'"
  ])
})

test('without a nameplate the items say the trade, and the details say how many', () => {
  const r = row({ itemsSold: UKBOG.map((item) => ({ item })) })
  assert.equal(merchantDescription(r, { itemTrades: trades(UKBOG) })?.text, 'Smithing supplies merchant.')
  assert.match(descriptionLines(r, { itemTrades: trades(UKBOG) })[0] ?? '', /^Description: Smithing supplies merchant\. \(from what it sold: \d+ of 22 items are smithing supplies\)$/)
})

test('a page that exists keeps its description; nothing known leaves the field open', () => {
  const r = row({ itemsSold: UKBOG.map((item) => ({ item })), greeting: 'Aye.' })
  assert.equal(merchantDescription(r, { itemTrades: trades(UKBOG), isMob: () => true }), undefined)
  assert.ok(wikiPageText(row({}), [], {}).includes('| description = \n'))
})

// The owner's Merchants rows (2026-10-23): "needs: level (/con)" on every one though each was conned.
// The engine now serves a Merchants row its name's cons (gaps_stock.rs); the page and the needs read them.
test('a Merchants row\'s cons give its page the level, and the needs no longer ask for it', () => {
  const r = row({ name: 'Mindiinya N`Zar', details: { samples: [], cons: { entries: [{ name: 'L50 ally', n: 1 }], distinct: 1 } } })
  assert.ok(wikiPageText(r, [], {}).includes(`| ${'level'.padEnd(17)} = 50\n`))
  assert.ok(!stillNeeded(r, [], {}).some((n) => n.startsWith('level')))
})

test('an Update row for a merchant page asks only for what the page does not state', () => {
  const catalog = [
    { name: 'The Great Zultor', page: 'The Great Zultor', level: '50', loc: [{ ns: -319, ew: 141 }], image: 'npc_the_great_zultor.png' },
    { name: 'Konro Strongfoot', page: 'Konro Strongfoot', level: '50', image: 'npc_konro_strongfoot.png', noImage: true as const }
  ]
  const seen = { isMob: (n: string) => catalog.some((m) => m.name === n), pageStates: catalogStates(catalog) }
  assert.deepEqual(stillNeeded(row({ name: 'The Great Zultor' }), [], {}, seen), [])
  assert.deepEqual(stillNeeded(row({ name: 'Konro Strongfoot' }), [], {}, seen), ['location (/loc beside a hail or /con)', 'image (a screenshot)'])
  assert.ok(stillNeeded(row({ name: 'Mindiinya N`Zar' }), [], {}, seen).includes('level (/con)'), 'a new page asks for all of it')
})

// Owner, 2026-10-23: "why is this description missing when i update from the app". Konro Strongfoot's
// page states a description, a quest and a location; a whole page pasted over it would drop them.
test('an existing page\'s merchant row copies only what to add to it: no new page, no description', () => {
  const catalog = [{ name: 'Konro Strongfoot', page: 'Konro Strongfoot', level: '50', loc: [{ ns: -322, ew: 251 }] }]
  const seen = { isMob: (n: string) => n === 'Konro Strongfoot', pageStates: catalogStates(catalog), itemTrades: trades(UKBOG), nameplate: () => 'Smithing Supplies' }
  const r = row({ itemsSold: [{ item: 'Smithy Hammer' }, { item: 'Crude Coal' }], greeting: 'Aye.', details: { samples: [], cons: { entries: [{ name: 'L50 ally', n: 1 }], distinct: 1 } } })
  const text = wikiPageText(r, [], {}, seen)
  assert.ok(!text.includes('{{MerchantPage') && !text.includes('| description ='), text)
  assert.equal(
    text,
    `Add to the existing page (Konro Strongfoot): switch its template to MerchantPage, then fill these fields where it leaves them blank.\n\n| ${'class'.padEnd(17)} = [[Merchant]]\n| items_sold = \n\n<ul><li> {{:Smithy Hammer}}\n</li><li> {{:Crude Coal}}\n</li></ul>\n`
  )
  // A page the catalog shows without a level takes the con's.
  const bare = wikiPageText(r, [], {}, { ...seen, pageStates: catalogStates([{ name: 'Konro Strongfoot', page: 'Konro Strongfoot' }]) })
  assert.ok(bare.includes(`| ${'level'.padEnd(17)} = 50\n`), bare)
})
