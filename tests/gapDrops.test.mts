// Drops missing from a mob (owner asks, 2026-10-18): an item looted from a mob the wiki has, which
// its page lists neither by itself nor by a group holding it; an item in a group is filed as the group.
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { dropGaps } from '../src/shared/gapDrops'
import { gapActions } from '../src/shared/gaps'
import { killIndex, type KillMap } from '../src/shared/kills'
import { wikiPageText } from '../src/shared/wikiPage'
import type { LootEvent } from '../src/shared/types'

const catalog = [
  { page: 'A bandit (Eastern Karana)', name: 'a bandit', drops: ['Cloth Armor', 'Rusty Weapons'] },
  { page: 'A gnoll', name: 'a gnoll', drops: ['Gnoll Fang'] }
]
const groups = { 'Rusty Weapons': ['Rusty Axe', 'Rusty Dagger'], 'Bronze Weapons': ['Bronze Axe'] }
const loot = (item: string, source: string, count?: number): LootEvent => ({ ts: 1, item, source, zone: 'Eastern Karana', ...(count ? { count } : {}) })

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
    ['Hide Mask (a gnoll)', 2, undefined]
  ])
})

test('a drop row copies its known_loot line and points at the mob page', () => {
  const kills = killIndex({ 'a gnoll': { display: 'a gnoll', count: 8 } } as unknown as KillMap)
  const [group, item] = dropGaps([loot('Bronze Axe', 'a gnoll'), loot('Hide Mask', 'a gnoll'), loot('Hide Mask', 'a gnoll')], catalog, groups).sort((a, b) => a.name.localeCompare(b.name))
  assert.equal(wikiPageText(group, [], kills), '<li> [[Bronze Weapons]] </li>\n')
  assert.equal(wikiPageText(item, [], kills), "<li> {{:Hide Mask}} <span class='ddb'>~25% (Drops: 2, Kills: 8)</span> </li>\n")
  assert.equal(gapActions(item, 'unchecked')[0].href, 'https://eqlwiki.com/index.php?title=a_gnoll&action=edit')
})
