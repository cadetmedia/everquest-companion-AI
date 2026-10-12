// BazaarDetailToggle — folding the picked item's panel away to give the list the screen (owner ask,
// 2026-10-07). The choice is remembered for this viewer in local storage, a convenience only: a
// blocked or empty store just opens the panel. Picking a row opens it again.

import { type JSX, useCallback, useState } from 'react'
import { Button, Paper, Stack, Typography } from '@mui/material'

const KEY = 'eq.bazaar.detailHidden'

function stored(): boolean {
  try {
    return localStorage.getItem(KEY) === '1'
  } catch {
    return false
  }
}

function store(hidden: boolean): void {
  try {
    localStorage.setItem(KEY, hidden ? '1' : '0')
  } catch {
    // A blocked store only means the choice is not remembered.
  }
}

/** Whether the panel is folded away, and a setter that remembers it. */
export function useDetailHidden(): [boolean, (hidden: boolean) => void] {
  const [hidden, setHidden] = useState(stored)
  // One setter for the component's life, so the memoized panel and rows that take it hold.
  const set = useCallback((next: boolean) => {
    store(next)
    setHidden(next)
  }, [])
  return [hidden, set]
}

/** The header's button: fold the panel away. */
export function HideDetailButton({ onHide }: { onHide: () => void }): JSX.Element {
  return (
    <Button size="small" onClick={onHide} sx={{ ml: 'auto' }} data-testid="bazaar-hide-detail">
      Hide details
    </Button>
  )
}

/** The folded panel: the picked item's name and the way back. */
export function HiddenDetail({ name, onShow }: { name: string; onShow: () => void }): JSX.Element {
  return (
    <Paper variant="outlined" sx={{ px: 2, py: 0.75 }} data-testid="bazaar-detail-hidden">
      <Stack direction="row" spacing={1.5} alignItems="center">
        <Typography variant="body2" sx={{ fontWeight: 600 }}>
          {name}
        </Typography>
        <Button size="small" onClick={onShow} data-testid="bazaar-show-detail">
          Show details
        </Button>
      </Stack>
    </Paper>
  )
}
