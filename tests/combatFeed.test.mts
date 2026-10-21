// The Combat tab's poll (combatFeed.ts): a revisit paints the last answer, one slow answer does not
// blank the tab, and the polls never pile up (tester report, 2026-10-20: "Reading log…").
import { test } from 'node:test'
import assert from 'node:assert/strict'
import type { CombatSnapshot } from '../src/shared/combat'
import { coalesced, createFeed, forgetKept, keptSnapshot } from '../src/renderer/src/features/combat/combatFeed'

const snap = (hydrating: boolean, id = 'a'): CombatSnapshot => ({ hydrating, selectedId: id }) as unknown as CombatSnapshot

test('a real answer is drawn and kept for the next mount of the same world, never another', () => {
  forgetKept()
  const shown: unknown[] = []
  const accept = createFeed('log1#0', (v) => shown.push(v))
  const real = snap(false)
  accept(real)
  assert.deepEqual(shown, [{ snap: real, updating: false }])
  assert.equal(keptSnapshot('log1#0'), real)
  assert.equal(keptSnapshot('log2#0'), null, 'a character switch starts empty')
  assert.equal(keptSnapshot('log1#1'), null, 'a rebuild of the same log starts empty')
})

test('once a world has a real answer, a hydrating one keeps it on screen, marked updating, until a real one lands', () => {
  forgetKept()
  const shown: { snap: CombatSnapshot | null; updating: boolean }[] = []
  const accept = createFeed('w', (v) => shown.push(v))
  const first = snap(false, 'first')
  accept(first)
  accept(snap(true))
  accept(snap(true))
  assert.deepEqual(shown.slice(1), [{ snap: first, updating: true }, { snap: first, updating: true }], 'never blanked')
  const next = snap(false, 'next')
  accept(next)
  assert.deepEqual(shown.at(-1), { snap: next, updating: false })
})

test('with no real answer yet, hydrating is drawn as itself (the first read after launch)', () => {
  forgetKept()
  const shown: { snap: CombatSnapshot | null; updating: boolean }[] = []
  createFeed('w', (v) => shown.push(v))(snap(true))
  assert.equal(shown[0]?.snap?.hydrating, true)
  assert.equal(shown[0]?.updating, false)
})

test('a real answer from another world is never shown in this one', () => {
  forgetKept()
  createFeed('old', () => undefined)(snap(false))
  const shown: { snap: CombatSnapshot | null; updating: boolean }[] = []
  createFeed('new', (v) => shown.push(v))(snap(true))
  assert.equal(shown[0]?.snap?.hydrating, true)
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
