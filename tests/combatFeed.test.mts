// The Combat tab's poll (combatFeed.ts): a revisit paints the last answer, one slow answer does not
// blank the tab, and the polls never pile up (tester report, 2026-10-20: "Reading log…").
import { test } from 'node:test'
import assert from 'node:assert/strict'
import type { CombatSnapshot } from '../src/shared/combat'
import { coalesced, createFeed, forgetKept, HYDRATING_GRACE_MS, keptSnapshot } from '../src/renderer/src/features/combat/combatFeed'

const snap = (hydrating: boolean, id = 'a'): CombatSnapshot => ({ hydrating, selectedId: id }) as unknown as CombatSnapshot

test('a real answer is drawn and kept for the next mount of the same world, never another', () => {
  forgetKept()
  const shown: CombatSnapshot[] = []
  const accept = createFeed('log1#0', (s) => shown.push(s), () => 1000)
  const real = snap(false)
  accept(real)
  assert.deepEqual(shown, [real])
  assert.equal(keptSnapshot('log1#0'), real)
  assert.equal(keptSnapshot('log2#0'), null, 'a character switch starts empty')
  assert.equal(keptSnapshot('log1#1'), null, 'a rebuild of the same log starts empty')
})

test('a hydrating answer right after a real one is held off; once the grace runs out it is believed', () => {
  forgetKept()
  let t = 0
  const shown: boolean[] = []
  const accept = createFeed('w', (s) => shown.push(s.hydrating), () => t)
  accept(snap(false))
  t = HYDRATING_GRACE_MS
  accept(snap(true))
  assert.deepEqual(shown, [false], 'a slow poll keeps the numbers on screen')
  t = HYDRATING_GRACE_MS + 1
  accept(snap(true))
  assert.deepEqual(shown, [false, true], 'an engine still reading after the grace says so')
})

test('with no real answer yet, hydrating is drawn at once (the first read after launch)', () => {
  forgetKept()
  const shown: boolean[] = []
  createFeed('w', (s) => shown.push(s.hydrating), () => 0)(snap(true))
  assert.deepEqual(shown, [true])
})

test('a real answer from another world does not hold off this one', () => {
  forgetKept()
  createFeed('old', () => undefined, () => 0)(snap(false))
  const shown: boolean[] = []
  createFeed('new', (s) => shown.push(s.hydrating), () => 1)(snap(true))
  assert.deepEqual(shown, [true])
})

test('polls coalesce: one in flight, at most one more after it, however many arrive meanwhile', async () => {
  let runs = 0
  let release: () => void = () => undefined
  const tick = coalesced(async () => {
    runs++
    await new Promise<void>((r) => (release = r))
  })
  tick()
  tick()
  tick()
  tick()
  assert.equal(runs, 1)
  release()
  await new Promise((r) => setImmediate(r))
  assert.equal(runs, 2, 'the calls made while it was in flight become ONE more run')
  release()
  await new Promise((r) => setImmediate(r))
  assert.equal(runs, 2)
  tick()
  assert.equal(runs, 3, 'idle again, the next call runs at once')
  release()
})

test('a failed poll does not jam the feed', async () => {
  let runs = 0
  const tick = coalesced(async () => {
    runs++
    throw new Error('ipc gone')
  })
  tick()
  await new Promise((r) => setImmediate(r))
  tick()
  await new Promise((r) => setImmediate(r))
  assert.equal(runs, 2)
})
