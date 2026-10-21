// overlayBuried — the overlays put back on top when Windows has stacked them under another window
// (owner, 2026-10-20: "i just opened mspaint, and alt tabbed back to everquest and the overlays
// are not showing", even clicking the game's taskbar icon, until the reset button).
//
// MEASURED ON THE OWNER'S MACHINE: opening Paint leaves every overlay still flagged always-on-top
// but stacked under ordinary windows, so whichever window is activated next — the game — covers
// them. The un-park re-raise (shared/overlayUnpark.ts) only fires after 5 s away, and the misses
// were the quicker trips. So the presence watcher looks at the real stacking after each foreground
// change (presenceNative.ts `ownTopmostBelowForeground`) and says `B` when an overlay is under;
// this raises them then and only then. An alt-tab that leaves them where they belong moves no
// window, which keeps the hitch topmost.ts records from coming back.

import { OVERLAY_KINDS } from '../shared/types'
import { logInfo } from './errorLog'
import { raiseTopmost } from './topmost'
import { getOverlayWindow, isOverlayOpen, raiseCursorRing } from './windows'

/** A floor between two raises, in case something keeps stacking a window over ours. */
const MIN_GAP_MS = 250

let lastRaiseAt = Number.NEGATIVE_INFINITY

/** Raise every shown overlay, then the cursor ring above them, as every raise path ends. */
export function raiseBuriedOverlays(now = Date.now()): void {
  if (now - lastRaiseAt < MIN_GAP_MS) return
  lastRaiseAt = now
  const raised: string[] = []
  for (const kind of OVERLAY_KINDS) {
    const w = isOverlayOpen(kind) ? getOverlayWindow(kind) : null
    if (w == null || w.isDestroyed() || !w.isVisible()) continue
    raiseTopmost(w)
    raised.push(kind)
  }
  raiseCursorRing()
  logInfo('[everquest-companion]', `presence: overlays found under the foreground window, re-raised: ${raised.join(', ') || 'none open'}`)
}
