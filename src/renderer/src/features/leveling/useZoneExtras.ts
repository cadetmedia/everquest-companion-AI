// leveling/useZoneExtras.ts — the AA points and motes of the selected range, per zone, for the
// range panel's zone table (owner ask, 2026-10-13). The filing is shared/zoneHistory.ts's.

import { useMemo } from 'react'
import type { RangeStats } from '@shared/progressionStats'
import type { ProgressionSnap } from '@shared/types'
import { zoneExtras, type ZoneExtra } from '@shared/zoneHistory'
import { useModule } from '../../lib/useModule'
import { useLootHistory } from '../loot/useLootHistory'
import { EMPTY_PROGRESSION } from './progressionDelta'

export function useZoneExtras(stats: RangeStats): ReadonlyMap<string, ZoneExtra> {
  const snap = useModule<ProgressionSnap>('progression') ?? EMPTY_PROGRESSION
  const loot = useLootHistory()
  const { t0, t1 } = stats
  return useMemo(() => zoneExtras(snap, loot, { t0, t1 }), [snap, loot, t0, t1])
}
