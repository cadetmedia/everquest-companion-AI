// slayer/SlayerMapLayer.tsx — the picked Slayer counters, shaded onto the map on screen.
//
// Each area (slayerAreas.ts) is a translucent circle with the achievements it serves written on
// it. The layer is INERT like the pin layer: `pointerEvents: 'none'` on everything but its one
// switch, so dragging the map works straight through a shaded area.
//
// IT DRAWS THE PICKS, NOT EVERYTHING. With nothing picked on the Achievements tab there is no layer and
// no switch: a map should not change for someone who never opened that tab.
//
// ONE COLOUR OF ITS OWN (the theme's info tone). The map file's labels keep the pack author's
// colours and the wiki pins the warning tone; a third source gets a third colour, so nobody has
// to ask where a mark came from.

import { type JSX, useMemo, useState } from 'react'
import { Chip, useTheme } from '@mui/material'
import { alpha } from '@mui/material/styles'
import type { CharacterSnap } from '@shared/characterTypes'
import type { ZoneShort } from '@shared/maps'
import { useModule } from '../../lib/useModule'
import type { MapViewport } from '../maps/useMapViewport'
import { slayerAreas, type SlayerArea } from './slayerAreas'
import { slayerCatalog, useSlayerData } from './slayerData'
import {
  NO_FACTION_HITS_KEY,
  OUT_OF_ERA_KEY,
  counterRows,
  levelCap,
  loadFlag,
  loadMaxLevel,
  loadPicks,
  savePref
} from './slayerRows'

/** The switch's stored state. Stored as HIDDEN so the layer shows until somebody turns it off. */
export const MAP_AREAS_HIDDEN_KEY = 'eq.slayer.mapAreasHidden'

/** How many achievement names an area spells out before it counts the rest. */
const NAMED = 2

function areaLabel(area: SlayerArea, names: ReadonlyMap<string, string>): string {
  const distinct = [...new Set(area.targets.map((id) => names.get(id) ?? id))]
  const more = distinct.length > NAMED ? ` +${String(distinct.length - NAMED)}` : ''
  return `${distinct.slice(0, NAMED).join(', ')}${more}`
}

function AreaMark({
  area,
  vp,
  label
}: {
  area: SlayerArea
  vp: MapViewport
  label: string
}): JSX.Element {
  const tone = useTheme().palette.info.main
  const at = vp.toScreen(area.x, area.y)
  const r = Math.abs(vp.toScreen(area.x + area.r, area.y).px - at.px)
  return (
    <div
      data-testid="maps-slayer-area"
      style={{
        position: 'absolute',
        left: at.px - r,
        top: at.py - r,
        width: 2 * r,
        height: 2 * r,
        borderRadius: '50%',
        background: alpha(tone, 0.16),
        border: `1px solid ${alpha(tone, 0.7)}`,
        display: 'flex',
        alignItems: 'flex-start',
        justifyContent: 'center'
      }}
    >
      <span
        style={{
          marginTop: -9,
          padding: '0 6px',
          borderRadius: 8,
          fontSize: 11,
          lineHeight: '18px',
          whiteSpace: 'nowrap',
          color: '#000',
          background: alpha(tone, 0.92)
        }}
      >
        {label} - {String(area.spawns)} {area.spawns === 1 ? 'spawn' : 'spawns'}
      </span>
    </div>
  )
}

export default function SlayerMapLayer({
  zone,
  vp
}: {
  zone: ZoneShort
  vp: MapViewport
}): JSX.Element | null {
  const { record } = useSlayerData()
  // The Achievements tab's level cap, faction switch and era switch, read as its plan reads them,
  // so the shading and the zone list leave out the same mobs.
  const own = useModule<CharacterSnap>('character')?.level?.level
  const maxLevel = levelCap(loadMaxLevel(), own)
  const noFactionHits = loadFlag(NO_FACTION_HITS_KEY)
  const outOfEra = loadFlag(OUT_OF_ERA_KEY)
  const cap = useMemo(
    () => ({ maxLevel, noFactionHits, outOfEra }),
    [maxLevel, noFactionHits, outOfEra]
  )
  const [hidden, setHidden] = useState(() => loadFlag(MAP_AREAS_HIDDEN_KEY))
  const picked = useMemo(() => {
    if (record === null) return []
    const picks = new Set(loadPicks())
    return counterRows(record, new Map()).filter((row) => picks.has(row.id))
  }, [record])
  const areas = useMemo(
    () => slayerAreas(zone, slayerCatalog(), picked.map((row) => row.target), cap),
    [zone, picked, cap]
  )
  const names = useMemo(() => new Map(picked.map((r) => [r.id, r.counter.achievement])), [picked])
  if (areas.length === 0) return null
  return (
    <div
      data-testid="maps-slayer-layer"
      style={{ position: 'absolute', inset: 0, overflow: 'hidden', pointerEvents: 'none' }}
    >
      {!hidden &&
        areas.map((area) => (
          <AreaMark
            key={`${String(area.x)},${String(area.y)}`}
            area={area}
            vp={vp}
            label={areaLabel(area, names)}
          />
        ))}
      <Chip
        size="small"
        data-testid="maps-slayer-switch"
        color={hidden ? 'default' : 'info'}
        variant={hidden ? 'outlined' : 'filled'}
        label={hidden ? 'Slayer areas off' : 'Slayer areas'}
        onPointerDown={(e) => {
          e.stopPropagation()
        }}
        onClick={() => {
          savePref(MAP_AREAS_HIDDEN_KEY, hidden ? '0' : '1')
          setHidden(!hidden)
        }}
        sx={{ position: 'absolute', left: 8, bottom: 8, pointerEvents: 'auto' }}
      />
    </div>
  )
}
