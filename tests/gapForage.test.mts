// Item page facts, phase 2 (owner, 2026-10-21: "if we can prove it was foraged lets make sure the
// item copy wiki code gets that information"): a known item the log foraged, whose page lacks the
// zone or [[Category:Foraged]], is an Items row whose copy is the lines to add, in the spelling the
// new-page copy uses. Fixtures, not the corpus: items.json gains the fields on local-data-refresh.
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { COMMON_FORAGE, forageAddText, forageUpdateOf, isCommonForage, withForageRows, type ItemPageForage } from '../src/shared/gapForage'
import { gapActions, type GapRow, type GapsSnap } from '../src/shared/gaps'
import { itemPage, wikiPageText } from '../src/shared/wikiPage'
import { catalogZoneCounts, wikiZoneNamer } from '../src/shared/gapWikiZone'
import { itemPageForage } from '../src/main/gapItemForage'

const CATALOG = [{ zones: ['Kedge Keep'] }, { zones: ['The Overthere'] }, { zones: ['Cazic Thule'] }, { zones: ['Qeynos Hills'] }]
const zoneName = wikiZoneNamer(catalogZoneCounts(CATALOG))

function proof(name: string, zones: string[]): GapRow {
  return {
    domain: 'forage' as GapRow['domain'],
    name,
    kinds: ['foraged'],
    count: zones.length,
    first: '2026-10-20 10:00:00',
    last: '2026-10-21 10:00:00',
    details: { samples: [], zones: { entries: zones.map((z) => ({ name: z, n: 1 })), distinct: zones.length, all: [...zones].sort() }, forageZones: { entries: zones.map((z) => ({ name: z, n: 1 })), distinct: zones.length, all: [...zones].sort() } }
  }
}

const page = (p: Partial<ItemPageForage> & { page: string }): ItemPageForage => ({ zones: [], category: false, ...p })

test('a page lacking a forage zone or the category asks for exactly those; a page saying it all asks nothing', () => {
  const fish = proof('Fresh Fish', ['Kedge Keep 2 (Refined)'])
  assert.deepEqual(forageUpdateOf(fish, page({ page: 'Fresh Fish' }), zoneName), { page: 'Fresh Fish', zones: ['Kedge Keep'], noField: true, category: true })
  // The page's own spelling of the zone, a leading "the" and case folded, covers it.
  const egg = proof('Cracked Shell', ['The Overthere'])
  assert.equal(forageUpdateOf(egg, page({ page: 'Cracked Shell', zones: ['Overthere'], category: true }), zoneName), null)
  assert.deepEqual(forageUpdateOf(egg, page({ page: 'Cracked Shell', zones: ['Overthere'] }), zoneName), { page: 'Cracked Shell', zones: [], noField: false, category: true })
  // One place under two spellings: item pages write `Northern Karana`, the catalog `Northern Plains of Karana`.
  const cabbage = proof('Wild Cabbage', ['The Northern Plains of Karana'])
  const karana = wikiZoneNamer(catalogZoneCounts([{ zones: ['Northern Plains of Karana'] }, { zones: ['Northern Karana'] }]))
  assert.equal(forageUpdateOf(cabbage, page({ page: 'Wild Cabbage', zones: ['Northern Karana'], category: true }), karana), null)
  // `Various` and "most zones" cover every zone; `?` covers none.
  const fruit = proof('Fruit', ['Qeynos Hills'])
  assert.equal(forageUpdateOf(fruit, page({ page: 'Fruit', note: 'Various', category: true }), zoneName), null)
  assert.equal(forageUpdateOf(fruit, page({ page: 'Fruit', note: 'This item can be foraged in most zones.', category: true }), zoneName), null)
  assert.deepEqual(forageUpdateOf(fruit, page({ page: 'Fruit', note: '?', category: true }), zoneName)?.zones, ['Qeynos Hills'])
  // No page, or main not answered yet: no row.
  assert.equal(forageUpdateOf(fruit, null, zoneName), null)
  assert.equal(forageUpdateOf(fruit, undefined, zoneName), null)
})

test('the proof rows leave the snapshot; the pages that lack something come back as Items rows, counted', () => {
  const snap: GapsSnap = {
    rows: [proof('Fresh Fish', ['Kedge Keep']), proof('Cracked Shell', ['The Overthere'])],
    totals: { item: 3, mob: 0, spell: 0, merchant: 0, forage: 2 } as GapsSnap['totals'],
    seen: { item: 5, mob: 0, spell: 0, merchant: 0, forage: 2 } as GapsSnap['seen']
  }
  const forage = new Map([
    ['fresh fish', page({ page: 'Fresh Fish' })],
    ['cracked shell', page({ page: 'Cracked Shell', zones: ['The Overthere'], category: true })]
  ])
  const out = withForageRows(snap, forage, CATALOG)
  assert.deepEqual(out.rows.map((r) => `${r.domain} ${r.name}`), ['item Fresh Fish'])
  assert.equal(out.totals.item, 4)
  assert.equal('forage' in out.totals || 'forage' in out.seen, false)
  // Before main answers, the proof rows still leave and nothing stands in for them.
  assert.deepEqual(withForageRows(snap, undefined, CATALOG).rows, [])
})

