// shared/logArchive/mergeSpellRanks.ts — the `observedSpellRanks` module across an archive and the
// live log (step 4.10).
//
// One row per spell line. The engine (`observed_spell_ranks.rs`) keeps the HIGHEST rank any witness
// showed, the highest a merge line proved, the highest a cast proved, the count of merges watched,
// and the first and last instants. So across a join: every rank takes the higher side, merges add,
// the first instant is the earlier and the last the later. The name is the newer side's.
//
// This is the history no `/outputfile` gives back: the game prints a spell's rank only when it is
// merged or cast, so a rank learned in an archived log is otherwise unknown until the next cast.
//
// Absent means unknown, never rank 0: a row with no merge or cast rank on either side keeps neither.

import type { ObservedSpellRankRow, ObservedSpellRanksSnap } from '../spellRanks'

function isRow(x: unknown): x is ObservedSpellRankRow {
  if (x === null || typeof x !== 'object') return false
  const r = x as Record<string, unknown>
  return (
    typeof r.key === 'string' &&
    typeof r.name === 'string' &&
    typeof r.rank === 'number' &&
    typeof r.merges === 'number' &&
    typeof r.firstAt === 'number' &&
    typeof r.lastAt === 'number'
  )
}

function isRanksSnap(x: unknown): x is ObservedSpellRanksSnap {
  if (x === null || typeof x !== 'object' || Array.isArray(x)) return false
  return Object.values(x).every(isRow)
}

function higher(a: number | undefined, b: number | undefined): number | undefined {
  if (a === undefined) return b
  return b === undefined ? a : Math.max(a, b)
}

function joinRow(older: ObservedSpellRankRow, newer: ObservedSpellRankRow): ObservedSpellRankRow {
  const row: ObservedSpellRankRow = {
    key: newer.key,
    name: newer.name,
    rank: Math.max(older.rank, newer.rank),
    merges: older.merges + newer.merges,
    firstAt: Math.min(older.firstAt, newer.firstAt),
    lastAt: Math.max(older.lastAt, newer.lastAt)
  }
  const merged = higher(older.mergedRank, newer.mergedRank)
  if (merged !== undefined) row.mergedRank = merged
  const cast = higher(older.castRank, newer.castRank)
  if (cast !== undefined) row.castRank = cast
  return row
}

/** `older` then `newer`, or null when either is not an observed spell ranks snapshot. */
export function mergeSpellRanks(older: unknown, newer: unknown): ObservedSpellRanksSnap | null {
  if (!isRanksSnap(older) || !isRanksSnap(newer)) return null
  const out: ObservedSpellRanksSnap = {}
  for (const [key, row] of Object.entries(older)) out[key] = { ...row }
  for (const [key, row] of Object.entries(newer)) {
    const prev = Object.prototype.hasOwnProperty.call(out, key) ? out[key] : undefined
    out[key] = prev === undefined ? { ...row } : joinRow(prev, row)
  }
  return out
}
