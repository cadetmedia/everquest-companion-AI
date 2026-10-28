// slayer/useSlayerMapAreas.ts — the picked Slayer counters' areas on one map, as the Achievements
// tab's plan reads them. One reading for both maps that draw them: the Maps tab's layer
// (SlayerMapLayer.tsx) and the Map pins overlay's feed (SlayerOverlayPublisher.tsx). The text on an
// area is `areaLabel` (slayerAreas.ts) through `areaText` (shared/slayerOverlay.ts).

import { useEffect, useMemo, useState } from 'react'
import type { CharacterSnap } from '@shared/characterTypes'
import type { ZoneShort } from '@shared/maps'
import { metVersion } from '@shared/metInLog'
import { useModule } from '../../lib/useModule'
import { slayerAreas, type SlayerArea } from './slayerAreas'
import { slayerCatalog, useSlayerData } from './slayerData'
import {
  NO_FACTION_HITS_KEY,
  OUT_OF_ERA_KEY,
  SLAYER_PREFS_EVENT,
  counterRows,
  levelCap,
  loadFlag,
  loadMaxLevel,
  loadPicks
} from './slayerRows'

/** Bumps whenever the Achievements tab saves a choice in this window. */
function usePrefsVersion(): number {
  const [version, setVersion] = useState(0)
  useEffect(() => {
    const bump = (): void => {
      setVersion((v) => v + 1)
    }
    window.addEventListener(SLAYER_PREFS_EVENT, bump)
    return () => {
      window.removeEventListener(SLAYER_PREFS_EVENT, bump)
    }
  }, [])
  return version
}

export interface SlayerMapAreas {
  areas: SlayerArea[]
  /** counter id -> its achievement's name, for `areaLabel` */
  names: Map<string, string>
  /** how many open counters are picked; none means no layer and no switch */
  picks: number
}

export function useSlayerMapAreas(zone: ZoneShort | null): SlayerMapAreas {
  const { record } = useSlayerData()
  // Re-rendered when the tab saves a choice, so the reads below see it.
  usePrefsVersion()
  const pickIds = loadPicks().join('\n')
  // The Achievements tab's level cap, faction switch and era switch, read as its plan reads them,
  // so the shading and the zone list leave out the same mobs; and the log's evidence version,
  // so a flagged mob the player met is shaded again when the evidence arrives.
  const own = useModule<CharacterSnap>('character')?.level?.level
  const maxLevel = levelCap(loadMaxLevel(), own)
  const noFactionHits = loadFlag(NO_FACTION_HITS_KEY)
  const outOfEra = loadFlag(OUT_OF_ERA_KEY)
  const met = metVersion()
  const cap = useMemo(
    () => ({ maxLevel, noFactionHits, outOfEra, met }),
    [maxLevel, noFactionHits, outOfEra, met]
  )
  const picked = useMemo(() => {
    if (record === null) return []
    const picks = new Set(pickIds.split('\n'))
    return counterRows(record, new Map()).filter((row) => picks.has(row.id))
  }, [record, pickIds])
  const areas = useMemo(
    () => (zone === null ? [] : slayerAreas(zone, slayerCatalog(), picked.map((row) => row.target), cap)),
    [zone, picked, cap]
  )
  const names = useMemo(() => new Map(picked.map((r) => [r.id, r.counter.achievement])), [picked])
  return { areas, names, picks: picked.length }
}
