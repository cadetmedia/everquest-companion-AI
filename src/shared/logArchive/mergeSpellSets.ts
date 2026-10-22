// shared/logArchive/mergeSpellSets.ts — the `spellSets` module across an archive and the live log
// (step 4.11).
//
// A NAMED SET IS HISTORY, THE GEMS ARE THE PRESENT. `shared/spellSets.ts` states the module's two
// rules, and each decides one half of the merge:
//
//   * Sets: a set is its latest definition. So across a join every set either side defined is kept,
//     and a name both sides defined takes the later definition (`observedAt`), which is the newer
//     side's in every real join.
//   * Memorized gems: presence only, a list of spells watched going in and not watched coming out.
//     The live log's list is the only one used. An archived gem cannot be carried over: a gem the
//     live log forgets before it ever watched it go in prints a line the fold has nothing to remove
//     from, and nothing records it, so a carried gem could be one the player has since forgotten.
//
// TWO NAMED DIFFERENCES from one continuous log, both from that same presence rule:
//   * a set saved again in the live log holds only the gems the live log has watched go in;
//   * the memorized list starts empty after a rotation, which the module reads as "unknown", never
//     as "empty".
// And one not recoverable at all: a set deleted in the live log was never defined there, so the
// archive's definition of it is still shown.

import type { SpellSetDef, SpellSetsSnap } from '../spellSets'

function isSetDef(x: unknown): x is SpellSetDef {
  if (x === null || typeof x !== 'object') return false
  const d = x as Record<string, unknown>
  return Array.isArray(d.spells) && typeof d.observedAt === 'number' && typeof d.source === 'string'
}

function isSpellSetsSnap(x: unknown): x is SpellSetsSnap {
  if (x === null || typeof x !== 'object') return false
  const s = x as Record<string, unknown>
  if (typeof s.v !== 'number' || !Array.isArray(s.memorized)) return false
  if (s.sets === null || typeof s.sets !== 'object' || Array.isArray(s.sets)) return false
  return Object.values(s.sets).every(isSetDef)
}

/** `older` then `newer`, or null when either is not a spell sets snapshot of the same version. */
export function mergeSpellSets(older: unknown, newer: unknown): SpellSetsSnap | null {
  if (!isSpellSetsSnap(older) || !isSpellSetsSnap(newer) || older.v !== newer.v) return null
  const sets: Record<string, SpellSetDef> = { ...older.sets }
  for (const [name, def] of Object.entries(newer.sets)) {
    const prev = Object.prototype.hasOwnProperty.call(sets, name) ? sets[name] : undefined
    if (prev === undefined || def.observedAt >= prev.observedAt) sets[name] = def
  }
  return { ...newer, sets }
}
