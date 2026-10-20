// useHeld — what the player holds right now, for the Items rows' "you're holding it" (review C6;
// owner, 2026-10-19). The inventory export comes from the Gear tab's own read (`useGearOwnership`,
// re-read on every export the app notices); the loot and destroys after its instant are the posky
// folds (heldCounts.ts), so "held" means here what it means on every other tab.

import { useMemo } from 'react'
import { heldIndex, type HeldIndex } from '@shared/gapHeld'
import type { LootEvent } from '@shared/types'
import { useGearOwnership } from '../gear/gearData'
import { computeDestroyedAfter, computeHeldCountsAfter } from '../posky/heldCounts'

const NONE: HeldIndex = new Map()

export function useHeld(loot: readonly LootEvent[]): HeldIndex {
  const { payload } = useGearOwnership()
  return useMemo(() => {
    const at = payload.loadedAt === null ? Number.NaN : Date.parse(payload.loadedAt)
    if (Number.isNaN(at)) return NONE
    return heldIndex(payload, computeHeldCountsAfter(loot, at), computeDestroyedAfter(loot, at))
  }, [payload, loot])
}
