// A price move up or down, in the status words rather than color alone. Shared by the list's rows
// (BazaarItemRow.tsx) and the picked item's price grid (BazaarView.tsx).

import { type JSX } from 'react'
import { Typography } from '@mui/material'
import { formatMove } from '@shared/bazaar'

export function Move({ f }: { f: number | null }): JSX.Element | null {
  if (f === null || Math.round(f * 100) === 0) return null
  const up = f > 0
  return (
    <Typography component="span" variant="body2" sx={{ color: up ? 'success.main' : 'warning.main' }}>
      {up ? '▲' : '▼'} {formatMove(f)}
    </Typography>
  )
}
