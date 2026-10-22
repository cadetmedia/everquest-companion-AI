// shotCaptureAction.ts — an overlay's camera button for screenshot to wiki (owner, 2026-10-21: "I
// also like B too, lets do both?"). One click captures the EverQuest window in main
// (main/ipc/shotCapture.ts), the same capture the macro's log line runs; the Gaps tab files the
// reading and says what came of it. Shown on a locked overlay's hover too: a locked overlay cannot
// take focus, so the game keeps it and the item window stays as it is.
//
// Behind the Gaps tab's gate (devFlags.ts UNRELEASED): with no tab, nothing would file the capture.

import { UNRELEASED } from '../devFlags'
import type { OverlayHeaderAction } from './OverlayHeader'

export const SHOT_CAPTURE_ACTION: OverlayHeaderAction | undefined = UNRELEASED
  ? {
      label: 'Capture the item window for the wiki',
      glyph: '📷',
      onClick: () => window.eqOverlay.shotCapture(),
      whileLocked: true
    }
  : undefined
