// LOOT-TABLE SORT TEST: the grouped Loot table's two orders (JOS-91), and the tie behaviour the
// EQ log makes the common case rather than the corner.
//
// Pins:
//   - "Times looted" is still the DEFAULT and still means count-descending, so adding recency
//     beside it did not quietly re-order the table everyone already has;
//   - "Last looted" is newest-group-first — the "what did I just pick up" question the Loot
//     window could not answer before;
//   - THE TIE CASE IS THE POINT. EQ log timestamps are SECOND-resolution, so one corpse yielding
//     three items writes three lines with the SAME ts. Both orders must therefore be TOTAL: each
//     bottoms out in the item name, and neither depends on input order. (Before this change the
//     count order fell through to Map insertion order on a full tie.)
//   - the two keys genuinely disagree — a single recent pickup outranks a long-ago grind under
//     recency and loses to it under count, which is the whole reason to offer both.
//
// A CLAIM THIS FILE USED TO MAKE, AND DOES NOT ANY MORE (JOS-345). There was a test here for the
// FAVORITES PIN — the stable second pass `groupLootRows` ran after the comparator, lifting starred
// items into a block on top. The favorite star left the loot window on the owner's ruling and the
// pin left with it, so the claim is deleted rather than weakened: `groupLootRows` runs exactly one
// pass now, and the totality test below is the whole statement of what the grouped table's order
// is. A removal removes its claims.
//
// Why the sort lives in its own module and is tested here rather than through `groupLootRows`:
// lootGrouping imports lootItemData → data/index → `@shared/profiles`, a value import that does
// not resolve outside the bundler, so node cannot load it (measured: MODULE_NOT_FOUND). Same
// pure-seam reasoning questSort.test.mts records for the quest orders.
//
// Run: `npm test`.

import { test } from 'node:test'
import assert from 'node:assert/strict'
import {
  compareLootRows,
  sortLootRows,
  isLootSortKey,
  naturalDir,
  nextLootSort,
  DEFAULT_LOOT_SORT,
  type LootSort,
  type LootSortKey,
  type SortableLootRow
} from '../src/renderer/src/features/loot/lootSort'

/** Every column the grouped table sorts on (the header's own list). */
const KEYS: readonly LootSortKey[] = ['item', 'count', 'inventory', 'source', 'zones', 'recent']

/** A column in its first-click direction, or the one given. */
const by = (key: LootSortKey, dir = naturalDir(key)): LootSort => ({ key, dir })

/** A grouped row, as `groupLootRows` builds them — only the three fields the sort reads. */
function row(item: string, count: number, last: number): SortableLootRow {
  return { item, count, last }
}

const names = (list: SortableLootRow[]): string[] => list.map((r) => r.item)

test('times looted is still the default order', () => {
  assert.equal(DEFAULT_LOOT_SORT, 'count')
  assert.equal(naturalDir('count'), 'desc')
  // The two keys a tester may already have stored still read.
  assert.equal(isLootSortKey('count'), true)
  assert.equal(isLootSortKey('recent'), true)
  // A retired (or hand-edited) stored key must not sort by nothing — the loader falls back.
  assert.equal(isLootSortKey('by-vibes'), false)
  assert.equal(isLootSortKey(undefined), false)
  assert.equal(isLootSortKey(null), false)
})

test('count: most-looted first, exactly as the table always was', () => {
  const list = [row('Bone Chips', 3, 100), row('Rune Word', 12, 50), row('Sphinx Claw', 7, 900)]
  assert.deepEqual(names(sortLootRows(list, by('count'))), ['Rune Word', 'Sphinx Claw', 'Bone Chips'])
})

test('count: equal counts break on the newer group, then on name', () => {
  const list = [
    row('Older five', 5, 100),
    row('Newer five', 5, 900),
    row('Another five', 5, 900) // same count AND same ts as 'Newer five' — name decides
  ]
  assert.deepEqual(names(sortLootRows(list, by('count'))), ['Another five', 'Newer five', 'Older five'])
})

test('recent: newest group first — the question the window could not answer', () => {
  const list = [
    row('Looted an hour ago', 4, 1_000),
    row('Looted just now', 1, 9_000),
    row('Looted yesterday', 40, 10)
  ]
  assert.deepEqual(names(sortLootRows(list, by('recent'))), [
    'Looted just now',
    'Looted an hour ago',
    'Looted yesterday'
  ])
})

test('the two orders genuinely disagree — that is why both are offered', () => {
  // One pickup, thirty seconds ago, against a grind of fifty from last week.
  const fresh = row('Mote of Major Potential', 1, 9_000)
  const grind = row('Bone Chips', 50, 10)
  assert.deepEqual(names(sortLootRows([grind, fresh], by('recent'))), [fresh.item, grind.item])
  assert.deepEqual(names(sortLootRows([fresh, grind], by('count'))), [grind.item, fresh.item])
})

