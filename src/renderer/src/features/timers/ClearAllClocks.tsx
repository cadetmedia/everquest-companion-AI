// CLEAR ALL (owner ruling, 2026-10-17 — argued in shared/respawn.ts's Clear all section).
//
// One button beside the scope switch, and it clears exactly what the switch is showing: the clocks
// in the zone you are in, or every clock. It is the round-4 unwatch for each of those mobs, sent as
// ONE call so main writes the store once, and it is the one unwatch on this feature that ASKS
// FIRST — the single Unwatch on a row stays one click — because one press that stops a dozen clocks
// is a different size of mistake from one that stops the clock in front of you.
//
// THE DIALOG STATES THE COUNT AND THE PLACE, and the one consequence a player could not guess: a
// watch is a name, so clearing a zone's clocks also stops the same names' clocks in other zones.
// The words and the arithmetic are shared/respawnWatchList.ts's (`respawnClearPlan`,
// `respawnClearAllText`), because working out which rows go is filtering served rows, which a
// renderer does not do (owner ruling 4). This file draws them and nothing else.
//
// THE SHAPE IS THE APP'S CONFIRM: the triage tab's ConfirmDialog — title, one paragraph, Cancel and
// a contained error-coloured confirm. A typed respawn on any of these mobs is kept (main moves it
// aside), which is why the body can promise it back rather than warn about it.

import { useState, type JSX } from 'react'
import { Button, Dialog, DialogActions, DialogContent, DialogContentText, DialogTitle } from '@mui/material'
import { respawnClearAllText, type RespawnClearPlan } from '@shared/respawnWatchList'

export function ClearAllClocks({
  plan,
  zone,
  onClear
}: {
  plan: RespawnClearPlan
  /** The zone the scope is showing, or null when it shows every zone. */
  zone: string | null
  onClear: (keys: string[]) => void
}): JSX.Element {
  const [open, setOpen] = useState(false)
  const text = respawnClearAllText(plan, zone)
  return (
    <>
      <Button
        size="small"
        variant="outlined"
        color="inherit"
        data-testid="respawn-clear-all"
        disabled={plan.clocks === 0}
        sx={{ textTransform: 'none' }}
        onClick={() => setOpen(true)}
      >
        Clear all
      </Button>
      <Dialog open={open} onClose={() => setOpen(false)} maxWidth="xs" fullWidth data-testid="respawn-clear-all-dialog">
        <DialogTitle>{text.title}</DialogTitle>
        <DialogContent>
          <DialogContentText>{text.body}</DialogContentText>
        </DialogContent>
        <DialogActions>
          <Button data-testid="respawn-clear-all-cancel" onClick={() => setOpen(false)}>
            Cancel
          </Button>
          <Button
            color="error"
            variant="contained"
            data-testid="respawn-clear-all-confirm"
            // The scope can empty while the dialog is open (a zone line arrives): nothing to clear.
            disabled={plan.clocks === 0}
            onClick={() => {
              onClear(plan.keys)
              setOpen(false)
            }}
          >
            Clear all
          </Button>
        </DialogActions>
      </Dialog>
    </>
  )
}
