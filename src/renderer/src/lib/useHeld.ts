// useHeld — a value that follows `live` at most once every `holdMs` (owner, 2026-10-20: with the
// Wiki Gaps overlay open the whole app took 500 ms a tab click, because its background copy of the
// Gaps list re-derived everything on every kill, loot and /con). The first value lands at once; a
// change after that waits out the rest of the gap, measured from the last hand-over, so a value
// that moves faster than the gap is still handed over once per gap instead of being pushed back
// forever. `holdMs` 0 is `live` itself, untouched.

import { useEffect, useRef, useState } from 'react'

export function useHeld<T>(live: T, holdMs: number): T {
  const [held, setHeld] = useState(live)
  const lastAt = useRef(Number.NEGATIVE_INFINITY)
  useEffect(() => {
    if (holdMs <= 0 || Object.is(live, held)) return
    const timer = setTimeout(
      () => {
        lastAt.current = Date.now()
        setHeld(live)
      },
      Math.max(0, lastAt.current + holdMs - Date.now())
    )
    return () => {
      clearTimeout(timer)
    }
  }, [live, held, holdMs])
  return holdMs <= 0 ? live : held
}
