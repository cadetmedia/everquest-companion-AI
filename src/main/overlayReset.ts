// overlayReset.ts — main's half of the Overlay menu's resets (shared/overlayReset.ts says what a
// reset keeps). The reset windows are closed first, so none of them writes its old place back on
// the way out; the renderer reopens the ones that were open once it has cleared their own
// localStorage keys.

import type { OverlayKind } from '../shared/types'
import { overlayResetPatch, resetKinds } from '../shared/overlayReset'
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

/** Close the named overlays (every one when none is named) and reset each one's place and look.
 *  Resolves to the kinds that were open. `kinds` is renderer input, filtered to real kinds. */
export async function resetOverlays(kinds?: unknown): Promise<OverlayKind[]> {
  const reset = resetKinds(kinds)
  const open = reset.filter((k) => isOverlayOpen(k))
  await Promise.all(open.map(closeAndWait))
  for (const kind of reset) setOverlayConfig(kind, overlayResetPatch(DEFAULT_OVERLAY_CONFIG[kind]))
  logInfo('[everquest-companion]', `overlays reset: ${reset.join(', ')}; reopening ${open.join(', ') || 'none'}`)
  return open
}
