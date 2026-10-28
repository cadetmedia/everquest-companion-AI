// SlayerOverlayPublisher — the picked Slayer counters' areas in the zone the log last named, for the
// Map pins overlay's Achievements chip (shared/slayerOverlay.ts). It renders nothing: it reads the
// areas exactly as the Maps tab's layer does (useSlayerMapAreas) and writes them, only on change,
// to the storage the overlay shares with this window. unreleasedSlayerMap.tsx mounts it only while
// the overlay is open.

import { useEffect, useMemo } from 'react'
import type { CharacterSnap } from '@shared/characterTypes'
import { SLAYER_OVERLAY_KEY, type SlayerOverlayPayload } from '@shared/slayerOverlay'
import { zoneShortName } from '@shared/zones'
import { useModule } from '../../lib/useModule'
import { toOverlayAreas } from './slayerAreas'
import { useSlayerMapAreas } from './useSlayerMapAreas'

export default function SlayerOverlayPublisher(): null {
  const zone = zoneShortName(useModule<CharacterSnap>('character')?.zone)
  const { areas, names, picks } = useSlayerMapAreas(zone)
  const raw = useMemo(() => {
    const payload: SlayerOverlayPayload = { zone, picks, areas: toOverlayAreas(areas, names) }
    return JSON.stringify(payload)
  }, [zone, picks, areas, names])
  useEffect(() => {
    try {
      if (localStorage.getItem(SLAYER_OVERLAY_KEY) !== raw) localStorage.setItem(SLAYER_OVERLAY_KEY, raw)
    } catch {
      // Storage refused the write: the overlay keeps the areas it last read.
    }
  }, [raw])
  return null
}
