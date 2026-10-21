// useOverlayOpen — is one overlay window open right now? Read once from main, then kept current by
// main's `onOverlayState` push, which fires for the Overlay menu, the window's own close button and
// a launch restore alike. False until the first answer, so a reader that starts work only while a
// window is open does nothing for the instant it takes to ask.
//
// useBannerOverlay is the same question for the alert banner, asked by the Alerts tab; this is the
// general form, first used by the Wiki Gaps overlay's publisher (unreleasedGaps.tsx).

import { useEffect, useState } from 'react'
import type { OverlayKind } from '@shared/types'

export function useOverlayOpen(kind: OverlayKind): boolean {
  const [open, setOpen] = useState(false)
  useEffect(() => {
    let alive = true
    void window.eq.getOverlayState().then((s) => {
      if (alive) setOpen(s[kind])
    })
    const off = window.eq.onOverlayState((s) => {
      if (s.kind === kind) setOpen(s.open)
    })
    return () => {
      alive = false
      off()
    }
  }, [kind])
  return open
}
