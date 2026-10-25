// Drops missing from a mob (owner asks, 2026-10-18): an item looted from a mob the wiki has, which
// its page lists neither by itself nor by a group holding it; an item in a group is filed as the group.
import { test } from 'node:test'
import { readFileSync } from 'node:fs'
import assert from 'node:assert/strict'
import { dropGaps } from '../src/shared/gapDrops'
import { gapActions } from '../src/shared/gaps'
import { gapJob } from '../src/shared/gapJob'
import { groupGaps } from '../src/shared/gapGroups'
import { killIndex, type KillMap } from '../src/shared/kills'
import { wikiPageText } from '../src/shared/wikiPage'
import type { LootEvent } from '../src/shared/types'
import { parseMobPage } from '../scripts/sources/mobPage'

const catalog = [
  { page: 'A bandit (Eastern Karana)', name: 'a bandit', drops: ['Cloth Armor', 'Rusty Weapons'] },
  { page: 'A gnoll', name: 'a gnoll', drops: ['Gnoll Fang'] }
]
const groups = { 'Rusty Weapons': ['Rusty Axe', 'Rusty Dagger'], 'Bronze Weapons': ['Bronze Axe'] }
// Each call is its own corpse: a loot line one second after the last (one corpse is one drop).
let clock = 0
const loot = (item: string, source: string, count?: number): LootEvent => ({ ts: (clock += 1000), item, source, zone: 'Eastern Karana', ...(count ? { count } : {}) })

test('listed items and listed groups are no gap; a group the page lacks is filed as the group; a loose item as itself', () => {
  const rows = dropGaps(
    [
      loot('Rusty Axe +2', 'a bandit'), // its group is listed
      loot('Gnoll Fang', 'a gnoll'), // listed by name
      loot('Bronze Axe', 'a gnoll'), // its group is not listed
      loot('Bronze Axe', 'a gnoll'),
      loot('Hide Mask', 'a gnoll', 2), // in no group
      loot('Anything', 'a mob the wiki lacks')
    ],
    catalog,
    groups
  )
  assert.deepEqual(rows.map((r) => [r.name, r.count, r.details.drops?.entries.map((e) => e.name)]), [
    ['Bronze Weapons (a gnoll)', 2, ['Bronze Axe']],
    // One corpse with a stack of two is one drop.
    ['Hide Mask (a gnoll)', 1, undefined]
  ])
})

test('a member the page lists counts toward every group row of its, not only its first group', () => {
  // Fine Axe is in both groups and listed by itself; Bronze Axe (second group only) is not listed.
  const sets = { 'Fine Weapons': ['Fine Axe'], 'Bronze Weapons': ['Bronze Axe', 'Fine Axe'] }
  const page = [{ page: 'An orc', name: 'an orc', drops: ['Fine Axe'] }]
  const rows = dropGaps([loot('Bronze Axe', 'an orc'), loot('Fine Axe', 'an orc')], page, sets)
  assert.deepEqual(rows.map((r) => [r.name, r.count]), [['Bronze Weapons (an orc)', 2]])
})

test('a drop row copies its known_loot line and points at the mob page', () => {
  const kills = killIndex({ 'a gnoll': { display: 'a gnoll', count: 16 } } as unknown as KillMap)
  const [group, item] = dropGaps([loot('Bronze Axe', 'a gnoll'), loot('Hide Mask', 'a gnoll'), loot('Hide Mask', 'a gnoll')], catalog, groups).sort((a, b) => a.name.localeCompare(b.name))
  // A group line carries its rate the way the wiki writes one (review D2): 1 corpse over 16 kills.
  assert.equal(wikiPageText(group, [], kills), "<li> [[Bronze Weapons]] <span class='drare'>(Rare)</span> <span class='ddb'>[Overall: ~6.3%]</span> </li>\n")
  assert.equal(wikiPageText(item, [], kills), "<li> {{:Hide Mask}} <span class='drare'>(Rare)</span> <span class='ddb'>[Overall: ~12.5%]</span> </li>\n")
  // One kill is no rate (owner, 2026-10-20: "I killed this guy 1 time"): the item alone.
  const few = killIndex({ 'a gnoll': { display: 'a gnoll', count: 1 } } as unknown as KillMap)
  assert.equal(wikiPageText(item, [], few), '<li> {{:Hide Mask}} </li>\n')
  assert.equal(gapActions(item, 'unchecked')[0].href, 'https://eqlwiki.com/index.php?title=A_gnoll&action=edit')
})

