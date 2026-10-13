// MapWaypointCopy.tsx — copying a `/waypoint` line off the Maps tab, and saying that it happened.
//
// Every copy on the tab goes through `useWaypointCopy`: a pane row's copy button, a double-click
// on a pin, and a double-click anywhere else on the map. The notice states the exact line on the
// clipboard, so a user pasting it into the game knows what they are about to type.

import { useCallback, useState, type JSX } from 'react'
import { Alert, Snackbar } from '@mui/material'
import { copyText } from '../../lib/clipboard'
import { waypointCommand } from './waypoint'

interface Copied {
  ok: boolean
  text: string
  at: number
}

export interface WaypointCopy {
  /** Copy the waypoint for a map position; `what` names it in the notice. */
  copy: (p: { x: number; y: number; z?: number }, what?: string) => void
  notice: Copied | null
  dismiss: () => void
}

export function useWaypointCopy(): WaypointCopy {
  const [notice, setNotice] = useState<Copied | null>(null)
  const copy = useCallback((p: { x: number; y: number; z?: number }, what?: string) => {
    const line = waypointCommand(p)
    void copyText(line).then((ok) => {
      const text = ok ? `Copied ${line}${what == null ? '' : ` (${what})`} - paste it in game.` : 'Could not reach the clipboard.'
      setNotice({ ok, text, at: Date.now() })
    })
  }, [])
  const dismiss = useCallback(() => {
    setNotice(null)
  }, [])
  return { copy, notice, dismiss }
}

export function WaypointNotice({ notice, onClose }: { notice: Copied | null; onClose: () => void }): JSX.Element {
  return (
    <Snackbar
      key={notice?.at}
      open={notice != null}
      autoHideDuration={3000}
      onClose={onClose}
      anchorOrigin={{ vertical: 'bottom', horizontal: 'center' }}
    >
      <Alert data-testid="maps-waypoint-copied" severity={notice?.ok === false ? 'warning' : 'success'} variant="filled" onClose={onClose}>
        {notice?.text}
      </Alert>
    </Snackbar>
  )
}
