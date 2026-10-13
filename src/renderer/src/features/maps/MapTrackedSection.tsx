// MapTrackedSection.tsx — the pane's "Tracked" list: what this zone's track list holds, at the top
// of the pane, so the points you picked stay in reach while the search box looks for others. Each
// row centres the map on its first position, copies its /waypoint, or comes off the list. Absent
// when nothing in the zone is tracked. It is the same list the Map pins overlay draws.

import type { JSX } from 'react'
import { IconButton, List, ListItem, ListItemButton, ListItemText, Stack, Typography } from '@mui/material'
import AlarmIcon from '@mui/icons-material/Alarm'
import BookmarkIcon from '@mui/icons-material/Bookmark'
import ContentCopyIcon from '@mui/icons-material/ContentCopy'
import { TRACK_COLOR, type TrackedPoint } from './mapTrack'
import type { ZoneTrack } from './useZoneTrack'
import type { RowActions } from './MapMobPaneRow'
import { Tooltip } from '../../lib/Tooltip'

export function MapTrackedSection({
  track,
  onCopy,
  onCenter
}: {
  track: ZoneTrack
  onCopy: RowActions['onCopy']
  onCenter: (x: number, y: number) => void
}): JSX.Element | null {
  if (track.points.length === 0) return null
  return (
    <Stack spacing={0.5} sx={{ mb: 1 }} data-testid="maps-pane-tracked">
      <Stack direction="row" spacing={0.75} alignItems="baseline" sx={{ px: 1 }}>
        <Typography variant="caption" sx={{ fontWeight: 600, color: TRACK_COLOR }}>
          Tracked
        </Typography>
        <Typography variant="caption" color="text.disabled" noWrap>
          also on the Map pins overlay
        </Typography>
      </Stack>
      <List dense disablePadding>
        {track.points.map((p) => (
          <TrackedRow key={p.id} point={p} track={track} onCopy={onCopy} onCenter={onCenter} />
        ))}
      </List>
    </Stack>
  )
}

function TrackedRow({
  point,
  track,
  onCopy,
  onCenter
}: {
  point: TrackedPoint
  track: ZoneTrack
  onCopy: RowActions['onCopy']
  onCenter: (x: number, y: number) => void
}): JSX.Element {
  const first = point.pins[0]
  const spots = point.pins.length > 1 ? `${String(point.pins.length)} spawn points` : null
  // The buttons sit in the row's flex line after the name, as on the rows below (never floated over
  // it). The alarm removes the Timers watch; the bookmark removes a hand-made track; a mob that is
  // both shows both, and one tracked only through its timer shows the alarm alone.
  const timed = point.kind === 'mob' && track.isTimed(point.name)
  return (
    <ListItem disablePadding>
      <ListItemButton dense data-testid="maps-tracked-row" onClick={() => { onCenter(first.x, first.y) }}>
        <ListItemText
          primary={point.name}
          secondary={spots}
          slotProps={{ primary: { variant: 'body2', noWrap: true }, secondary: { variant: 'caption' } }}
        />
      </ListItemButton>
      <Stack direction="row" alignItems="center" sx={{ flexShrink: 0, pr: 0.5 }}>
        <Tooltip title="Copy the /waypoint command for this spot">
          <IconButton size="small" data-testid="maps-tracked-copy" onClick={() => { onCopy(first, point.name) }}>
            <ContentCopyIcon sx={{ fontSize: 14 }} />
          </IconButton>
        </Tooltip>
        {timed && (
          <Tooltip title="Remove the respawn timer">
            <IconButton size="small" data-testid="maps-tracked-timer" onClick={() => { track.unwatch(point.name) }}>
              <AlarmIcon sx={{ fontSize: 15, color: TRACK_COLOR }} />
            </IconButton>
          </Tooltip>
        )}
        {point.auto !== true && (
          <Tooltip title="Stop tracking">
            <IconButton size="small" data-testid="maps-tracked-remove" onClick={() => { track.untrack(point.id) }}>
              <BookmarkIcon sx={{ fontSize: 15, color: TRACK_COLOR }} />
            </IconButton>
          </Tooltip>
        )}
      </Stack>
    </ListItem>
  )
}
