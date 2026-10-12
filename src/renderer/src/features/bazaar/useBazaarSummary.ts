// useBazaarSummary — the Bazaar list in two steps, so typing stays smooth (owner ask, 2026-10-11:
// the tab froze for a moment on each character while it rebuilt every entry). Every entry's
// numbers are computed once per shape (the snapshot, All tiers as one, Price at, Days, Ignore
// outliers) and kept; a keystroke only picks and orders them (shared/bazaar.ts). The search text
// is deferred (React's useDeferredValue), so the box shows the character at once and the list
// follows when React has a moment.

import { useDeferredValue, useMemo } from 'react'
import { selectBazaarItems, summarizeBazaarItems, type BazaarQuery, type BazaarSnap, type BazaarSort, type BazaarSummary } from '@shared/bazaar'
import type { BazaarControlState } from './BazaarControls'

export function useBazaarSummary(snap: BazaarSnap | null, ctl: BazaarControlState, sort: BazaarSort, keep: BazaarQuery['keep']): BazaarSummary {
  const text = useDeferredValue(ctl.text)
  const all = useMemo(
    () => summarizeBazaarItems(snap, { combineTiers: ctl.combineTiers, priceTier: ctl.priceTier, sinceDays: ctl.sinceDays, ignoreOutliers: ctl.ignoreOutliers }),
    [snap, ctl.combineTiers, ctl.priceTier, ctl.sinceDays, ctl.ignoreOutliers]
  )
  return useMemo(() => selectBazaarItems(all, { text, dir: ctl.dir, sort, keep, minPrice: ctl.minPrice }), [all, text, ctl.dir, ctl.minPrice, sort, keep])
}