test('a group line rates the corpses that dropped ANY member over the mob kills; no kills, or more drops than kills, no rate', () => {
  const set = { 'Bronze Weapons': ['Bronze Axe', 'Bronze Dagger'] }
  const at = (ts: number, item: string): LootEvent => ({ ts, item, source: 'a gnoll', zone: 'Eastern Karana' })
  // Two members off one corpse (one second) are one drop; a member off another corpse is a second.
  const [row] = dropGaps([at(5000, 'Bronze Axe'), at(5000, 'Bronze Dagger'), at(9000, 'Bronze Dagger +1')], catalog, set)
  assert.equal(row.count, 2)
  const kills = (n: number): KillMap => killIndex({ 'a gnoll': { display: 'a gnoll', count: n } } as unknown as KillMap)
  assert.equal(wikiPageText(row, [], kills(4)), '<li> [[Bronze Weapons]] </li>\n', 'under ten kills: no rate')
  assert.equal(wikiPageText(row, [], kills(10)), "<li> [[Bronze Weapons]] <span class='drare'>(Rare)</span> <span class='ddb'>[Overall: ~20%]</span> </li>\n")
  // Anything the log has no answer for is left off (owner, 2026-10-19).
  assert.equal(wikiPageText(row, [], {}), '<li> [[Bronze Weapons]] </li>\n')
  assert.equal(wikiPageText(row, [], kills(1)), '<li> [[Bronze Weapons]] </li>\n')
})

test('a drop says which page lacks it: the mob page always, the item page when its dropsfrom does not name the mob', () => {
  const itemMobs = new Map([['hide mask', ['a gnoll']], ['wolf pelt', ['a wolf']]])
  const rows = dropGaps([loot('Hide Mask', 'a gnoll'), loot('Wolf Pelt +3', 'a gnoll'), loot('Bronze Axe', 'a gnoll')], catalog, groups, { itemMobs })
  const by = new Map(rows.map((r) => [r.name, r]))
  // The +N is the same page: the row is filed under the base item.
  assert.deepEqual([...by.keys()].sort(), ['Bronze Weapons (a gnoll)', 'Hide Mask (a gnoll)', 'Wolf Pelt (a gnoll)'])
  assert.deepEqual(gapActions(by.get('Hide Mask (a gnoll)')!, 'unchecked').map((a) => a.label), ['Add to mob page'])
  const pelt = gapActions(by.get('Wolf Pelt (a gnoll)')!, 'unchecked')
  assert.deepEqual(pelt.map((a) => [a.label, a.href]), [
    ['Add to mob page', 'https://eqlwiki.com/index.php?title=A_gnoll&action=edit'],
    ['Add to item page', 'https://eqlwiki.com/index.php?title=Wolf_Pelt&action=edit']
  ])
  // A group has no single item page to point at.
  assert.equal(by.get('Bronze Weapons (a gnoll)')!.itemPage, undefined)
})

test('a server-wide drop - looted from 10+ mobs, tied by the wiki to at most 2 - is left out; one the wiki ties widely stays', () => {
  const mobs = Array.from({ length: 10 }, (_, i) => ({ page: `Mob ${String(i)}`, name: `mob ${String(i)}`, drops: ['Gnoll Fang'] }))
  const both = [...mobs.map((m) => loot('Shiny Pebble', m.name)), ...mobs.map((m) => loot('Fire Opal', m.name))]
  // A mote never makes a row at all (anyMobDrop); this pins the count rule, on an ordinary item.
  // Fire Opal's item page names 3 mobs: tied to 3, so not server-wide.
  const itemMobs = new Map([['shiny pebble', []], ['fire opal', ['x', 'y', 'z']]])
  const names = (im?: Map<string, string[]>): string[] => [...new Set(dropGaps(both, mobs, groups, { itemMobs: im }).map((r) => r.name.split(' (')[0]))]
  assert.deepEqual(names(itemMobs), ['Fire Opal'])
  // Before main answers, nothing is left out.
  assert.deepEqual(names().sort(), ['Fire Opal', 'Shiny Pebble'])
})