test('the copy is the lines to add, in the new-page copy\'s spelling, and the chip opens the page', () => {
  const fish = { ...proof('Fresh Fish', ['Kedge Keep']), domain: 'item' as const, forageUpdate: { page: 'Fresh Fish', zones: ['Kedge Keep'], noField: true, category: true } }
  assert.equal(wikiPageText(fish, [], {}), '|foraged = \n\n* [[Kedge Keep]]\n\n[[Category:Foraged]]\n[[Category:Kedge Keep]]\n')
  const [chip] = gapActions(fish, 'hasPage')
  assert.equal(chip.label, 'Add to item page')
  assert.match(chip.why, /does not list Kedge Keep under foraged and is not in Category:Foraged/)
  assert.equal(chip.href, 'https://eqlwiki.com/index.php?title=Fresh_Fish&action=edit')
  // A page listing other zones gets the bullet alone; one lacking only the category, the category alone.
  assert.equal(forageAddText({ page: 'X', zones: ['Kedge Keep'], noField: false, category: false }), '* [[Kedge Keep]]\n\n[[Category:Kedge Keep]]\n')
  assert.equal(forageAddText({ page: 'X', zones: [], noField: false, category: true }), '[[Category:Foraged]]\n')
})

test('Temple of Cazic-Thule is written the same way on a new page and an update row', () => {
  const temple = proof('Snake Scale', ['Temple of Cazic-Thule'])
  const update = forageUpdateOf(temple, page({ page: 'Snake Scale', zones: ['Kedge Keep'], category: true }), zoneName)
  assert.ok(update !== null)
  const added = forageAddText(update)
  const fresh = itemPage({ name: 'Snake Scale', drops: [], soldBy: [], crafted: false, foragedIn: [zoneName('Temple of Cazic-Thule')] })
  for (const line of ['* [[Cazic Thule (Zone)|Cazic Thule]]', '[[Category:Cazic Thule]]']) {
    assert.ok(added.includes(line), added)
    assert.ok(fresh.includes(line), fresh)
  }
})

test('main answers each name from its page record, null when there is none', () => {
  const corpus = {
    fruit: { page: 'Fruit', foraged: ['Misty Thicket'], foragedNote: 'Various', foragedCategory: true },
    'fresh fish': { page: 'Fresh Fish' }
  }
  assert.deepEqual(itemPageForage(['Fruit', 'Fresh Fish +2', 'No Such Item'], corpus), {
    Fruit: { page: 'Fruit', zones: ['Misty Thicket'], note: 'Various', category: true },
    'Fresh Fish +2': { page: 'Fresh Fish', zones: [], category: false },
    'No Such Item': null
  })
})

test('common forage (named default, COMMON_FORAGE): seen in 5+ places, or a page listing 10+ zones, asks for no zone, only a missing category', () => {
  const five = ['Qeynos Hills', 'Kedge Keep', 'The Overthere', 'Cazic Thule', 'Befallen']
  // Five places, tiers folded: Kedge Keep 2 (Refined) is Kedge Keep, so four places is not common.
  const four = proof('Fishing Grubs', ['Qeynos Hills', 'Kedge Keep', 'Kedge Keep 2 (Refined)', 'The Overthere', 'Cazic Thule'])
  assert.equal(COMMON_FORAGE.seenPlaces, 5)
  assert.deepEqual(forageUpdateOf(four, page({ page: 'Fishing Grubs', category: true }), zoneName)?.zones, ['Cazic Thule', 'Kedge Keep', 'Qeynos Hills', 'The Overthere'])
  const pod = proof('Pod of Water', five)
  assert.equal(forageUpdateOf(pod, page({ page: 'Pod of Water', zones: ['Qeynos Hills'], category: true }), zoneName), null)
  // The category is still owed.
  assert.deepEqual(forageUpdateOf(pod, page({ page: 'Pod of Water', zones: ['Qeynos Hills'] }), zoneName), { page: 'Pod of Water', zones: [], noField: false, category: true })
  // A page that already lists ten zones: a new one is no update, even seen in one place.
  const listed = Array.from({ length: COMMON_FORAGE.pageZones }, (_, i) => `Zone ${String(i)}`)
  const berries = proof('Berries', ['Qeynos Hills'])
  assert.equal(isCommonForage(['Qeynos Hills'], page({ page: 'Berries', zones: listed })), true)
  assert.equal(forageUpdateOf(berries, page({ page: 'Berries', zones: listed, category: true }), zoneName), null)
  assert.deepEqual(forageUpdateOf(berries, page({ page: 'Berries', zones: listed.slice(1), category: true }), zoneName)?.zones, ['Qeynos Hills'])
})
