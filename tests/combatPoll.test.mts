// The meter surfaces' combat poll (combatPoll.ts, performance review finding 4): in a fight it asks
// exactly as often as before; idle it relaxes; hidden it asks nothing and catches up on show.
// The counts below are the review's "IPC calls per minute" measurement, made on a fake clock.
import { test } from 'node:test'
import assert from 'node:assert/strict'
import type { CombatSnapshot } from '../src/shared/combat'
import {
  ACTIVE_POLL_MS,
  IDLE_POLL_MS,
  WARM_MS,
  pollCombat,
  timeDriven,
  type PollEnv
} from '../src/renderer/src/features/combat/combatPoll'

const settled = { hydrating: false, inCombat: false, segments: [{ kind: 'fight' }] } as unknown as CombatSnapshot
const fighting = { hydrating: false, inCombat: true, segments: [{ kind: 'current' }] } as unknown as CombatSnapshot

/** A window on a fake clock: `advance` fires the 1 s timer as often as the time passed allows. */
function fakeWindow(answer: () => CombatSnapshot) {
  let t = 0
  let hidden = false
  let timer: (() => void) | null = null
  let visible: (() => void) | null = null
  let ping: (() => void) | null = null
  let asks = 0
  const env: PollEnv = {
    now: () => t,
    hidden: () => hidden,
    onVisible: (cb) => ((visible = cb), () => (visible = null)),
    every: (_ms, cb) => ((timer = cb), () => (timer = null))
  }
  const settle = (): Promise<void> => new Promise((r) => setImmediate(r))
  const stop = pollCombat(
    async () => {
      asks++
      return answer()
    },
    () => undefined,
    (cb) => ((ping = cb), () => (ping = null)),
    env
  )
  return {
    asks: () => asks,
    stop,
    async advance(ms: number): Promise<void> {
      for (let i = 0; i < ms / ACTIVE_POLL_MS; i++) {
        t += ACTIVE_POLL_MS
        timer?.()
        await settle()
      }
    },
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
