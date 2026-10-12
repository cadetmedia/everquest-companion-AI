// useRecentDrops — the loot module + item knowledge → the Overview feed's rows.
//
// WHY THE LOOT MODULE AND NOT THE EVENT FEED (docs/plans/overview-tab.md §3.4). The event-log
// OVERLAY's loot rows are LIVE-ONLY by design (its module returns early when `live` is false), so
// opening it never spams hours of replayed history. Overview is the opposite case: it is a
// landing surface you open AFTER the app has read your log, and a feed that stays empty until
// something happens next would be a blank card. So this reads the `loot` module — whose snapshot
// IS the full history — and renders the newest `DROP_FEED_CAP` rows. A *recent drops* list, not
// a live event stream. Both are honest; neither duplicates the other's state.
//
// Knowledge comes from `useNotablePickups`, the SAME hook the Loot tab uses, so the two surfaces
// can never disagree about what is notable. It probes the most-recent 40 DISTINCT items, which
// strictly contains the 25 rows rendered here.

import { useEffect, useMemo } from 'react'
import type { LootSnap } from '@shared/types'
import { fetchItemMarks, useItemMarksReader } from '../../lib/itemMarks'
import { useModule } from '../../lib/useModule'
import { questItemNames } from '../loot/lootItemData'
import { useNotablePickups } from '../loot/useNotablePickups'
import { buildDropRows, type DropRow } from './overviewData'

// Module-scope constants so their IDENTITY is stable across renders: `useNotablePickups` and the
// memo below both key off these, and a fresh [] / new Set() each render would defeat both.
const NO_LOOT: LootSnap = []
const NOT_DISMISSED = new Set<string>()

/** The feed's rows, newest-first and capped. Each row carries its own knowledge record, so a
 *  hover costs no second lookup and the card needs no second map. */
export function useRecentDrops(): DropRow[] {
  const history = useModule<LootSnap>('loot') ?? NO_LOOT
  // Nothing is dismissable on this surface (the dismiss affordance belongs to the Loot tab's
  // strip), so the dismissed set is permanently empty — we only want `byKey`.
  const { byKey } = useNotablePickups(history, NOT_DISMISSED)
  // The ICON reads off the marks store by name, exactly as the Loot rows' `ItemIcon` does: the
  // probe has already asked that batch for every recent item, so an ordinary drop has its icon
  // without a knowledge record (owner, 2026-10-12: Arrow sat iconless here). The reader is a new
  // identity per landed batch, which is what re-keys the memo.
  const marksOf = useItemMarksReader()
  const rows = useMemo(
    () => buildDropRows(history, questItemNames, byKey, (item) => marksOf(item)?.iconId),
    [history, byKey, marksOf]
  )
  // ...and this surface asks for its OWN spellings, as every mounted Loot row does. The probe
  // sends one spelling per counting key (`Arrow +1` and `Arrow` share one) and the store keys by
  // raw name, so a tier the probe did not send would never land (owner, 2026-10-12: `Arrow +1`
  // iconless beside an iconed `Arrow`). Names the store already holds are skipped: one small
  // batch at most, nothing on a repaint that adds no new name.
  useEffect(() => {
    const names = new Set<string>()
    for (const r of rows) names.add(r.item)
    void fetchItemMarks([...names])
  }, [rows])
  return rows
}
