// shared/logArchive/mergeBuffStats.ts — the learned buff durations of the `buffs` module across an
// archive and the live log (step 4.6, built 2026-10-08 after being left out on 2026-10-03).
//
// WHY IT WAS LEFT OUT, AND WHAT CHANGED. The snapshot's `stats` holds per-spell summaries (count,
// median, quartiles, min, max, the estimate and its source), not the duration samples, so two
// summaries of one spell cannot be joined into a third: the joined median is unknown. That is still
// true and nothing here joins them. What can be kept honestly is each spell's summary from the
// NEWEST stretch of log that saw it: per spell, the live log's row when the live log has one, else
// the newest archive's. Every row shown is then a true summary of one stretch.
//
// WHAT IT REACHES. The Buffs tab's learned-duration table (`BuffStats.tsx`). The countdown bars are
// timed inside the engine from its own samples, so after a rotation a bar starts again from the
// spell database's duration until the spell has been cast in the live log. Seeding the engine's
// estimator would be an engine change.
//
// The live buffs on screen and the message overlay belong to the present and come from the live
// log only.

import type { BuffStat, BuffsSnap } from '../buffTypes'

function isBuffsSnap(x: unknown): x is BuffsSnap {
  if (x === null || typeof x !== 'object') return false
  const s = x as Record<string, unknown>
  if (!Array.isArray(s.active) || s.stats === null || typeof s.stats !== 'object' || Array.isArray(s.stats)) return false
  return Object.values(s.stats).every((r) => r !== null && typeof r === 'object' && typeof (r as Partial<BuffStat>).n === 'number')
}

/** `older` then `newer`, or null when either is not a buffs snapshot. */
export function mergeBuffStats(older: unknown, newer: unknown): BuffsSnap | null {
  if (!isBuffsSnap(older) || !isBuffsSnap(newer)) return null
  return { ...newer, stats: { ...older.stats, ...newer.stats } }
}
