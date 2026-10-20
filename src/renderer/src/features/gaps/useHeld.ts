// useHeld — what the player holds right now, for the Items rows' "you're holding it" (review C6;
// owner, 2026-10-19). The inventory export comes from the Gear tab's own read (`useGearOwnership`,
// re-read on every export the app notices); the loot and destroys after its instant are the posky
// folds (heldCounts.ts), so "held" means here what it means on every other tab.

import { useMemo } from 'react'
import { heldIndex, isOwnExport, type HeldIndex } from '@shared/gapHeld'
import type { CharacterRef, LootEvent } from '@shared/types'
import { useGearOwnership } from '../gear/gearData'
import { computeDestroyedAfter, computeHeldCountsAfter } from '../posky/heldCounts'

const NONE: HeldIndex = new Map()

/** What `me` holds: only from `me`'s own export (the Gear read may hand back another character's), named `who` when given. */
export function useHeld(loot: readonly LootEvent[], me: CharacterRef | null, who?: string): HeldIndex {
  const { payload } = useGearOwnership()
  return useMemo(() => {
    const at = payload.loadedAt === null ? Number.NaN : Date.parse(payload.loadedAt)
    if (Number.isNaN(at) || me === null || !isOwnExport(payload.path, me.name, me.server)) return NONE
    return heldIndex(payload, computeHeldCountsAfter(loot, at), computeDestroyedAfter(loot, at), who)
  }, [payload, loot, me, who])
}
