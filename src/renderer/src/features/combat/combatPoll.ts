// combatPoll — WHEN a meter surface asks main for `combat.snapshot` (performance review
// 2026-10-20, finding 4: "Combat is polled 3–5 times over", none of it gated).
//
// The Combat tab, Overview and each meter overlay used to ask once a second for as long as they
// were mounted, plus once per `combat:activity` ping: 60 IPC calls and 60 engine snapshot builds a
// minute per surface with the game closed, behind EverQuest, or with the window minimized. Two
// gates now sit on that, and neither touches the cadence while a fight is on:
//
//   1. VISIBILITY. A hidden window (minimized, or fully covered: Chromium reports occlusion as
//      `hidden` on Windows) asks nothing, pings included. The moment it shows again it asks once,
//      so what it paints is current; the frame it shows first is the one it last composited, which
//      is what it showed before this gate as well.
//   2. ACTIVITY. The 1 s fallback poll exists for what changes with the WALL CLOCK alone: the open
//      fight's `active`/`inCombat` freshness, its closure (the engine closes a fight when a
//      snapshot first observes the deadline, `combat/mod.rs snapshot`), the pet nudge's display
//      timer, and the hydrating -> live handover. `timeDriven` is that list. While the last answer
//      has none of it and no ping came for `WARM_MS`, nothing on screen can move except the
//      minute-grained "3m ago" labels, so the fallback relaxes to `IDLE_POLL_MS`. A ping (any
//      module cursor moving in main, throttled to 4 Hz there) asks at once, as before.
//
// Sharing identical reads is main's job and already done there: `readShim.serveShared` joins an
// identical `combat.snapshot` in flight, which is the fight + heal-fight overlays answering one
// ping with one engine read. Within a window only one surface polls (App mounts one view; an
// overlay window is one meter), so there is nothing further to share renderer-side.
//
// Pure apart from `browserEnv`, so `tests/combatPoll.test.mts` drives it with a fake clock.

import type { CombatSnapshot } from '@shared/combat'
import { coalesced } from './combatFeed'

/** The fallback poll while anything on screen can change with time alone (unchanged from before). */
export const ACTIVE_POLL_MS = 1000
/** The fallback poll once nothing can: bounds how late a minute-grained age label may turn. */
export const IDLE_POLL_MS = 10_000
/** How long after the last activity ping the poll stays at `ACTIVE_POLL_MS` regardless. */
export const WARM_MS = 30_000

/** Does this answer change with the wall clock alone? (The header's list, item 2.) */
export function timeDriven(s: CombatSnapshot): boolean {
  return (
    s.hydrating ||
    s.inCombat ||
    s.petNudge != null ||
    s.segments.some((seg) => seg.kind === 'current')
  )
}

/** What the poll needs from its window: a clock, visibility and one repeating timer. */
export interface PollEnv {
  now: () => number
  hidden: () => boolean
  /** Calls `cb` each time the window becomes visible; returns the unsubscribe. */
  onVisible: (cb: () => void) => () => void
  /** Calls `cb` every `ms`; returns the stop. */
  every: (ms: number, cb: () => void) => () => void
}

/** The real window's environment. */
export function browserEnv(): PollEnv {
  return {
    now: () => Date.now(),
    hidden: () => document.visibilityState === 'hidden',
    onVisible: (cb) => {
      const listener = (): void => {
        if (document.visibilityState !== 'hidden') cb()
      }
      document.addEventListener('visibilitychange', listener)
      return () => document.removeEventListener('visibilitychange', listener)
    },
    every: (ms, cb) => {
      const iv = setInterval(cb, ms)
      return () => clearInterval(iv)
    }
  }
}

/**
 * Poll `fetch` under the two gates and hand each answer to `accept`. One request in flight at a
 * time (`coalesced`). `onActivity` subscribes to the `combat:activity` ping. Returns the stop.
 */
export function pollCombat(
  fetch: () => Promise<CombatSnapshot>,
  accept: (s: CombatSnapshot) => void,
  onActivity: (cb: () => void) => () => void,
  env: PollEnv = browserEnv()
): () => void {
  let lastPing = env.now()
  let lastAsk = 0
  // Until the first answer says otherwise, assume time matters: the first second polls as before.
  let warm = true
  const run = coalesced(async (): Promise<void> => {
    lastAsk = env.now()
    const s = await fetch()
    warm = timeDriven(s)
    accept(s)
  })
  const ask = (): void => {
    if (!env.hidden()) run()
  }
  const offPing = onActivity(() => {
    lastPing = env.now()
    ask()
  })
  const stopTimer = env.every(ACTIVE_POLL_MS, () => {
    const now = env.now()
    const idle = !warm && now - lastPing >= WARM_MS
    if (idle && now - lastAsk < IDLE_POLL_MS) return
    ask()
  })
  const offVisible = env.onVisible(run)
  ask()
  return () => {
    offPing()
    stopTimer()
    offVisible()
  }
}
