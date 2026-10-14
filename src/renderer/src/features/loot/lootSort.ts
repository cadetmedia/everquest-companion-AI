// THE grouped-loot sort orders, pure — the same shape questSort.ts has for the Quests tab.
// `groupLootRows` tallies and then calls exactly one comparator from here, so a new order is a
// case in this file and a line in LOOT_SORT_OPTIONS, and nothing else moves.
//
// THERE IS NO SECOND PASS ANY MORE (JOS-345). The grouped table used to re-sort the comparator's
// output by a favorited flag, pinning starred items into a block on top; the star column left the
// loot window with the owner's ruling, and its ordering rule went with the control that set it —
// a pin nobody can see or toggle from this window is just an order the reader cannot explain.
// What the table shows now is EXACTLY what the chosen comparator says, which is what the Sort
// control has always claimed it was.
//
// WHY THIS IS ITS OWN MODULE and not a few lines inside lootGrouping.ts: lootGrouping imports
// lootItemData → data/index → `@shared/profiles`, a VALUE import that does not resolve outside
// the bundler, so a node test can never load it (measured — the import throws MODULE_NOT_FOUND).
// The orders are the part worth pinning, so they live where `npm test` can reach them. Same
// reasoning questSort.test.mts records for the quest orders.
//
// EVERY COMPARATOR IS TOTAL. Each one bottoms out in the item name, so the table has one
// deterministic order per key and never shuffles on re-render. That matters more here than it
// looks: EQ log timestamps are SECOND-resolution, so a corpse that yields three items writes
// three lines with the SAME `ts` — ties under "last looted" are the common case, not the corner.
// Before this the count order fell through to Map insertion order on a full tie; now it does not.

/**
 * The part of a grouped row every comparator reads — structural, like questSort's ItemWhere, so
 * the sort takes `GroupRow` without this module importing (and dragging in) lootGrouping.
 */
export interface SortableLootRow {
  item: string
  /** Times looted — stacked loots count their stack size. */
  count: number
  /** Epoch ms of the newest loot in the group. */
  last: number
  topSource?: string
  zoneCount?: number
}

/** One key per sortable column of the grouped table; `count` and `recent` keep the names the
 *  stored choice has always had, so a tester's saved order survives the move to the headers. */
export type LootSortKey = 'item' | 'count' | 'inventory' | 'source' | 'zones' | 'recent'

export type SortDir = 'asc' | 'desc'

export interface LootSort {
  key: LootSortKey
  dir: SortDir
}

/**
 * Times looted stays the default: the grouped table's headline question is "what do I keep
 * picking up", and JOS-91 added recency beside it rather than in front of it.
 */
export const DEFAULT_LOOT_SORT: LootSortKey = 'count'

const KEYS: readonly LootSortKey[] = ['item', 'count', 'inventory', 'source', 'zones', 'recent']

export function isLootSortKey(v: unknown): v is LootSortKey {
  return KEYS.some((k) => k === v)
}

/** A column's first click: names read A to Z, every number biggest (or newest) first. */
export function naturalDir(key: LootSortKey): SortDir {
  return key === 'item' || key === 'source' ? 'asc' : 'desc'
}

/** A header click: the same column flips, a new column starts at its natural reading. */
export function nextLootSort(cur: LootSort, key: LootSortKey): LootSort {
  return cur.key === key ? { key, dir: cur.dir === 'asc' ? 'desc' : 'asc' } : { key, dir: naturalDir(key) }
}

/** The universal last resort. Item names are the group identity, so this is total. */
function byItem(a: SortableLootRow, b: SortableLootRow): number {
  return a.item.localeCompare(b.item)
}

/** The held estimate per row, which the grouped row does not carry (the view joins it). */
export type InvOf = (r: SortableLootRow) => number

/** One column's ASCENDING reading, before the direction and the name tiebreak. */
function primary(key: LootSortKey, invOf: InvOf): (a: SortableLootRow, b: SortableLootRow) => number {
  switch (key) {
    case 'item':
      return () => 0
    // Equal counts break on the newer group — the order this table always had.
    case 'count':
      return (a, b) => a.count - b.count || a.last - b.last
    case 'inventory':
      return (a, b) => invOf(a) - invOf(b)
    case 'source':
      return (a, b) => (a.topSource ?? '').localeCompare(b.topSource ?? '')
    case 'zones':
      return (a, b) => (a.zoneCount ?? 0) - (b.zoneCount ?? 0)
    // EQ timestamps are second-resolution, so a corpse's three drops tie: count breaks them.
    case 'recent':
      return (a, b) => a.last - b.last || a.count - b.count
  }
}

/** Every order is TOTAL: the chosen column in the chosen direction, then the item name A to Z. */
export function compareLootRows(
  sort: LootSort,
  invOf: InvOf = () => 0
): (a: SortableLootRow, b: SortableLootRow) => number {
  const cmp = primary(sort.key, invOf)
  const sign = sort.dir === 'asc' ? 1 : -1
  if (sort.key === 'item') return (a, b) => sign * byItem(a, b)
  return (a, b) => sign * cmp(a, b) || byItem(a, b)
}

/** Non-mutating sort — the caller's array is tally output it may still be holding. */
export function sortLootRows<T extends SortableLootRow>(rows: readonly T[], sort: LootSort, invOf?: InvOf): T[] {
  return [...rows].sort(compareLootRows(sort, invOf))
}
