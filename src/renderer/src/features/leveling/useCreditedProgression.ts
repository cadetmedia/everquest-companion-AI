// leveling/useCreditedProgression.ts — the progression snapshot with every merchant sale credited
// to the loot it paid for (shared/coinAttribution.ts; owner ask, 2026-10-13), so a zone's coin is
// what was looted there, wherever it was sold.

import { useMemo } from 'react'
import type { ProgressionSnap } from '@shared/types'
import { attributeSales } from '@shared/coinAttribution'
import { useModule } from '../../lib/useModule'
import { useLootHistory } from '../loot/useLootHistory'
import { EMPTY_PROGRESSION } from './progressionDelta'

export function useCreditedProgression(): ProgressionSnap {
  const prog = useModule<ProgressionSnap>('progression') ?? EMPTY_PROGRESSION
  const loot = useLootHistory()
  return useMemo(() => attributeSales(prog, loot), [prog, loot])
}
