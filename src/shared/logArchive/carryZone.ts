// shared/logArchive/carryZone.ts — the zone an archive ended in, carried over to the kills a later
// log made before its first zone line (step 3.8).
//
// The kills fold files a kill under the tier of the zone it stands in, and before a log's first
// zone line that is TIER_UNKNOWN (-2). Read as one log, those kills were in the zone the archive
// ended in, so this files them there before the kills merge joins the stretches. Three readings,
// each from data the engine already published:
//
//   * WHICH RUNS. -2 also means an instance whose difficulty this app does not decode, after a zone
//     line. A run is moved only when its last kill is before the stretch's first zone line (from
//     its `progression` zone column), or the stretch has none yet. A run that straddles the line
//     mixes both causes and cannot be split, so it stays where the fold put it.
//   * WHICH TIER. Not decoded again from the zone's name: the kills fold also remembers instance
//     notices, which no snapshot publishes. It is read off the archive's own kills: every run whose
//     last kill came at or after the archive's last zone line carries the key that zone was given.
//     When no kill says, or two disagree, nothing moves.
//   * WHICH STRETCHES. Every cut, oldest first: an archive that began as a fresh log gets the zone
//     of the archive before it, and an archive with no zone line passes its carried zone on.
//
// Like the leveling series (step 4.5), only a progression that dropped nothing can say where the
// first zone line was.

import { addTierRun, killTotals, TIER_UNKNOWN, type KillInfo, type KillMap, type KillTierRun } from '../kills'
import { isKillsSnap } from './mergeKills'
import { isProgressionSnap } from './mergeProgression'

/** One archived stretch's captured states. */
export interface Stretch {
  kills: unknown
  progression: unknown
}

/** The first zone line's time, null when there is none yet, undefined when the progression cannot say. */
export function firstZoneLine(progression: unknown): number | null | undefined {
  if (!isProgressionSnap(progression) || progression.windowStart !== 0) return undefined
  return progression.zoneStart.length > 0 ? progression.zoneStart[0] : null
}

/** The tier key the stretch's last zone was given, read off its own kills; `carried` with no zone line. */
function endTier(kills: unknown, progression: unknown, carried: number | null): number | null {
  if (!isKillsSnap(kills) || !isProgressionSnap(progression)) return null
  const last = progression.zoneStart.at(-1)
  if (last === undefined) return carried
  const keys = new Set<number>()
  for (const info of Object.values(kills.mobs)) {
    for (const [tier, run] of Object.entries(info.tiers)) if (run.lastTs >= last) keys.add(Number(tier))
  }
  return keys.size === 1 ? [...keys][0] : null
}

/** One mob's record with its -2 run moved to `tier`, the scalars folded again. */
function moved(info: KillInfo, run: KillTierRun, tier: number): KillInfo {
  const tiers: Record<number, KillTierRun> = {}
  for (const [t, r] of Object.entries(info.tiers)) if (Number(t) !== TIER_UNKNOWN) tiers[Number(t)] = { ...r }
  addTierRun(tiers, tier, run)
  return { ...info, ...killTotals(tiers), tiers }
}

/** `kills` with every -2 run made wholly before `firstZone` moved to `tier`. Unchanged when nothing moves. */
function refiled(kills: unknown, tier: number | null, firstZone: number | null | undefined): unknown {
  if (tier === null || tier === TIER_UNKNOWN || firstZone === undefined || !isKillsSnap(kills)) return kills
  let mobs: KillMap | null = null
  for (const [key, info] of Object.entries(kills.mobs)) {
    const run = info.tiers[TIER_UNKNOWN] as KillTierRun | undefined
    if (run === undefined || (firstZone !== null && run.lastTs >= firstZone)) continue
    mobs ??= { ...kills.mobs }
    mobs[key] = moved(info, run, tier)
  }
  return mobs === null ? kills : { ...kills, mobs }
}

/**
 * The archived stretches' kills (oldest first) and the live kills, each with the runs made before
 * its first zone line filed under the tier the stretches before it ended in. `live.firstZone` is
 * `firstZoneLine` of the live progression. Inputs are not changed.
 */
export function carryZoneIntoKills(
  archived: readonly Stretch[],
  live: { kills: unknown; firstZone: number | null | undefined }
): { archived: unknown[]; live: unknown } {
  let tier: number | null = null
  const out = archived.map((s) => {
    const kills = refiled(s.kills, tier, firstZoneLine(s.progression))
    tier = endTier(kills, s.progression, tier)
    return kills
  })
  return { archived: out, live: refiled(live.kills, tier, live.firstZone) }
}