test('grouped, a mob heading holds its drop rows, so one copy gives every line its page lacks', () => {
  const rows = dropGaps([loot('Bronze Axe', 'a gnoll'), loot('Hide Mask', 'a gnoll')], catalog, groups)
  const heading = groupGaps(rows, []).find((e) => e.kind === 'mob')
  assert.equal(heading?.kind === 'mob' ? heading.mob : '', 'a gnoll')
  const lines = heading?.kind === 'mob' ? heading.rows.map((r) => wikiPageText(r, [], {})).join('') : ''
  assert.equal(lines, '<li> [[Bronze Weapons]] </li>\n<li> {{:Hide Mask}} </li>\n')
})

/** A cached page as mobs.json would hold it with each loot line's `[Overall: x%]` beside its drop. */
function pageOf(title: string, file: string): Parameters<typeof dropGaps>[1][number] {
  const text = readFileSync(new URL(`./fixtures/${file}`, import.meta.url), 'utf8')
  const page = parseMobPage(title, text) ?? assert.fail('a mob page')
  const rates = new Map([...text.matchAll(/\{\{:([^}]+)\}\}.*?\[Overall: ([\d.]+)%\]/g)].map((m) => [m[1].trim(), Number(m[2])]))
  return { ...page, dropRates: (page.drops ?? []).map((d) => rates.get(d) ?? null) }
}

test('drop groups are standardized: only the group line is offered, with the page member lines as an optional cleanup (A Cracked Skeleton)', () => {
  // The cached wiki page, cut to its name and four of its loot lines: Bone Chips and three Rusty weapons, one by one.
  const text = readFileSync(new URL('./fixtures/mob-page-a-cracked-skeleton.wikitext', import.meta.url), 'utf8')
  const page = parseMobPage('A Cracked Skeleton', text) ?? assert.fail('a mob page')
  assert.deepEqual(page.drops, ['Bone Chips', 'Rusty Short Sword', 'Rusty Axe', 'Rusty Mace'])
  const sets = { 'Rusty Weapons': ['Rusty Axe', 'Rusty Halberd', 'Rusty Mace', 'Rusty Short Sword', 'Worn Great Staff'], 'Cloth Armor': ['Cloth Cap', 'Cloth Gloves'] }
  const rows = dropGaps(
    [
      loot('Rusty Axe +1', 'a cracked skeleton'), // listed by name: nothing missing
      loot('Rusty Halberd', 'a cracked skeleton'), // a member the page lacks
      loot('Worn Great Staff', 'a cracked skeleton'),
      loot('Cloth Cap', 'a cracked skeleton') // its group has no member on the page: the group's own line
    ],
    [page],
    sets
  )
  // Only the group line (owner, 2026-10-21), never a member's; the Rusty row names the page's three lines.
  assert.deepEqual(rows.map((r) => [r.name, r.details.drops?.entries.map((e) => e.name), r.replaces?.lines]).sort(), [
    ['Cloth Armor (a cracked skeleton)', ['Cloth Cap'], undefined],
    ['Rusty Weapons (a cracked skeleton)', ['Rusty Halberd', 'Worn Great Staff', 'Rusty Axe +1'], ['Rusty Short Sword', 'Rusty Axe', 'Rusty Mace']]
  ])
  const rusty = rows.find((r) => r.replaces !== undefined) ?? assert.fail('a group row')
  assert.equal(gapJob(rusty), 'update')
  assert.deepEqual(gapActions(rusty, 'unchecked').map((a) => [a.label, a.why]), [
    [
      'Add to mob page',
      "The wiki page for A Cracked Skeleton lists neither Rusty Weapons nor the one you looted. Optional: merge its 3 lines (Rusty Short Sword, Rusty Axe, Rusty Mace) into one [[Rusty Weapons]] line."
    ]
  ])
  // Its page states no `[Overall: x%]` (the older `[2] 1x 25% (7%)` shape): the log's rate, here none.
  assert.equal(rusty.replaces?.rate, undefined)
  const lines = rows.map((r) => wikiPageText(r, [], {})).sort()
  assert.deepEqual(lines, ['<li> [[Cloth Armor]] </li>\n', '<li> [[Rusty Weapons]] </li>\n'])
  // A page that lacks nothing gets no row: collapsing its lines alone is formatting (owner, 2026-10-21).
  assert.deepEqual(dropGaps([loot('Rusty Axe', 'a cracked skeleton'), loot('Rusty Mace', 'a cracked skeleton')], [page], sets), [])
})

