// shared/logArchive/mergeKills.ts — the `kills` module across an archive and the live log (step 1.3).
//
// Per mob, per tier key: counts and credited add, first seen takes the earlier, last seen and last
// credited take the later. That is `addTierRun`, the same fold `killIndex` uses to join one mob
// spelled two ways, and the scalars are recomputed from the runs by `killTotals`. The display name
// is the older side's: the first spelling seen.
//
// A DIFFERENT SHAPE VERSION IS NOT MERGED. Key 0 changed meaning at v5 (KILLS_SHAPE_VERSION), so
// adding a v4 archive's runs to a v5 log would put three worlds under one key. Null tells the
// caller to leave that segment out of this module.

import { addTierRun, killTotals, type KillInfo, type KillMap, type KillsSnap } from '../kills'

export function isKillsSnap(x: unknown): x is KillsSnap {
  if (x === null || typeof x !== 'object') return false
  const s = x as { v?: unknown; mobs?: unknown }
  return typeof s.v === 'number' && s.mobs !== null && typeof s.mobs === 'object'
}

function copyInfo(info: KillInfo): KillInfo {
  const tiers: KillInfo['tiers'] = {}
  for (const [tier, run] of Object.entries(info.tiers)) tiers[Number(tier)] = { ...run }
  return { ...info, tiers }
}

/** `older` then `newer`, or null when either is not a kills snapshot of the same shape version. */
export function mergeKills(older: unknown, newer: unknown): KillsSnap | null {
  if (!isKillsSnap(older) || !isKillsSnap(newer) || older.v !== newer.v) return null
  const mobs: KillMap = {}
  for (const [key, info] of Object.entries(older.mobs)) mobs[key] = copyInfo(info)
  for (const [key, info] of Object.entries(newer.mobs)) {
    const prev = mobs[key]
    if (prev === undefined) {
      mobs[key] = copyInfo(info)
      continue
    }
    for (const [tier, run] of Object.entries(info.tiers)) addTierRun(prev.tiers, Number(tier), run)
    Object.assign(prev, killTotals(prev.tiers))
  }
  return { v: newer.v, mobs }
}
