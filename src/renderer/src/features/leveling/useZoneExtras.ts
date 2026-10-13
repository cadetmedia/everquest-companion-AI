// leveling/useZoneExtras.ts — the AA points and motes of the selected range, per zone, for the
// range panel's zone table (owner ask, 2026-10-13). The filing is shared/zoneHistory.ts's.

import { useMemo } from 'react'
import type { RangeStats } from '@shared/progressionStats'
import { zoneExtras, type ZoneExtra } from '@shared/zoneHistory'
import { useLootHistory } from '../loot/useLootHistory'
import { useCreditedProgression } from './useCreditedProgression'

export function useZoneExtras(stats: RangeStats): ReadonlyMap<string, ZoneExtra> {
  // The same credited snapshot the panel's own stats come from (useCreditedProgression.ts).
  const snap = useCreditedProgression()
  const loot = useLootHistory()
  const { t0, t1 } = stats
  return useMemo(() => zoneExtras(snap, loot, { t0, t1 }), [snap, loot, t0, t1])
}
