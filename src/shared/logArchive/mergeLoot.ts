// shared/logArchive/mergeLoot.ts — the `loot` module across an archive and the live log (step 1.4).
//
// One row per event, older first. Rows are never summed into totals here, because every time slice
// on the Loot and Leveling tabs filters rows by time; the eligibility rule has already proved the
// two stretches do not overlap, so a join keeps time order.

import type { LootSnap } from '../types'

/** `older` then `newer`, or null when either is not a loot snapshot. */
export function mergeLoot(older: unknown, newer: unknown): LootSnap | null {
  if (!Array.isArray(older) || !Array.isArray(newer)) return null
  return [...(older as LootSnap), ...(newer as LootSnap)]
}
