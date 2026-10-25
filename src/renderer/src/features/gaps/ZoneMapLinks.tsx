// The Gaps tab's doors to the Maps tab (review C7; owner, 2026-10-21): a row's details name the
// zones it was seen in (an edited zone first) as links, and a grouped zone heading carries a map
// button. Each opens the zone through App's `openMapZone` (lib/mapZoneLink.ts); with no opener, or a
// spelling the zone table refuses, nothing is drawn (shared/gapMapZones.ts).

import { type JSX, useMemo } from 'react'
import { Button, IconButton, Stack, Typography } from '@mui/material'
import MapIcon from '@mui/icons-material/Map'
import type { GapRow } from '@shared/gaps'
import { gapMapZones, headingMapZone } from '@shared/gapMapZones'
import { Tooltip } from '../../lib/Tooltip'
import { useMapZoneOpener } from '../../lib/mapZoneLink'
import { PAGE_EXTRAS } from './useGapsData'

/** The row's details line: `Map: Befallen · Lake Nerius`, each a link to its map. */
export function RowMapLinks({ row }: { row: GapRow }): JSX.Element | null {
  const open = useMapZoneOpener()
  const zones = useMemo(() => gapMapZones(row, PAGE_EXTRAS.zoneName), [row])
  if (open === undefined || zones.length === 0) return null
  return (
    <Stack direction="row" spacing={0.5} alignItems="center" flexWrap="wrap" useFlexGap data-testid="gaps-map-links">
      <Typography variant="caption" color="text.secondary" sx={{ minWidth: 64 }}>
        map
      </Typography>
      {zones.map((z) => (
        <Tooltip key={z.short} title={`Open the Maps tab pointed at ${z.label}, to plan the trip there.`}>
          <Button size="small" startIcon={<MapIcon fontSize="inherit" />} onClick={() => open(z.short)} sx={{ textTransform: 'none', py: 0 }}>
            {z.label}
          </Button>
        </Tooltip>
      ))}
    </Stack>
  )
}

/** A zone heading's map button; its click opens the map and does not fold the heading. */
export function ZoneMapButton({ zone }: { zone: string }): JSX.Element | null {
  const open = useMapZoneOpener()
  const short = headingMapZone(zone)
  if (open === undefined || short === null) return null
  return (
    <Tooltip title={`Open the Maps tab pointed at this zone, ${zone}.`}>
      <IconButton
        size="small"
        sx={{ ml: 1, p: 0.25 }}
        onClick={(e) => {
          e.stopPropagation()
          open(short)
        }}
        data-testid="gaps-heading-map"
      >
        <MapIcon fontSize="inherit" />
      </IconButton>
    </Tooltip>
  )
}
