// overlay/useTimerDismissals.ts — the bars a buff/debuff timer window has been told to stop drawing.

import { useCallback, useEffect, useRef, useState } from 'react'
import { withTimerDismissal, type BuffTimerRow, type TimerDismissals } from '../../../shared/buffTimers'

interface Held {
  dismissals: TimerDismissals
  /** Bumped on every change, for the drop flash's epoch: the map's size does not move when a row
   *  is dismissed again or the cap evicts one, and that dismissal would read as a drop. */
  changes: number
}

/**
 * THE BARS THIS WINDOW HAS BEEN TOLD TO STOP DRAWING (JOS-203).
 *
 * It is a `useState` and it stops here: nothing is sent to main, nothing is persisted, and the
 * rule that reads it is a pure function over rows (shared/buffTimers.ts, where the owner's ruling
 * is written). That is the whole of "the learner never notices" — there is no channel for it to
 * notice through. The verdicts survive every delta and every re-hydrate because they are re-applied
 * to whatever row set arrives; they do NOT survive closing the window, which is correct: a
 * dismissal is a judgement about the bars in front of you, not a fact about the world.
 *
 * Nor do they survive a switch to another character: row ids (`self|self|clarity`) repeat across
 * characters, so one character's dismissal would hide the next one's bar.
 */
export function useTimerDismissals(): Held & { dismiss: (row: BuffTimerRow) => void } {
  const [held, setHeld] = useState<Held>(() => ({ dismissals: new Map(), changes: 0 }))
  const dismiss = useCallback((row: BuffTimerRow) => {
    setHeld((prev) => ({ dismissals: withTimerDismissal(prev.dismissals, row), changes: prev.changes + 1 }))
  }, [])
  const characterRef = useRef<string | null>(null)
  useEffect(() => {
    return window.eqOverlay.onCharacter((c) => {
      const key = c === null ? '' : `${c.name}|${c.server}`
      // A rebuild of the same character keeps them.
      if (key === characterRef.current) return
      characterRef.current = key
      setHeld((prev) => (prev.dismissals.size === 0 ? prev : { dismissals: new Map(), changes: prev.changes + 1 }))
    })
  }, [])
  return { ...held, dismiss }
}
