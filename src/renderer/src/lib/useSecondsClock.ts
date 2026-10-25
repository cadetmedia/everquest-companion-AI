// useSecondsClock — the local 1 Hz clock every countdown reads: the Timers tab, the respawn
// overlay and the buffs overlay. A timer must recede while the log is idle, which is exactly when
// no delta is coming; every row already carries its own start, so this costs one render a second
// and zero IPC. In lib/ so the overlay bundle can use it without the Timers tab's data seam.

import { useLayoutEffect, useRef, useState } from 'react'

/**
 * One shared 1 Hz clock. Every countdown on the surface reads this and nothing else.
 *
 * It ticks only while `running` (something on screen to time), so an empty window does not redraw
 * every second. A clock that starts again reads the time before the frame paints, so a row never
 * shows the time the clock stopped at.
 */
export function useSecondsClock(running = true): number {
  const [now, setNow] = useState(() => Date.now())
  const stopped = useRef(false)
  useLayoutEffect(() => {
    if (!running) {
      stopped.current = true
      return
    }
    if (stopped.current) setNow(Date.now())
    stopped.current = false
    const id = setInterval(() => {
      setNow(Date.now())
    }, 1000)
    return () => {
      clearInterval(id)
    }
  }, [running])
  return now
}
