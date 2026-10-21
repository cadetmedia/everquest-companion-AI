import { useEffect, useState } from 'react'
import type { CombatSnapshot } from '@shared/combat'
import { coalesced, createFeed, keptSnapshot } from '../features/combat/combatFeed'

/**
 * Views the main-process combat engine for a floating overlay (Task #52; per-kind in Task #54).
 *
 * Same event-driven poll pattern as the main app's `useCombat` (immediate refresh on the throttled
 * `combat:activity` nudge + a 1s fallback poll for the idle "active" decay), pared down to what an
 * overlay needs. It talks to the engine over the minimal `window.eqOverlay` bridge.
 *
 * `selectedId` drives which segment the snapshot resolves (LIVE fight, a finalized fight, the live
 * zone, or a finalized zone session). No timeline is ever requested (overlays never show one).
 *
 * IT ASKS FOR EXACTLY WHAT THE MAIN WINDOW ASKS FOR — the authoritative sources, you and each pet
 * as their own row. There used to be a `combinePets` flag here (wired, wrongly, to whether the
 * overlay was a FIGHT meter), which had the engine fold the pet into a synthetic "You +pets"
 * source: a second answer to "what is my damage", visible side by side with the Combat tab's.
 * That fold is gone from the engine entirely; pet layout is `petRows.meterPanel`'s job now, on
 * both surfaces (owner ruling, 2026-08-04).
 *
 * A SLOW POLL NO LONGER BLANKS THE METER (tester report, 2026-10-20: the meter kept flipping to
 * "Reading log…"). The overlay feeds the same `combatFeed` the Combat tab does: one request in
 * flight, and once a real answer is on screen a `hydrating` stand-in from a timed-out read keeps it
 * there. An overlay outlives a character switch, so its world is a count of `onCharacter` events:
 * a new character starts empty rather than showing the last one's numbers.
 */
export function useOverlayCombat(selectedId: string | undefined): CombatSnapshot | null {
  const [world, setWorld] = useState(0)
  const [snap, setSnap] = useState<CombatSnapshot | null>(() => keptSnapshot(`overlay#${String(world)}`))

  useEffect(() => window.eqOverlay.onCharacter(() => setWorld((w) => w + 1)), [])

  useEffect(() => {
    let alive = true
    const accept = createFeed(`overlay#${String(world)}`, (v) => {
      if (alive) setSnap(v.snap)
    })
    // maxSegments modest: the overlay's selector lists recent fights, but the payload stays small.
    const tick = coalesced(async (): Promise<void> => {
      accept(await window.eqOverlay.getCombatSnapshot({ selectedId, maxSegments: 30 }))
    })
    tick()
    const off = window.eqOverlay.onCombatActivity(tick)
    const iv = setInterval(tick, 1000)
    return () => {
      alive = false
      off()
      clearInterval(iv)
    }
  }, [selectedId, world])

  return snap
}
