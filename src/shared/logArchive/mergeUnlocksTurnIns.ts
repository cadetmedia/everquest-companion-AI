// shared/logArchive/mergeUnlocksTurnIns.ts — the `classUnlocks` and `turnins` modules across an
// archive and the live log (step 4.3).
//
// CLASS UNLOCKS: the fold (`class_unlocks.rs`) keeps one row per class, case-folded, and the first
// sighting wins. So the rows join older first and a class the archive already holds is not added
// again: the earliest instant is the fact worth keeping.
//
// TURN-INS: one row per completed trade, older first, as loot rows join. Trades matched to a Plane
// of Sky quest are stored separately already (`ProgressState.questTurnIns`); these are the raw rows.

import type { ClassUnlockSnap, TurnInSnap } from '../types'

function isUnlocks(x: unknown): x is ClassUnlockSnap {
  return (
    Array.isArray(x) &&
    x.every((r) => r !== null && typeof r === 'object' && typeof (r as { className?: unknown }).className === 'string')
  )
}

/** `older` then `newer`, a class seen in both kept at its earliest; null when either is not a list. */
export function mergeClassUnlocks(older: unknown, newer: unknown): ClassUnlockSnap | null {
  if (!isUnlocks(older) || !isUnlocks(newer)) return null
  const seen = new Set<string>()
  const out: ClassUnlockSnap = []
  for (const row of [...older, ...newer]) {
    const key = row.className.toLowerCase()
    if (seen.has(key)) continue
    seen.add(key)
    out.push({ ...row })
  }
  return out
}

/** `older` then `newer`, or null when either is not a list. */
export function mergeTurnIns(older: unknown, newer: unknown): TurnInSnap | null {
  if (!Array.isArray(older) || !Array.isArray(newer)) return null
  return [...(older as TurnInSnap), ...(newer as TurnInSnap)]
}
