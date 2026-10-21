// The Combat tab's "still drawing the last answer" sign (owner, 2026-10-20: "show the data and then
// have each element update as we get the correct data in with a loading indicator somewhere but
// don't blank the screen"). It floats over the top edge rather than taking a row, so appearing and
// going never moves the dashboard under the reader's eye. combatFeed.ts says when it shows.

import type { JSX } from 'react'
import { CircularProgress, Paper, Typography } from '@mui/material'

export default function UpdatingBadge({ show }: { show: boolean }): JSX.Element | null {
  if (!show) return null
  return (
    <Paper
      variant="outlined"
      data-testid="combat-updating"
      sx={{ position: 'absolute', top: 4, left: '50%', transform: 'translateX(-50%)', zIndex: 2, px: 1, py: 0.25, display: 'flex', alignItems: 'center', gap: 0.75, pointerEvents: 'none' }}
    >
      <CircularProgress size={10} thickness={6} />
      <Typography variant="caption" color="text.secondary">
        Updating…
      </Typography>
    </Paper>
  )
}
