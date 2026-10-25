// leveling/useCreditedProgression.ts — the progression snapshot with every merchant sale credited
// to the loot it paid for (shared/coinAttribution.ts; owner ask, 2026-10-13), so a zone's coin is
// what was looted there, wherever it was sold.

import { useMemo } from 'react'
import type { LootEvent, ProgressionSnap } from '@shared/types'
import { attributeSales } from '@shared/coinAttribution'
import { useModule } from '../../lib/useModule'
import { useLootHistory } from '../loot/useLootHistory'
import { EMPTY_PROGRESSION } from './progressionDelta'

/**
 * One credited answer per (progression, loot) pair for the window, not one per mount (perf audit,
 * 2026-10-20): the Leveling tab reads this twice and a revisit read it again, and each pass returned
 * a NEW snapshot, which broke every memo keyed on it downstream. Both inputs are the module store's
 * held objects, so their identity is the key.
 */
const credited = new WeakMap<ProgressionSnap, { loot: readonly LootEvent[]; out: ProgressionSnap }>()

function creditedOf(prog: ProgressionSnap, loot: readonly LootEvent[]): ProgressionSnap {
  const hit = credited.get(prog)
  if (hit?.loot === loot) return hit.out
  const out = attributeSales(prog, loot)
  credited.set(prog, { loot, out })
  return out
}

export function useCreditedProgression(): ProgressionSnap {
  const prog = useModule<ProgressionSnap>('progression') ?? EMPTY_PROGRESSION
  const loot = useLootHistory()
  return useMemo(() => creditedOf(prog, loot), [prog, loot])
}
