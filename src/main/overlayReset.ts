// overlayReset.ts — main's half of "Reset overlay positions" (shared/overlayReset.ts says what a
// reset keeps). Every overlay window is closed first, so none of them writes its old place back
// on the way out; the renderer reopens the ones that were open once it has cleared their own
// localStorage keys.

import { OVERLAY_KINDS, type OverlayKind } from '../shared/types'
import { overlayResetPatch } from '../shared/overlayReset'
import { logInfo } from './errorLog'
import { DEFAULT_OVERLAY_CONFIG, setOverlayConfig } from './store'
import { getOverlayWindow, isOverlayOpen } from './windows'

function closeAndWait(kind: OverlayKind): Promise<void> {
  const w = getOverlayWindow(kind)
  if (w == null || w.isDestroyed()) return Promise.resolve()
  return new Promise((resolve) => {
    w.once('closed', () => {
      resolve()
    })
    w.destroy()
  })
}

/** Close every overlay and reset each kind's place and look. Resolves to the kinds that were open. */
export async function resetOverlays(): Promise<OverlayKind[]> {
  const open = OVERLAY_KINDS.filter((k) => isOverlayOpen(k))
  await Promise.all(open.map(closeAndWait))
  for (const kind of OVERLAY_KINDS) setOverlayConfig(kind, overlayResetPatch(DEFAULT_OVERLAY_CONFIG[kind]))
  logInfo('[everquest-companion]', `overlays reset; reopening ${open.join(', ') || 'none'}`)
  return open
}
