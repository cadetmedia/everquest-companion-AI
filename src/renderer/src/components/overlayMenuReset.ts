// overlayMenuReset.ts — the title bar Overlay menu's resets, one per overlay row and one for all
// (owner asks, 2026-10-14; shared/overlayReset.ts says what a reset keeps). Its own file because
// TitleBar.tsx sits at the 400-line ceiling.

import { useEffect, useRef, useState } from 'react'
import type { OverlayKind } from '@shared/types'
import { clearOverlayLocalKeys, localPrefixesOf, resetKinds } from '@shared/overlayReset'

/** How long a reset waits for its confirming second click. */
const RESET_CONFIRM_MS = 4000

/** What a reset click names: one overlay (its row's button) or all of them (the foot row). */
export type ResetTarget = OverlayKind | 'all'

export interface OverlayReset {
  armed: ResetTarget | null
  click: (target: ResetTarget) => void
  disarm: () => void
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

/**
 * The menu's resets (shared/overlayReset.ts): the first click arms one, a second on the same one
 * within a few seconds runs it. Resetting all closes the menu; one row's reset leaves it open.
 */
export function useOverlayReset(onAll: () => void): OverlayReset {
  const [armed, setArmed] = useState<ResetTarget | null>(null)
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null)
  const disarm = (): void => {
    if (timer.current) clearTimeout(timer.current)
    setArmed(null)
  }
  useEffect(
    () => () => {
      if (timer.current) clearTimeout(timer.current)
    },
    []
  )
  const click = (target: ResetTarget): void => {
    disarm()
    if (armed !== target) {
      setArmed(target)
      timer.current = setTimeout(() => {
        setArmed(null)
      }, RESET_CONFIRM_MS)
      return
    }
    if (target === 'all') onAll()
    void runReset(target)
  }
  return { armed, click, disarm }
}
