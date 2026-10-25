// shared/gapHeldTier.ts — the tier a held copy is at, in words (owner, 2026-10-25: "held by
// <playername> is useless if we need the +0 version and i have the +4. can we change it to that yellow
// orange we use and say +N held by <playername> if it's not the +0 version?"). A holder carries
// `tiers` only when none of its copies is +0 (gapHeld.ts `heldIndex`); these word it.

import type { GapHeld } from './gapHeld'
import type { OwnershipEntry } from './planner/ownership'
import { itemTierFromName, itemTierKey } from './itemStats'

/**
 * Each held item's `tiers` field, by its `itemTierKey`: the export rows' own tier (else the name's
 * ` +N`) and the loot since's names, lowest first; empty when a +0 copy is among them or none is
 * known. Exaltation rows are no copies. A destroyed copy's tier is not known, so it is not taken off.
 */
export function heldTiers(entries: readonly OwnershipEntry[], lootSince: Readonly<Record<string, number>>): (key: string) => { tiers?: number[] } {
  const by = new Map<string, Set<number>>()
  const add = (key: string, tier: number): void => {
    by.set(key, (by.get(key) ?? new Set<number>()).add(tier))
  }
  for (const [key, rows] of entries) for (const r of rows) if (!r.exaltation) add(itemTierKey(key), r.tier ?? itemTierFromName(r.name) ?? 0)
  for (const [raw, n] of Object.entries(lootSince)) if (n > 0) add(itemTierKey(raw), itemTierFromName(raw) ?? 0)
  return (key) => {
    const tiers = [...(by.get(key) ?? [])].sort((a, b) => a - b)
    return tiers.length === 0 || tiers[0] === 0 ? {} : { tiers }
  }
}

/** `+4`, the lowest tier a holder has when it has no +0 copy; '' when it has one. */
export const lowTier = (h: GapHeld): string => (h.tiers === undefined ? '' : `+${String(h.tiers[0] ?? 0)}`)

/** ` at +4` (` at +2, +4`) after a holder's places when it has no +0 copy; '' when it has one. */
export const atTiers = (h: GapHeld): string => (h.tiers === undefined ? '' : ` at ${h.tiers.map((t) => `+${String(t)}`).join(', ')}`)

/** Is a +0 copy held by anyone (the chip stays green)? False when every holder has only +N copies. */
export const heldPlain = (holders: readonly GapHeld[]): boolean => holders.length === 0 || holders.some((h) => h.tiers === undefined)
