// useRowSamples — a faction row's proof lines, which the Gaps snapshot no longer carries (perf review
// 2026-10-20; shared/gapKillFactionSamples.ts): asked of main while the row's details are open, and
// again when its count moves (a new kill), so a long session's every con and kill never re-sends
// them. A Copy asks for every faction row it holds first (`withAskedSamples`). Any other row's own.

import { useEffect, useState } from 'react'
import type { GapRow } from '@shared/gaps'
import { factionPairOf, factionRowKeys, killFactionKey, rowSamples, withRowSamples, type KillFactionSamples } from '@shared/gapKillFactionSamples'

/** Main's answer for these keys; none when it could not answer (the row shows what it carries). */
async function ask(keys: readonly string[]): Promise<KillFactionSamples> {
  try {
    return await window.eq.gapKillFactionSamples(keys)
  } catch {
    return {}
  }
}

/** The row's lines: a faction row's asked of main, joined with any it carries. */
export function useRowSamples(row: GapRow): readonly string[] {
  const pair = factionPairOf(row)
  const key = pair === null ? null : killFactionKey(pair.mob, pair.faction)
  const [asked, setAsked] = useState<{ key: string; got: KillFactionSamples } | null>(null)
  useEffect(() => {
    if (key === null) return
    let live = true
    void ask([key]).then((got) => {
      if (live) setAsked({ key, got })
    })
    return () => {
      live = false
    }
  }, [key, row.count])
  return rowSamples(row, asked !== null && asked.key === key ? asked.got : undefined)
}

/** The rows with every faction row's lines filled in, for a Copy. */
export async function withAskedSamples(rows: readonly GapRow[]): Promise<readonly GapRow[]> {
  const keys = factionRowKeys(rows)
  return keys.length === 0 ? rows : withRowSamples(rows, await ask(keys))
}
