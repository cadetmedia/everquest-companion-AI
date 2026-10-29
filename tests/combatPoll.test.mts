// The meter surfaces' combat poll (combatPoll.ts, performance review finding 4 and second pass
// item 1): in a fight it reads once a second, pings included; idle it relaxes; hidden it asks
// nothing and catches up on show. The counts below are the review's "IPC calls per minute"
// measurement, made on a fake clock.
import { test } from 'node:test'
import assert from 'node:assert/strict'
import type { CombatSnapshot } from '../src/shared/combat'
import {
  ACTIVE_POLL_MS,
  IDLE_POLL_MS,
  OVERLAY_PING_GAP_MS,
  WARM_MS,
  pollCombat,
  timeDriven,
  type PollEnv
} from '../src/renderer/src/features/combat/combatPoll'

const settled = { hydrating: false, inCombat: false, segments: [{ kind: 'fight' }] } as unknown as CombatSnapshot
const fighting = { hydrating: false, inCombat: true, segments: [{ kind: 'current' }] } as unknown as CombatSnapshot

/** A window on a fake clock: `advance` fires each timer at its time; `fetchMs` is a read's round trip. */
function fakeWindow(answer: () => CombatSnapshot, fetchMs = 0, pingGapMs?: number) {
  let t = 0
  let hidden = false
  let timers: { at: number; cb: () => void }[] = []
  let visible: (() => void) | null = null
  let ping: (() => void) | null = null
  let asks = 0
  const later = (ms: number, cb: () => void): (() => void) => {
    const timer = { at: t + ms, cb }
    timers.push(timer)
    return () => (timers = timers.filter((x) => x !== timer))
  }
  const env: PollEnv = {
    now: () => t,
    hidden: () => hidden,
    onVisible: (cb) => ((visible = cb), () => (visible = null)),
    after: later
  }
  const settle = (): Promise<void> => new Promise((r) => setImmediate(r))
  const stop = pollCombat(
    async () => {
      asks++
      // What was asked for is what the log said when the read started.
      const s = answer()
      if (fetchMs > 0) await new Promise<void>((r) => later(fetchMs, r))
      return s
    },
    (s) => answers.push(s),
    (cb) => ((ping = cb), () => (ping = null)),
    env,
    pingGapMs
  )
  const answers: CombatSnapshot[] = []
  const advance = async (ms: number): Promise<void> => {
    const end = t + ms
    for (;;) {
      const next = timers.reduce<{ at: number; cb: () => void } | null>((a, x) => (a && a.at <= x.at ? a : x), null)
      if (!next || next.at > end) break
      timers = timers.filter((x) => x !== next)
      t = next.at
      next.cb()
      await settle()
    }
    t = end
  }
  return {
    asks: () => asks,
    answers,
    stop,
    advance,
    async ping(): Promise<void> {
      ping?.()
      await settle()
    },
    async setHidden(h: boolean): Promise<void> {
      hidden = h
      if (!h) visible?.()
      await settle()
    }
  }
}

test('what changes with the wall clock alone keeps the 1 s poll', () => {
  assert.equal(timeDriven(settled), false)
  assert.equal(timeDriven(fighting), true)
  assert.equal(timeDriven({ ...settled, hydrating: true }), true)
  assert.equal(timeDriven({ ...settled, petNudge: { expiresTs: 1 } } as unknown as CombatSnapshot), true)
})

test('in a fight the cadence is unchanged: once on mount and once a second (60 a minute)', async () => {
  const w = fakeWindow(() => fighting)
  await w.advance(1000) // the first answer lands
  const before = w.asks()
  await w.advance(60_000)
  assert.equal(w.asks() - before, 60)
  w.stop()
})

test('in a fight the 4 Hz activity ping adds no reads: one a second per window (it was five)', async () => {
  const w = fakeWindow(() => fighting, 30)
  await w.advance(1000)
  const before = w.asks()
  for (let i = 0; i < 240; i++) {
    await w.advance(250)
    await w.ping()
  }
  assert.equal(w.asks() - before, 60)
  w.stop()
})

