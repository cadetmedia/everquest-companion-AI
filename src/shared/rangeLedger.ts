// rangeLedger.ts — coin received and your deaths over a range, filed into the same zone rows as the
// kills. Its own file because progressionStats.ts sits near the 400-line ceiling.

import type { ProgressionSnap } from './progressionTypes'
import type { RangeStats, ZoneRangeRow } from './progressionStatsTypes'

/** The range and the row lookup `rangeStats` already resolved; a sample with no row is outside it. */
export interface LedgerCtx {
  t0: number
  t1: number
  rowAt: (ts: number) => ZoneRangeRow | null
}

/** Shown for a bare `You died.`, which names nobody. */
export const UNKNOWN_KILLER = 'unknown'

function foldCoin(snap: ProgressionSnap, ctx: LedgerCtx): number {
  const ts = snap.coinTs ?? []
  const copper = snap.coinCopper ?? []
  let total = 0
  for (let i = 0; i < ts.length && ts[i] < ctx.t1; i++) {
    const row = ts[i] >= ctx.t0 ? ctx.rowAt(ts[i]) : null
    if (!row) continue
    total += copper[i]
    row.coinCopper += copper[i]
  }
  return total
}

function foldDeaths(snap: ProgressionSnap, ctx: LedgerCtx): Pick<RangeStats, 'deaths' | 'deathKillers'> {
  const ts = snap.deathTs ?? []
  const killer = snap.deathKiller ?? []
  const counts = new Map<string, number>()
  let deaths = 0
  for (let i = 0; i < ts.length && ts[i] < ctx.t1; i++) {
    const row = ts[i] >= ctx.t0 ? ctx.rowAt(ts[i]) : null
    if (!row) continue
    deaths++
    row.deaths++
    const name = killer[i] || UNKNOWN_KILLER
    counts.set(name, (counts.get(name) ?? 0) + 1)
  }
  const deathKillers = [...counts]
    .map(([name, count]) => ({ killer: name, count }))
    .sort((a, b) => b.count - a.count || a.killer.localeCompare(b.killer))
  return { deaths, deathKillers }
}

/** Coin (in copper) and deaths inside the range, also added to each sample's zone row. */
export function foldLedger(
  snap: ProgressionSnap,
  ctx: LedgerCtx
): Pick<RangeStats, 'coinCopper' | 'deaths' | 'deathKillers'> {
  return { coinCopper: foldCoin(snap, ctx), ...foldDeaths(snap, ctx) }
}