test("a group row's line takes the page's member rates summed (A lizard man scout: Large Cloth 12.4%, Rusty 22.9%)", () => {
  const page = pageOf('A lizard man scout', 'mob-page-a-lizard-man-scout.wikitext')
  const sets = {
    'Rusty Weapons': ['Cracked Staff', 'Rusty Axe', 'Rusty Battle Axe', 'Rusty Long Sword', 'Rusty Mace', 'Rusty Rapier', 'Rusty Scythe', 'Rusty Shortened Spear', 'Rusty Spear', 'Rusty Two Handed Sword', 'Rusty Warhammer', 'Worn Great Staff'],
    'Large Cloth Armor': ['Large Cloth Cap', 'Large Cloth Cape', 'Large Cloth Choker', 'Large Cloth Cord', 'Large Cloth Gloves', 'Large Cloth Pants', 'Large Cloth Sandals', 'Large Cloth Shawl', 'Large Cloth Shirt', 'Large Cloth Sleeves', 'Large Cloth Veil', 'Large Cloth Wristband']
  }
  const at = (item: string): LootEvent => loot(item, 'a lizardman scout')
  // Rusty Axe and Large Cloth Cape are not on the page; Rusty Mace, Rusty Knuckles (in no group) and Lizard Meat are.
  const rows = dropGaps([at('Rusty Axe'), at('Rusty Mace'), at('Large Cloth Cape'), at('Rusty Knuckles'), at('Lizard Meat')], [page], sets)
  const by = new Map(rows.map((r) => [r.name, r]))
  assert.deepEqual([...by.keys()].sort(), ['Large Cloth Armor (a lizardman scout)', 'Rusty Weapons (a lizardman scout)'])
  const cloth = by.get('Large Cloth Armor (a lizardman scout)')!
  const rusty = by.get('Rusty Weapons (a lizardman scout)')!
  assert.equal(cloth.replaces?.lines.length, 11)
  const lines = rusty.replaces?.lines ?? []
  assert.equal(lines.length, 11)
  assert.ok(lines.includes('Worn Great Staff') && lines.includes('Cracked Staff') && !lines.includes('Rusty Knuckles'))
  assert.equal(wikiPageText(cloth, [], {}), "<li> [[Large Cloth Armor]] <span class='drare'>(Rare)</span> <span class='ddb'>[Overall: ~12.4%]</span> </li>\n")
  assert.equal(wikiPageText(rusty, [], {}), "<li> [[Rusty Weapons]] <span class='drare'>(Rare)</span> <span class='ddb'>[Overall: ~22.9%]</span> </li>\n")
  // Without the page's rates (data that does not carry them yet), the log's rate: 1 corpse over 10 kills.
  const bare = dropGaps([at('Rusty Axe')], [{ ...page, dropRates: undefined }], sets)[0]
  assert.equal(bare.replaces?.rate, undefined)
  const kills = killIndex({ 'a lizardman scout': { display: 'a lizardman scout', count: 10 } } as unknown as KillMap)
  assert.equal(wikiPageText(bare, [], kills), "<li> [[Rusty Weapons]] <span class='drare'>(Rare)</span> <span class='ddb'>[Overall: ~10%]</span> </li>\n")
  // Only listed members looted: nothing missing, no row.
  assert.deepEqual(dropGaps([at('Rusty Mace'), at('Large Cloth Cap')], [page], sets), [])
})

test("A LOOTED NAME THE WIKI REDIRECTS IS THE ITEM ITS PAGE LISTS (OWNER, 2026-10-22: HALFLING BLOOD IS VIAL OF HALFLING BLOOD)", () => {
  const mobs = [{ page: 'Leatherfoot Captain', name: 'Leatherfoot Captain', drops: ['Vial of Halfling Blood', 'Rusty Weapons'] }]
  const aliases = { 'Halfling Blood': 'Vial of Halfling Blood', 'Blunt Thing': 'Rusty Axe' }
  const rows = dropGaps(
    [
      loot('Halfling Blood', 'Leatherfoot Captain'), // redirects to a listed item
      loot('Blunt Thing', 'Leatherfoot Captain'), // redirects to a member of a listed group
      loot('Halfling Toe', 'Leatherfoot Captain') // no redirect: still a gap
    ],
    mobs,
    groups,
    { aliases }
  )
  assert.deepEqual(rows.map((r) => r.name), ['Halfling Toe (Leatherfoot Captain)'])
  // Without the redirect it is a gap, under the looted name.
  assert.deepEqual(dropGaps([loot('Halfling Blood', 'Leatherfoot Captain')], mobs, groups).map((r) => r.name), ['Halfling Blood (Leatherfoot Captain)'])
})
