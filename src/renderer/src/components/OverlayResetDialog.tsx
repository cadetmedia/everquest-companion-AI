// OverlayResetDialog.tsx — the title bar Overlay menu's resets, one per overlay row and one for all
// (owner asks, 2026-10-14; shared/overlayReset.ts says what a reset keeps). A reset button opens a
// popup that names what will be reset; nothing changes until its Reset is pressed. Its own file
// because TitleBar.tsx sits at the 400-line ceiling.

import { type JSX, useState } from 'react'
import { Button, Dialog, DialogActions, DialogContent, DialogContentText, DialogTitle } from '@mui/material'
import type { OverlayKind } from '@shared/types'
import { OVERLAY_KIND_LABEL } from '@shared/overlayLabels'
import { clearOverlayLocalKeys, localPrefixesOf, resetKinds } from '@shared/overlayReset'

/** What a reset names: one overlay (its row's button) or all of them (the foot row). */
export type ResetTarget = OverlayKind | 'all'

export interface OverlayReset {
  /** The reset waiting on the popup, if any. */
  pending: ResetTarget | null
  ask: (target: ResetTarget) => void
  cancel: () => void
  confirm: () => void
}

/** Main resets the named overlays (closing the open ones); their own localStorage keys are cleared
 *  while they are closed; then the ones that were open are opened again. */
async function runReset(target: ResetTarget): Promise<void> {
  const kinds = target === 'all' ? undefined : [target]
  const open = await window.eq.resetOverlays(kinds)
  try {
    clearOverlayLocalKeys(localStorage, localPrefixesOf(resetKinds(kinds)))
  } catch {
    // A blocked store has nothing of ours to clear.
  }
  for (const kind of open) await window.eq.toggleOverlay(kind)
}

/** The reset waiting on its popup. `onAsk` runs when one is asked for (the menu closes). */
export function useOverlayReset(onAsk: () => void): OverlayReset {
  const [pending, setPending] = useState<ResetTarget | null>(null)
  return {
    pending,
    ask: (target) => {
      onAsk()
      setPending(target)
    },
    cancel: () => {
      setPending(null)
    },
    confirm: () => {
      if (pending != null) void runReset(pending)
      setPending(null)
    }
  }
}

/** The confirming popup. */
export function OverlayResetDialog({ reset }: { reset: OverlayReset }): JSX.Element {
  const { pending } = reset
  const all = pending === 'all'
  const name = pending == null || all ? '' : OVERLAY_KIND_LABEL[pending]
  return (
    <Dialog open={pending != null} onClose={reset.cancel} data-testid="overlay-reset-dialog">
      <DialogTitle>{all ? 'Reset all overlays?' : `Reset ${name}?`}</DialogTitle>
      <DialogContent>
        <DialogContentText>
          {all ? 'Every overlay goes' : `${name} goes`} back to its default place, size, lock, transparency and
          text size. Open overlays stay open; what each one shows is kept.
        </DialogContentText>
      </DialogContent>
      <DialogActions>
        <Button onClick={reset.cancel}>Cancel</Button>
        <Button color="warning" variant="contained" data-testid="overlay-reset-confirm" onClick={reset.confirm}>
          Reset
        </Button>
      </DialogActions>
    </Dialog>
  )
}
