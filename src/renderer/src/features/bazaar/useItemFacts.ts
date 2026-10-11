// useItemFacts — what the Bazaar needs to know about each item: its icon (the Gear tab's look),
// whether the wiki marks it No Drop or No Trade, which a "Hide No Drop" switch filters on, since
// trade chat sometimes offers what cannot be traded, and the tradeskills and quests it is for
// (the Tradeskill filter and the Quest search, shared/bazaarFacts.ts).
//
// Since 2026-10-11 the whole list is asked in ONE `items:marks` call (`lib/itemMarks.ts`), which
// answers off the item database and nothing else. Before, each name went through its own
// `lookupItem`, a full knowledge record per item: a few hundred round trips on the first open,
// for two fields. The store is shared with the Loot rows, so a name either tab has asked is free.
// The image itself comes through `itemIconUrl`, the app's permanent icon cache.

import { useCallback, useEffect, useSyncExternalStore } from 'react'
import type { BazaarFacts } from '@shared/bazaarFacts'
import { fetchItemMarks, itemMarksOf, itemMarksVersion, subscribeItemMarks } from '../../lib/itemMarks'

export interface ItemFacts extends BazaarFacts {
  iconId?: number
}

/** Each of `names`' facts once known; undefined while asked, or for a name the DB does not know. */
export function useItemFacts(names: readonly string[]): (name: string) => ItemFacts | undefined {
  const v = useSyncExternalStore(subscribeItemMarks, itemMarksVersion)
  useEffect(() => {
    if (names.length) void fetchItemMarks(names)
  }, [names])
  // `v` ties the reader to the store's version: a settled batch hands out a new reader, so its
  // readers re-render, and every other render keeps the same one, so the tab's memos still hit.
  return useCallback(
    (name: string) => {
      const m = v >= 0 ? itemMarksOf(name) : undefined
      return m ? { ...(m.iconId === undefined ? {} : { iconId: m.iconId }), noTrade: m.noTrade, tradeskills: m.tradeskills, quests: m.quests } : undefined
    },
    [v]
  )
}
