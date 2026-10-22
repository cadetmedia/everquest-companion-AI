// shared/logArchive/mergeItemTiers.ts — the `itemTiers` module across an archive and the live log
// (step 4.2).
//
// One row per item. The engine (`item_tiers.rs`) keeps the HIGHEST tier ever observed, the tier the
// most recent observation named, the count of merges watched, and the first and last instants. So
// across a join: the higher tier wins, the newer side's last tier stands unless it named none,
// merges add, the first instant is the older side's and the last the newer side's. The name is the
// newer side's, because the fold re-reads it on every observation.
//
// Absent means unknown, never tier 0: a row with no tier on either side keeps neither field.

import type { ItemTierRow, ItemTiersSnap } from '../types'

function isRow(x: unknown): x is ItemTierRow {
  if (x === null || typeof x !== 'object') return false
  const r = x as Record<string, unknown>
  return (
    typeof r.key === 'string' &&
    typeof r.name === 'string' &&
    typeof r.merges === 'number' &&
    typeof r.firstAt === 'number' &&
    typeof r.lastAt === 'number'
  )
}

function isItemTiersSnap(x: unknown): x is ItemTiersSnap {
  if (x === null || typeof x !== 'object' || Array.isArray(x)) return false
  return Object.values(x).every(isRow)
}

function joinRow(older: ItemTierRow, newer: ItemTierRow): ItemTierRow {
  const row: ItemTierRow = {
    key: newer.key,
    name: newer.name,
    merges: older.merges + newer.merges,
    firstAt: Math.min(older.firstAt, newer.firstAt),
    lastAt: Math.max(older.lastAt, newer.lastAt)
  }
  const tiers = [older.tier, newer.tier].filter((t): t is number => typeof t === 'number')
  if (tiers.length > 0) row.tier = Math.max(...tiers)
  const lastTier = newer.lastTier ?? older.lastTier
  if (lastTier !== undefined) row.lastTier = lastTier
  return row
}

/** `older` then `newer`, or null when either is not an item tiers snapshot. */
export function mergeItemTiers(older: unknown, newer: unknown): ItemTiersSnap | null {
  if (!isItemTiersSnap(older) || !isItemTiersSnap(newer)) return null
  const out: ItemTiersSnap = {}
  for (const [key, row] of Object.entries(older)) out[key] = { ...row }
  for (const [key, row] of Object.entries(newer)) {
    const prev = Object.prototype.hasOwnProperty.call(out, key) ? out[key] : undefined
    out[key] = prev === undefined ? { ...row } : joinRow(prev, row)
  }
  return out
}
