// The Reward Chest a Dungeon Crawl pays out of is no mob (owner, 2026-10-21: it "can drop ANY item
// from ANY mob you killed in the dungeon crawl instance, so that's not valid for a mob drop"). A chest
// payout is a looted item, never a drop of the chest: no page, row or heading names the chest as a mob.
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { dropsSeen, mobFacts, wikiPageText } from '../src/shared/wikiPage'
import { dropGaps, lootedItemNames } from '../src/shared/gapDrops'
import { groupGaps } from '../src/shared/gapGroups'
import { imageGaps } from '../src/shared/gapImages'
import { killIndex, type KillMap } from '../src/shared/kills'
import type { GapRow } from '../src/shared/gaps'
import type { LootEvent } from '../src/shared/types'

const CRAWL = 'Befallen 4 (Refined)'
const loot: LootEvent[] = [
  { ts: 1, item: 'Glowing Widget', source: 'Reward Chest', zone: CRAWL, disposition: 'sold' },
  { ts: 2, item: 'Bone Chips', source: 'Reward Chest', zone: CRAWL },
  { ts: 3, item: 'Bone Chips', source: 'a skeleton', zone: CRAWL }
]

/** A row as the engine served it before the fix, with the chest in its sources. */
const itemRow = (name: string, kinds: string[], sources: string[]): GapRow => ({
  domain: 'item',
  name,
  kinds,
  count: 1,
  first: '',
  last: '',
  details: {
    samples: [],
    sources: { entries: sources.map((s) => ({ name: s, n: 1 })), distinct: sources.length },
    zones: { entries: [{ name: CRAWL, n: 1 }], distinct: 1, all: [CRAWL] }
  }
})

// The zone still stands (owner, 2026-10-21: "yes, the zone still stands as accurate"): dropsfrom
// writes it alone, the shape the wiki's own zone-only blocks have (Runed Velium Battlehammer, Kurn's Tower).
test('Copy wiki page for an item looted only from the chest writes its zone under dropsfrom and no mob', () => {
  assert.deepEqual(dropsSeen('Glowing Widget', loot), [{ zone: CRAWL, mob: '', drops: 1 }])
  const page = wikiPageText(itemRow('Glowing Widget', ['looted'], ['Reward Chest']), loot, {})
  assert.ok(page.includes(`|dropsfrom = \n\n[[${CRAWL}]]\n\n}}`), page)
  assert.ok(page.includes(`[[Category:${CRAWL}]]`), page)
  assert.doesNotMatch(page, /Reward Chest|\n\* /, page)
  // Bought too: the chest is no vendor either.
  const bought = wikiPageText(itemRow('Glowing Widget', ['looted', 'bought'], ['Reward Chest', 'Baker Ian']), loot, {})
  assert.doesNotMatch(bought, /Reward Chest/, bought)
  assert.match(bought, /\[\[Baker Ian\]\]/)
})

test('an item from a mob and the chest in one zone names only the mob under dropsfrom', () => {
  assert.deepEqual(dropsSeen('Bone Chips', loot), [
    { zone: CRAWL, mob: '', drops: 1 },
    { zone: CRAWL, mob: 'a skeleton', drops: 1 }
  ])
  const page = wikiPageText(itemRow('Bone Chips', ['looted'], ['a skeleton']), loot, {})
  assert.ok(page.includes(`|dropsfrom = \n\n[[${CRAWL}]]\n\n* [[a skeleton]]\n\n}}`), page)
  // A chest payout with no zone known places nothing.
  assert.deepEqual(dropsSeen('Glowing Widget', [{ ts: 9, item: 'Glowing Widget', source: 'Reward Chest' }]), [])
})

test('a mob row never lists a chest item as its drop, and the chest files no drop, image or mob heading', () => {
  const kills = killIndex({ 'a skeleton': { display: 'a skeleton', count: 1 } } as unknown as KillMap)
  const skeleton: GapRow = { domain: 'mob', name: 'a skeleton', kinds: [], count: 1, first: '', last: '', details: { samples: [] } }
  assert.deepEqual(mobFacts(skeleton, loot, kills).loot, [{ item: 'Bone Chips', drops: 1 }])
  // Even were the wiki to have a page named Reward Chest, listing nothing and with no image.
  const catalog = [{ name: 'Reward Chest', page: 'Reward Chest', drops: [], noImage: true as const }]
  assert.deepEqual(dropGaps(loot, catalog, {}), [])
  assert.deepEqual(imageGaps({}, loot, catalog), [])
  assert.deepEqual(lootedItemNames(loot), ['Bone Chips'])
  const grouped = groupGaps([itemRow('Glowing Widget', ['looted'], [])], loot)
  assert.deepEqual(grouped.filter((e) => e.kind === 'mob'), [], 'grouped under its zone, no mob heading')
  assert.ok(grouped.some((e) => e.kind === 'zone' && e.zone === CRAWL))
})
