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

import { type JSX, useState } from 'react'
import { Chip, useTheme } from '@mui/material'
import type { ZoneShort } from '@shared/maps'
import { areaText } from '@shared/slayerOverlay'
import { AreaCircle } from '../maps/AreaCircle'
import type { MapViewport } from '../maps/useMapViewport'
import { loadFlag, savePref } from './slayerRows'
import { areaLabel } from './slayerAreas'
import { useSlayerMapAreas } from './useSlayerMapAreas'

/** The switch's stored state. Stored as HIDDEN so the layer shows until somebody turns it off. */
export const MAP_AREAS_HIDDEN_KEY = 'eq.slayer.mapAreasHidden'

export default function SlayerMapLayer({
  zone,
  vp
}: {
  zone: ZoneShort
  vp: MapViewport
}): JSX.Element | null {
  const tone = useTheme().palette.info.main
  const { areas, names } = useSlayerMapAreas(zone)
  const [hidden, setHidden] = useState(() => loadFlag(MAP_AREAS_HIDDEN_KEY))
  if (areas.length === 0) return null
  return (
    <div
      data-testid="maps-slayer-layer"
      style={{ position: 'absolute', inset: 0, overflow: 'hidden', pointerEvents: 'none' }}
    >
      {!hidden &&
        areas.map((area) => {
          const at = vp.toScreen(area.x, area.y)
          return (
            <AreaCircle
              key={`${String(area.x)},${String(area.y)}`}
              testId="maps-slayer-area"
              at={at}
              r={Math.abs(vp.toScreen(area.x + area.r, area.y).px - at.px)}
              tone={tone}
              text={areaText(areaLabel(area, names), area.spawns)}
            />
          )
        })}
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
