// The Gaps tab's grouped view: whether it is on, the order of its headings, and which are folded.
//
// "Group by zone, then mob" (owner ask, 2026-10-18): where to go and what to kill. The headings
// sort by how many are missing as well as A to Z, and one toggle folds or unfolds every heading at
// once (owner asks, 2026-10-20). The folded set lives here, not in the table, so the Name header's
// controls (GroupHeaderControls.tsx) reach it.

import { useCallback, useMemo, useState } from 'react'
import { gapGroupOrderOf, groupGaps, headingKeys, rowEntries, type GapEntry, type GapGroupOrder } from '@shared/gapGroups'
import type { GapRow } from '@shared/gaps'
import type { LootEvent } from '@shared/types'
import { useBoolPref, useRawPref } from '../combat/useCombatPrefs'
import { PAGE_EXTRAS } from './useGapsData'

/** Where the grouped view is remembered. */
const GROUPED_KEY = 'eq.gaps.grouped'
/** Where the grouped view's heading order is remembered. */
const GROUP_ORDER_KEY = 'eq.gaps.groupOrder'

export interface Grouping {
  grouped: boolean
  setGrouped: (on: boolean) => void
  order: GapGroupOrder
  setOrder: (o: GapGroupOrder) => void
  /** the list as the table shows it: grouped, or the rows as they are */
  entries: GapEntry[]
  /** the folded headings and their toggle, as the table takes them */
  folds: { folded: ReadonlySet<string>; onFold: (key: string) => void }
  /** every heading is folded (and there is at least one), so the one toggle expands */
  allFolded: boolean
  /** collapse every heading, or expand them all when every one is already folded */
  toggleAll: () => void
}

export function useGrouping(sorted: readonly GapRow[], loot: readonly LootEvent[]): Grouping {
  const [grouped, setGrouped] = useBoolPref(GROUPED_KEY, false)
  const [rawOrder, setRawOrder] = useRawPref(GROUP_ORDER_KEY)
  const order = gapGroupOrderOf(rawOrder)
  const entries = useMemo(() => (grouped ? groupGaps(sorted, loot, PAGE_EXTRAS.zoneName, order) : rowEntries(sorted)), [grouped, sorted, loot, order])
  const [folded, setFolded] = useState<ReadonlySet<string>>(new Set())
  const onFold = useCallback(
    (key: string) =>
      setFolded((cur) => {
        const next = new Set(cur)
        if (!next.delete(key)) next.add(key)
        return next
      }),
    []
  )
  const heads = useMemo(() => headingKeys(entries), [entries])
  const allFolded = heads.length > 0 && heads.every((k) => folded.has(k))
  const toggleAll = useCallback(() => setFolded(allFolded ? new Set() : new Set(heads)), [allFolded, heads])
  const folds = useMemo(() => ({ folded, onFold }), [folded, onFold])
  return { grouped, setGrouped, order, setOrder: setRawOrder, entries, folds, allFolded, toggleAll }
}
