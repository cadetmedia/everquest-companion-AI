// THE SLICED BUILD (src/main/yieldingSteps.ts) — the gear index built in slices so the main process
// keeps answering IPC while it works (perf audit, 2026-10-20: built in one go on the first Gear
// visit it held main for 204 ms).
//
// Three promises are pinned, and the first is the one that matters:
//   1. THE ANSWER DOES NOT DEPEND ON THE RUNNER. The sliced build over the REAL committed corpus is
//      deep-equal to the synchronous one — rows, order and census.
//   2. IT ACTUALLY HANDS THE THREAD BACK. An immediate queued while it runs fires before it ends.
//   3. A THROW IS A REJECTION, so the IPC handler's caller sees what a synchronous throw showed.

import { test } from 'node:test'
import assert from 'node:assert/strict'
import itemsJson from '../src/main/data/items.json'
import type { ItemDbFile } from '../src/main/itemsDb'
import { buildGearIndex, gearIndexSteps } from '../src/main/planner/gearIndex'
import { buildEraDerivations, eraDerivationSteps } from '../src/main/planner/eraDerive'
import { runSteps, runStepsSliced, type Steps } from '../src/main/yieldingSteps'

const FILE = itemsJson as unknown as ItemDbFile

function* counted(n: number): Steps<number> {
  for (let i = 0; i < n; i++) yield
  return n
}

test('runSteps returns the builder answer', () => {
  assert.equal(runSteps(counted(5)), 5)
})

test('THE SLICED GEAR INDEX IS THE SYNCHRONOUS ONE, over the real corpus', async () => {
  const sliced = await runStepsSliced(gearIndexSteps(FILE))
  assert.deepEqual(sliced, buildGearIndex(FILE))
  assert.ok(sliced.rows.length > 6000, `rows ${String(sliced.rows.length)}`)
})

test('the sliced layer-3 walk is the synchronous one', async () => {
  const sliced = await runStepsSliced(eraDerivationSteps(FILE))
  assert.deepEqual([...sliced], [...buildEraDerivations(FILE)])
})

test('IT HANDS THE THREAD BACK between slices', async () => {
  // A clock that says every step spent the whole budget: one step per slice.
  let t = 0
  const clock = (): number => (t += 10)
  let interleaved = 0
  const tick = (): void => {
    interleaved++
    if (interleaved < 3) setImmediate(tick)
  }
  setImmediate(tick)
  const done = await runStepsSliced(counted(10), 8, clock)
  assert.equal(done, 10)
  assert.equal(interleaved, 3, 'other immediates ran while the build was still going')
})

test('a throw inside the builder rejects', async () => {
  function* broken(): Steps<number> {
    yield
    throw new Error('corpus broke')
  }
  await assert.rejects(runStepsSliced(broken()), /corpus broke/)
})