test('a burst of pings reads at once, then once on the trailing edge with the last numbers', async () => {
  let line = 0
  const w = fakeWindow(() => ({ ...settled, line }) as unknown as CombatSnapshot)
  await w.advance(WARM_MS + 20_000) // idle: the next fallback read is up to 10 s away
  const before = w.asks()
  for (let i = 0; i < 4; i++) {
    line++
    await w.ping()
    await w.advance(200)
  }
  assert.equal(w.asks(), before + 1, 'the first ping reads at once, the rest wait')
  await w.advance(200)
  assert.equal(w.asks(), before + 2, 'one trailing read, a second after the first')
  assert.equal((w.answers.at(-1) as unknown as { line: number }).line, 4, 'and it carries the last line')
  w.stop()
})

test('a ping while a read is in flight is followed by a read that starts after it', async () => {
  let line = 0
  const w = fakeWindow(() => ({ ...fighting, line }) as unknown as CombatSnapshot, 400)
  await w.advance(1200) // the 1 s read is in flight until 1.4 s
  line++
  await w.ping()
  await w.advance(1200)
  assert.equal((w.answers.at(-1) as unknown as { line: number }).line, 1, 'the meters end on the final numbers')
  w.stop()
})

test('idle and settled, the poll relaxes after the warm window: 60 a minute becomes 6', async () => {
  const w = fakeWindow(() => settled)
  await w.advance(WARM_MS)
  assert.equal(w.asks(), WARM_MS / ACTIVE_POLL_MS, 'warm after mount: the same 1 s as before')
  const before = w.asks()
  await w.advance(60_000)
  assert.equal(w.asks() - before, 60_000 / IDLE_POLL_MS)
  w.stop()
})

test('a ping asks at once and re-warms the poll', async () => {
  const w = fakeWindow(() => settled)
  await w.advance(WARM_MS + 5_000)
  const before = w.asks()
  await w.ping()
  assert.equal(w.asks(), before + 1, 'the ping is answered at once, as before')
  await w.advance(10_000)
  assert.equal(w.asks(), before + 11, 'and the next 10 s poll every second again')
  w.stop()
})

test('a hidden window asks nothing, pings included, and asks once when shown', async () => {
  const w = fakeWindow(() => fighting)
  await w.advance(1000)
  await w.setHidden(true)
  const before = w.asks()
  await w.ping()
  await w.advance(60_000)
  assert.equal(w.asks(), before, 'nothing while hidden')
  await w.setHidden(false)
  assert.equal(w.asks(), before + 1, 'one read the moment it shows')
  w.stop()
})

test('stopped, it asks nothing more', async () => {
  const w = fakeWindow(() => fighting)
  await w.advance(1000)
  w.stop()
  const before = w.asks()
  await w.ping()
  await w.advance(5_000)
  assert.equal(w.asks(), before)
})

test('a meter overlay reads four times a second in a fight, on the 4 Hz ping (owner, 2026-10-28)', async () => {
  const w = fakeWindow(() => fighting, 30, OVERLAY_PING_GAP_MS)
  await w.advance(1000)
  const before = w.asks()
  for (let i = 0; i < 240; i++) {
    await w.advance(250)
    await w.ping()
  }
  assert.equal(w.asks() - before, 240, 'one read per ping: 4 a second for a minute')
  w.stop()
})

test('a meter overlay with no new lines costs what it did: the fallback is not sped up', async () => {
  const w = fakeWindow(() => fighting, 0, OVERLAY_PING_GAP_MS)
  await w.advance(1000)
  const before = w.asks()
  await w.advance(60_000)
  assert.equal(w.asks() - before, 60)
  w.stop()
  const idle = fakeWindow(() => settled, 0, OVERLAY_PING_GAP_MS)
  await idle.advance(WARM_MS + 1000)
  const quiet = idle.asks()
  await idle.advance(60_000)
  assert.equal(idle.asks() - quiet, 60_000 / IDLE_POLL_MS)
  idle.stop()
})
