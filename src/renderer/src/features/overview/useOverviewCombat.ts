// useOverviewCombat — the Overview tab's LITE view of the combat engine.
//
// Same transport as `features/combat/useCombat` (pull `combat:snapshot` + the throttled
// `combat:activity` nudge + a 1s fallback tick for timer-driven UI), deliberately NOT the same
// hook: useCombat owns scope/selection/drill/timeline state that Overview has no use for, and
// re-using it would drag the whole Combat tab's payload onto a glance surface.
//
// The request stays LEANER than the Combat tab's (docs/plans/overview-tab.md §0):
//   timeline: true      — the per-event ring of the DEFAULT selection, for the DPS-over-time card
//                         (Task: the curve on Overview). This is the one line of the request that
//                         is not cheaper than Combat's, and the cost is accepted deliberately:
//                         `ViewContent` mounts exactly ONE feature view at a time, so Overview and
//                         Combat are never on screen together and the app's total per-tick payload
//                         is unchanged from what the Combat tab already pulls today. `maxSegments`
//                         stays 1, so Overview still asks for strictly less overall.
//   maxSegments: 1      — caps the finalized-summary array; the CURRENT encounter and the zone
//                         summary are always included regardless (engine.ts), which is exactly
//                         what `fightScopeOptions` needs to label the head row honestly
//   no selectedId       — so the engine re-resolves the default every tick: the open fight, else
//                         the most recent finalized one. That is BY CONSTRUCTION the same
//                         subject the Combat tab's Fight-scope head row shows, which is what
//                         makes "Open in Combat" land on the same fight.
//
// There is never a second concurrent poller: `ViewContent` in App.tsx mounts exactly one feature
// view at a time, so Overview and Combat are never on screen together.

import { useEffect, useState } from 'react'
import type { CombatSnapshot } from '@shared/combat'
import { coalesced, createFeed, keptSnapshot } from '../combat/combatFeed'

/** Fallback poll while mounted — covers the "active" state decay and any missed nudge. */
const FALLBACK_POLL_MS = 1000

/** combatFeed's slot for this surface: its request differs from the Combat tab's. */
const SURFACE = 'overview'

/** The engine's snapshot, or null while the very first pull is in flight (reads as "not ready",
 *  the same as `hydrating`). A revisit of the same world (App's `viewKey`) paints the last real
 *  answer at once, and a slow `hydrating` answer never replaces one (combatFeed.ts). */
export function useOverviewCombat(world = ''): CombatSnapshot | null {
  const [snap, setSnap] = useState<CombatSnapshot | null>(() => keptSnapshot(world, SURFACE))

  useEffect(() => {
    let alive = true
    const accept = createFeed(world, (v) => {
      if (alive) setSnap(v.snap)
    }, SURFACE)
    // One request in flight, as the Combat tab's poll (combatFeed.ts): on a slow machine the 1 s
    // poll and the activity ping no longer stack up behind each other.
    const tick = coalesced(async (): Promise<void> => {
      accept(
        await window.eq.getCombatSnapshot({
          timeline: true,
          maxSegments: 1
        })
      )
    })
    tick()
    const off = window.eq.onCombatActivity(tick)
    const iv = setInterval(tick, FALLBACK_POLL_MS)
    return () => {
      alive = false
      off()
      clearInterval(iv)
    }
  }, [world])

  return snap
}
