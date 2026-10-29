// combatPoll — WHEN a meter surface asks main for `combat.snapshot` (performance review
// 2026-10-20, finding 4: "Combat is polled 3–5 times over", none of it gated).
//
// The Combat tab, Overview and each meter overlay used to ask once a second for as long as they
// were mounted, plus once per `combat:activity` ping: 60 IPC calls and 60 engine snapshot builds a
// minute per surface with the game closed, behind EverQuest, or with the window minimized. Two
// gates now sit on that, and neither touches the 1 s cadence while a fight is on; a third keeps
// the ping from asking above it:
//
//   1. VISIBILITY. A hidden window (minimized or hidden; Electron documents a fully covered window as
//      `hidden` on macOS only, so on Windows a window behind EverQuest is not counted on to be) asks
//      nothing, pings included. The moment it shows again it asks once,
//      so what it paints is current; the frame it shows first is the one it last composited, which
//      is what it showed before this gate as well.
//   2. ACTIVITY. The 1 s fallback poll exists for what changes with the WALL CLOCK alone: the open
//      fight's `active`/`inCombat` freshness, its closure (the engine closes a fight when a
//      snapshot first observes the deadline, `combat/mod.rs snapshot`), the pet nudge's display
//      timer, and the hydrating -> live handover. `timeDriven` is that list. While the last answer
//      has none of it and no ping came for `WARM_MS`, nothing on screen can move except the
//      minute-grained "3m ago" labels, so the fallback relaxes to `IDLE_POLL_MS`.
//   3. ONE READ A SECOND (second pass, item 1). The ping (any module cursor moving in main,
//      throttled to 4 Hz there) used to ask on every beat, ~3.8 reads a second per window in a
//      fight, each re-rendering the meters. A ping now only pulls the next read forward to one
//      `ACTIVE_POLL_MS` after the last: at once when the last is older than that (waking from
//      idle reads as quickly as before), otherwise on the trailing edge, so the read after the
//      fight's last line always starts after its ping and the meters end on the final numbers.
//      In a fight that is the 1 s cadence alone: one read per window per second.
//   4. THE METER OVERLAYS READ FOUR TIMES A SECOND (owner, 2026-10-28: "bump the dps overlay back up
//      to 4 times a second instead of once"). An overlay passes `OVERLAY_PING_GAP_MS`: a ping may pull
//      its next read to 250 ms after the last, matching main's 4 Hz ping. Only pings do; the
//      fallback timer stays at `ACTIVE_POLL_MS`, so an overlay with no new lines costs what it did.
//      The Combat tab and Overview keep one read a second.
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
/** The shortest gap a ping may pull a meter overlay's next read to (header, item 4): 4 reads a second. */
export const OVERLAY_PING_GAP_MS = 250

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
  /** Calls `cb` once after `ms`; returns the cancel. */
  after: (ms: number, cb: () => void) => () => void
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
    after: (ms, cb) => {
      const t = setTimeout(cb, ms)
      return () => clearTimeout(t)
    }
  }
}

/**
 * Poll `fetch` under the three gates and hand each answer to `accept`. One request in flight at a
 * time (`coalesced`). `onActivity` subscribes to the `combat:activity` ping. `opts.pingGapMs` is the
 * shortest gap a ping may pull the next read to (`ACTIVE_POLL_MS`, or `OVERLAY_PING_GAP_MS` for a
 * meter overlay); `opts.env` is the window (a fake one in the tests). Returns the stop.
 */
export function pollCombat(
  fetch: () => Promise<CombatSnapshot>,
  accept: (s: CombatSnapshot) => void,
  onActivity: (cb: () => void) => () => void,
  opts: { env?: PollEnv; pingGapMs?: number } = {}
): () => void {
  const env = opts.env ?? browserEnv()
  const pingGapMs = opts.pingGapMs ?? ACTIVE_POLL_MS
  let lastPing = env.now()
  let lastAsk = Number.NEGATIVE_INFINITY
  // Until the first answer says otherwise, assume time matters: the first second polls as before.
  let warm = true
  let cancel = (): void => undefined
  const run = coalesced(async (): Promise<void> => {
    lastAsk = env.now()
    const s = await fetch()
    warm = timeDriven(s)
    accept(s)
  })
  const gap = (): number => (warm || env.now() - lastPing < WARM_MS ? ACTIVE_POLL_MS : IDLE_POLL_MS)
  // The one timer: read when the gap since the last read is up, else wait out the rest of it. A
  // ping's wait is measured with `pingGapMs`, and the timer it sets keeps that measure.
  const tick = (min?: number): void => {
    cancel()
    const wait = lastAsk + Math.min(min ?? gap(), gap()) - env.now()
    if (wait <= 0 && !env.hidden()) run()
    cancel = wait > 0 ? env.after(wait, () => tick(min)) : env.after(gap(), () => tick())
  }
  const offPing = onActivity(() => {
    lastPing = env.now()
    tick(pingGapMs)
  })
  const offVisible = env.onVisible(run)
  tick()
  return () => {
    offPing()
    cancel()
    offVisible()
  }
}
