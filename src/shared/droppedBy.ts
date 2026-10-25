// shared/droppedBy.ts — the Loot drill-down's Dropped by tally. A Reward Chest payout is no mob's
// drop (owner, 2026-10-21), so it is counted apart, never as a mob nor as `unknown`; a loot line
// that names no source still tallies under `unknown`, as it always has.
import { isRewardChest } from './rewardChest'

export interface DroppedByTally {
  /** each source the loot lines name, with its count, most-seen first */
  sources: { name: string; count: number }[]
  /** payouts from a Reward Chest: looted, but no mob's drop */
  chest: number
}

export function tallyDroppedBy(events: readonly { source?: string }[]): DroppedByTally {
  const bySource = new Map<string, number>()
  let chest = 0
  for (const e of events) {
    if (isRewardChest(e.source)) {
      chest++
      continue
    }
    const s = e.source ?? 'unknown'
    bySource.set(s, (bySource.get(s) ?? 0) + 1)
  }
  const sources = [...bySource.entries()]
    .map(([name, count]) => ({ name, count }))
    .sort((a, b) => b.count - a.count)
  return { sources, chest }
}

/** The Distinct mobs card's note when some of the loot came out of a Reward Chest. */
export const rewardChestNote = (chest: number): string | undefined =>
  chest > 0 ? `${chest} from a Reward Chest (no mob)` : undefined

/** The Dropped by column's line when no mob is listed but a chest paid out; else the column's own. */
export const chestOnlyNote = (chest: number): string | undefined =>
  chest > 0 ? `Only from a Reward Chest so far (${chest} ${chest === 1 ? 'payout' : 'payouts'}).` : undefined
