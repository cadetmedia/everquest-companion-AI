// combatFeed — how the Combat tab's snapshot poll decides what to draw, kept out of the hook so the
// rules are testable without a DOM.
//
// A tester's report (2026-10-20): the Combat tab said "Reading log…" each time it was opened, and
// for long stretches after. The engine had read the log long before; three things in the poll
// made it look otherwise:
//
//   1. THE TAB FORGOT ITS LAST ANSWER. App unmounts a view on every switch away, `snap` started at
//      `null`, and the view draws `null` as "Reading log…" until the first round trip lands. The
//      last good answer is now KEPT across mounts, per world (App's `viewKey`: the log path and its
//      rebuild count), so a revisit paints at once and a character switch never paints the
//      previous character's fights.
//   2. ONE SLOW ANSWER BLANKED THE TAB. Main answers a request the engine could not serve in time
//      with an empty `hydrating` stand-in (`ipc/world.ts emptyCombat`), and the view believed it.
//      A `hydrating` answer right after a real one is now held off for HYDRATING_GRACE_MS: a slow
//      poll keeps the numbers on screen, while an engine that really is re-reading (a restart, a
//      new log) still says so once the grace runs out.
//   3. THE POLLS PILED UP. A one-second interval plus the activity ping fired a new request
//      whether or not the last had come back, so on a slow machine they queued behind each other
//      until they ran into main's two-second deadline, which is (2). `coalesced` keeps one request
//      in flight and runs at most one more after it.

import type { CombatSnapshot } from '@shared/combat'

/** How long after a real answer a `hydrating` one is taken for a slow poll rather than a re-read. */
export const HYDRATING_GRACE_MS = 3_000

interface Kept {
  world: string
  snap: CombatSnapshot
  /** when it was received (ms) */
  at: number
}

/** The last real answer of any mount, for the next mount of the same world. */
let kept: Kept | null = null

/** What a new mount may draw before its first answer: the last real one of this world, if any. */
export function keptSnapshot(world: string): CombatSnapshot | null {
  return kept?.world === world ? kept.snap : null
}

/** Test seam: forget the kept answer. */
export function forgetKept(): void {
  kept = null
}

/**
 * The feed of one mount: takes each answer and calls `show` with the ones worth drawing. A real
 * answer is always drawn and kept; a `hydrating` one is dropped while a real one of this world is
 * younger than the grace.
 */
export function createFeed(world: string, show: (s: CombatSnapshot) => void, now: () => number = Date.now): (s: CombatSnapshot) => void {
  return (s) => {
    const t = now()
    if (!s.hydrating) {
      kept = { world, snap: s, at: t }
      show(s)
      return
    }
    if (kept?.world === world && t - kept.at <= HYDRATING_GRACE_MS) return
    show(s)
  }
}

/**
 * `run`, at most one at a time: a call while one is in flight asks for ONE more run after it, however
 * many calls arrive meanwhile. A failed run is dropped; the next interval tries again.
 */
export function coalesced(run: () => Promise<void>): () => void {
  let inFlight = false
  let again = false
  const go = async (): Promise<void> => {
    if (inFlight) {
      again = true
      return
    }
    inFlight = true
    try {
      do {
        again = false
        await run().catch(() => undefined)
      } while (again)
    } finally {
      inFlight = false
    }
  }
  return () => void go()
}
