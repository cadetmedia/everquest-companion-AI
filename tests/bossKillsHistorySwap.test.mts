// useBossKills across a history swap, run for real through `tests/hookHost.mts` and the real module
// store. Archived history shown mid-session (the Summarize and archive log switch turned on, or an
// archive refreshed after an update) arrives behind the world-changed frame and raises every
// archived boss's credited count. That rise is history, not a kill: the baseline re-seeds from it
// silently, and the next live kill still celebrates.
import test from 'node:test'
import assert from 'node:assert/strict'
import { mountHook } from './hookHost.mjs'
import { useBossKills } from '../src/renderer/src/features/bosses/useBossKills.ts'
import { MODULE_WORLD_CHANGED, type ModuleChanged, type RaidTarget } from '../src/shared/types.ts'

const run = (n: number, t: number): Record<string, number> => ({ count: n, firstTs: t, lastTs: t, credited: n, lastCreditedTs: t })
const info = (n: number, t: number): Record<string, unknown> => ({
  count: n,
  bestTier: 0,
  firstTs: t,
  lastTs: t,
  credited: n,
  lastCreditedTs: t,
  tiers: { 0: run(n, t) }
})
const targets: RaidTarget[] = [
  { name: 'Lord Nagafen', category: 'Dragons', match: ['Lord Nagafen'] },
  { name: 'Lady Vox', category: 'Dragons', match: ['Lady Vox'] }
]

/** Past the store's one-frame floor, so a marked module has been fetched again. */
const settle = (): Promise<void> => new Promise((r) => setTimeout(r, 40))

test('archived kills shown behind the world-changed frame celebrate nothing; the next live kill does', async () => {
  let served = { seq: 1, state: { v: 5, mobs: { 'Lord Nagafen': info(1, 2_000) } } }
  const cursorCbs: ((c: ModuleChanged) => void)[] = []
  const eq = {
    getModuleSnapshot: () => Promise.resolve(served),
    onModuleChanged: (cb: (c: ModuleChanged) => void) => {
      cursorCbs.push(cb)
      return (): void => void cursorCbs.splice(cursorCbs.indexOf(cb), 1)
    },
    onCharacter: () => (): void => undefined
  }
  ;(globalThis as unknown as { window: unknown }).window = { eq }
  const emit = (c: ModuleChanged): void => {
    for (const cb of [...cursorCbs]) cb(c)
  }

  const fired: string[] = []
  const host = mountHook(() => useBossKills(targets, { onKill: (k) => fired.push(k.status.target.name) }))
  await settle()
  host.render()
  assert.deepEqual(fired, [], 'the first snapshot seeds silently')

  // The switch turned on: the merge now holds three older Nagafen kills and two of Vox.
  served = { seq: 2, state: { v: 5, mobs: { 'Lord Nagafen': info(4, 2_000), 'Lady Vox': info(2, 1_000) } } }
  emit({ moduleId: MODULE_WORLD_CHANGED, seq: -1 })
  await settle()
  host.render()
  assert.deepEqual(fired, [], 'archived kills are history, not kills')

  served = { seq: 3, state: { v: 5, mobs: { 'Lord Nagafen': info(5, 3_000), 'Lady Vox': info(2, 1_000) } } }
  emit({ moduleId: 'kills', seq: 3 })
  await settle()
  host.render()
  assert.deepEqual(fired, ['Lord Nagafen'], 'a real kill right after still celebrates')
  host.unmount()
})