test('SECOND-RESOLUTION TIES: one corpse, three items, one timestamp', () => {
  // The real shape — three dashed loot lines stamped the same second off a single corpse. Under
  // recency they tie outright, so the order must still be decided (count, then name) rather than
  // left to whatever order the tally Map happened to be built in.
  const ts = 1_700_000_000_000
  const list = [row('Zebra Hide', 2, ts), row('Alpha Rune', 2, ts), row('Mid Stone', 9, ts)]
  assert.deepEqual(names(sortLootRows(list, by('recent'))), ['Mid Stone', 'Alpha Rune', 'Zebra Hide'])
})

test('every order is TOTAL — no order depends on the input order', () => {
  const build = (): SortableLootRow[] => [
    row('Alpha', 5, 500),
    row('Beta', 5, 500),
    row('Gamma', 5, 500)
  ]
  for (const key of KEYS) {
    const forward = names(sortLootRows(build(), by(key)))
    const reversed = names(sortLootRows([...build()].reverse(), by(key)))
    assert.deepEqual(reversed, forward, `${key} is order-dependent`)
    // …and a fully tied set lands in name order rather than in arrival order.
    assert.deepEqual(forward, ['Alpha', 'Beta', 'Gamma'])
  }
})

test('sortLootRows does not mutate its input', () => {
  const list = [row('Second', 1, 1), row('First', 9, 9)]
  const before = names(list)
  const sorted = sortLootRows(list, by('count'))
  assert.deepEqual(names(list), before)
  assert.notEqual(sorted, list)
  assert.deepEqual(names(sorted), ['First', 'Second'])
})

test('compareLootRows agrees with sortLootRows on the pairwise calls', () => {
  const older = row('Older', 1, 1)
  const newer = row('Newer', 1, 2)
  assert.ok(compareLootRows(by('recent'))(newer, older) < 0)
  assert.ok(compareLootRows(by('recent'))(older, newer) > 0)
  // A row compared with itself is a tie under every key, or the sort is not a valid ordering.
  for (const key of KEYS) assert.equal(compareLootRows(by(key))(older, older), 0)
})

test('the chosen order is the WHOLE order — nothing re-blocks the list behind it (JOS-345)', () => {
  // The same four rows the deleted favorites-pin test used, asserted against what `groupLootRows`
  // does today: sort once, by the chosen key, and hand that back. Two of these names were the
  // starred ones, and they no longer travel together or lead the list — they sit exactly where
  // count and recency put them, which is the point of the removal.
  const list = [
    row('Bone Chips', 3, 100), // the oldest
    row('Rune Word', 12, 50), // the most looted
    row('Sphinx Claw', 7, 900), // the newest
    row('Silk Swatch', 1, 800)
  ]

  assert.deepEqual(names(sortLootRows(list, by('recent'))), ['Sphinx Claw', 'Silk Swatch', 'Bone Chips', 'Rune Word'])
  assert.deepEqual(names(sortLootRows(list, by('count'))), ['Rune Word', 'Sphinx Claw', 'Bone Chips', 'Silk Swatch'])
})

test('the key union is closed — every header column has a comparator', () => {
  for (const key of KEYS) {
    const cmp = compareLootRows(by(key))
    assert.equal(typeof cmp(row('a', 1, 1), row('b', 2, 2)), 'number', `${key} has no comparator`)
  }
})

test('a header click starts a column at its natural reading, and a second click flips it', () => {
  assert.deepEqual(nextLootSort(by('count'), 'item'), { key: 'item', dir: 'asc' })
  assert.deepEqual(nextLootSort(by('count'), 'zones'), { key: 'zones', dir: 'desc' })
  assert.deepEqual(nextLootSort(by('count'), 'count'), { key: 'count', dir: 'asc' })
  assert.deepEqual(nextLootSort(by('count', 'asc'), 'count'), { key: 'count', dir: 'desc' })
})

test('every column sorts both ways, and the item name still breaks ties A to Z', () => {
  const a = { item: 'Alpha', count: 1, last: 1, topSource: 'a lion', zoneCount: 4 }
  const b = { item: 'Beta', count: 9, last: 9, topSource: 'a bat', zoneCount: 1 }
  const c = { item: 'Gamma', count: 9, last: 9, topSource: 'a bat', zoneCount: 1 }
  const inv = new Map([['Alpha', 50], ['Beta', 2], ['Gamma', 2]])
  const invOf = (r: SortableLootRow): number => inv.get(r.item) ?? 0
  const sorted = (s: LootSort): string[] => names(sortLootRows([c, a, b], s, invOf))
  assert.deepEqual(sorted(by('item')), ['Alpha', 'Beta', 'Gamma'])
  assert.deepEqual(sorted(by('item', 'desc')), ['Gamma', 'Beta', 'Alpha'])
  assert.deepEqual(sorted(by('source')), ['Beta', 'Gamma', 'Alpha'])
  assert.deepEqual(sorted(by('zones')), ['Alpha', 'Beta', 'Gamma'])
  assert.deepEqual(sorted(by('zones', 'asc')), ['Beta', 'Gamma', 'Alpha'])
  assert.deepEqual(sorted(by('inventory')), ['Alpha', 'Beta', 'Gamma'])
  assert.deepEqual(sorted(by('count', 'asc')), ['Alpha', 'Beta', 'Gamma'])
  assert.deepEqual(sorted(by('recent', 'asc')), ['Alpha', 'Beta', 'Gamma'])
})
