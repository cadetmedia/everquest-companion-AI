// BazaarDetailToggle — folding the picked item's panel away to give the list the screen (owner ask,
// 2026-10-07). The choice is remembered for this viewer in local storage, a convenience only: a
// blocked or empty store just opens the panel. Picking a row opens it again.

import type { JSX } from 'react'
import { Button, Paper, Stack, Typography } from '@mui/material'
import { useBoolPref } from '../combat/useCombatPrefs'

const KEY = 'eq.bazaar.detailHidden'

/** Whether the panel is folded away, and a setter that remembers it: the app's one-bit view pref,
 *  whose setter holds for the component's life, so the memoized panel and rows that take it hold. */
export function useDetailHidden(): [boolean, (hidden: boolean) => void] {
  return useBoolPref(KEY, false)
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
