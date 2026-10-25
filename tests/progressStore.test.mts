// posky/progressStore.ts: the window's one held copy of the character's progress (perf audit,
// 2026-10-20: the Posky and Loot tabs drew null, then the answer, on every visit), dropped on a
// character switch so turn-ins never cross characters.
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { createProgressStore, type ProgressBridge } from '../src/renderer/src/features/posky/progressStore'
import type { ProgressState } from '../src/shared/types'

const state = (n: number): ProgressState => ({ n }) as unknown as ProgressState
const nOf = (p: ProgressState | null): number | undefined => (p as unknown as { n: number } | null)?.n

function harness(): {
  store: ReturnType<typeof createProgressStore>
  asks: () => number
  answer: (p: ProgressState) => Promise<void>
  push: (p: ProgressState) => void
  reload: () => void
  switchCharacter: () => void
} {
  const pending: ((p: ProgressState) => void)[] = []
  let asked = 0
  let onPush: (p: ProgressState) => void = () => undefined
  let onReload: () => void = () => undefined
  let onChar: () => void = () => undefined
  const bridge: ProgressBridge = {
    getProgress: () => {
      asked++
      return new Promise((r) => pending.push(r))
    },
    onProgress: (cb) => ((onPush = cb), () => undefined),
    onInventoryReload: (cb) => ((onReload = cb), () => undefined),
    onCharacter: (cb) => ((onChar = () => cb(null)), () => undefined)
  }
  return {
    store: createProgressStore(() => bridge),
    asks: () => asked,
    answer: async (p) => {
      pending.shift()?.(p)
      await new Promise((r) => setImmediate(r))
    },
    push: (p) => onPush(p),
    reload: () => onReload(),
    switchCharacter: () => onChar()
  }
}

test('a remount paints the held copy at once, still asks again, and an equal reply keeps it', async () => {
  const h = harness()
  const off = h.store.subscribe(() => undefined)
  assert.equal(h.store.current(), null)
  await h.answer(state(1))
  const first = h.store.current()
  assert.equal(nOf(first), 1)
  off()
  let changes = 0
  h.store.subscribe(() => changes++)
  assert.equal(h.store.current(), first, 'no null between mounts')
  assert.equal(h.asks(), 2, 'the mount re-asks, as useProgress always did')
  await h.answer(state(1))
  assert.equal(h.store.current(), first, 'nothing new: no reader re-renders')
  assert.equal(changes, 0)
  h.reload()
  await h.answer(state(2))
  assert.equal(nOf(h.store.current()), 2)
})

test('readers mounted together share one ask', () => {
  const h = harness()
  h.store.subscribe(() => undefined)
  h.store.subscribe(() => undefined)
  assert.equal(h.asks(), 1)
})

test('a push or a write reaches every reader, and a reply asked before it is dropped', async () => {
  const h = harness()
  let a = 0
  let b = 0
  h.store.subscribe(() => a++)
  h.store.subscribe(() => b++)
  h.push(state(5))
  assert.equal(nOf(h.store.current()), 5)
  await h.answer(state(4))
  assert.equal(nOf(h.store.current()), 5, 'the older reply does not overwrite the push')
  h.store.set(state(6))
  assert.equal(nOf(h.store.current()), 6)
  assert.deepEqual([a, b], [2, 2])
})

test('a character switch drops the copy, even with no reader, and an old reply never lands', async () => {
  const h = harness()
  const off = h.store.subscribe(() => undefined)
  await h.answer(state(1))
  off()
  h.switchCharacter()
  assert.equal(h.store.current(), null)

  h.store.subscribe(() => undefined)
  h.switchCharacter()
  await h.answer(state(9))
  assert.equal(h.store.current(), null, 'the reply for the old character is dropped')
  assert.equal(h.asks(), 3, 'and the new character is asked')
  await h.answer(state(4))
  assert.equal(nOf(h.store.current()), 4)
})

test('a failed ask leaves the copy as it was', async () => {
  const store = createProgressStore(() => ({
    getProgress: () => Promise.reject(new Error('ipc gone')),
    onProgress: () => () => undefined,
    onInventoryReload: () => () => undefined,
    onCharacter: () => () => undefined
  }))
  store.subscribe(() => undefined)
  await new Promise((r) => setImmediate(r))
  assert.equal(store.current(), null)
})
