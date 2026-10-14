// useGameMapFollow.ts — the Map pins overlay hiding while the in-game map is closed (owner ask,
// 2026-10-13). OPTIONAL and off by default: someone may want this overlay up with the game's map
// closed. Main reads the map's open state off the game's UI file (main/gameMapWatch.ts).

import { useEffect, useRef, useState } from 'react'

/** Is the in-game map open? Null until the game's file has said, or when it cannot be found. */
export function useGameMapShown(): boolean | null {
  const [shown, setShown] = useState<boolean | null>(null)
  useEffect(() => {
    let live = true
    void window.eqOverlay.getGameMapShown().then((s) => {
      if (live) setShown(s)
    })
    const off = window.eqOverlay.onGameMapShown(setShown)
    return () => {
      live = false
      off()
    }
  }, [])
  return shown
}

/**
 * Hidden, the window draws nothing and must not eat a click either, pinned or not: the mouse goes
 * through, and on the way back it is handed back to the lock (unlocked takes it, pinned does not).
 */
export function useHiddenMouse(hidden: boolean, locked: boolean): void {
  const was = useRef(false)
  useEffect(() => {
    if (hidden) window.eqOverlay.setIgnoreMouse(true)
    else if (was.current) window.eqOverlay.setIgnoreMouse(locked)
    was.current = hidden
  }, [hidden, locked])
}
