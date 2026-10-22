// shared/logArchive/mergeLeveling.ts — the `leveling` module across an archive and the live log
// (step 1.5).
//
// The four lists join, older first. The AA ledger's unspent total is the value to watch: it is
// read off every gain and every purchase, so a merge that dropped one would show it.

import type { LevelingSnap } from '../types'

const LISTS = ['levels', 'aaGains', 'aaSpends', 'aaPotions'] as const

function isLevelingSnap(x: unknown): x is LevelingSnap {
  if (x === null || typeof x !== 'object') return false
  return LISTS.every((k) => Array.isArray((x as Record<string, unknown>)[k]))
}

/** `older` then `newer`, or null when either is not a leveling snapshot. */
export function mergeLeveling(older: unknown, newer: unknown): LevelingSnap | null {
  if (!isLevelingSnap(older) || !isLevelingSnap(newer)) return null
  return {
    ...newer,
    levels: [...older.levels, ...newer.levels],
    aaGains: [...older.aaGains, ...newer.aaGains],
    aaSpends: [...older.aaSpends, ...newer.aaSpends],
    aaPotions: [...older.aaPotions, ...newer.aaPotions]
  }
}
