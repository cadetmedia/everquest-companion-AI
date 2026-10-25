// lib/dumpStore.ts: the inventory-dump readers' one held answer per window (perf audit,
// 2026-10-20: the Gear, Character and Leveling tabs drew null, then the answer, on every mount).
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { createDumpStore, type DumpBridge } from '../src/renderer/src/lib/dumpStore'

interface Answer {
  path: string
  loadedAt: string
  n: number
}

function harness(): {
  store: ReturnType<typeof createDumpStore<Answer>>
  asks: () => number
  answer: (a: Answer | null) => Promise<void>
  reload: () => void
  switchCharacter: () => void
} {
  const pending: ((a: Answer | null) => void)[] = []
  let asked = 0
  let onReload: () => void = () => undefined
  let onChar: () => void = () => undefined
  const bridge: DumpBridge = {
    onInventoryReload: (cb) => ((onReload = cb), () => undefined),
    onCharacter: (cb) => ((onChar = () => cb(null)), () => undefined)
  }
  const store = createDumpStore<Answer>(
    () => {
      asked++
      return new Promise((r) => pending.push(r))
    },
    () => bridge
  )
  return {
    store,
    asks: () => asked,
    answer: async (a) => {
      pending.shift()?.(a)
      await new Promise((r) => setImmediate(r))
    },
    reload: () => onReload(),
    switchCharacter: () => onChar()
  }
}

const dump = (n: number, loadedAt = 't1'): Answer => ({ path: 'inv.txt', loadedAt, n })

test('a remount paints the held answer at once, and still asks again', async () => {
  const h = harness()
  const off = h.store.subscribe(() => undefined)
  assert.deepEqual(h.store.current(), { value: null, ready: false })
  await h.answer(dump(1))
  const first = h.store.current()
  assert.equal(first.value?.n, 1)
  off()
  h.store.subscribe(() => undefined)
  assert.equal(h.store.current(), first, 'no null between mounts')
  assert.equal(h.asks(), 2, 'the mount re-asks, as the hooks always did')
})

test('a reply for the same file keeps the held object; a rewrite replaces it', async () => {
  const h = harness()
  let changes = 0
  h.store.subscribe(() => changes++)
  await h.answer(dump(1))
  const held = h.store.current()
  h.reload()
  await h.answer(dump(2))
  assert.equal(h.store.current(), held, 'same path and mtime: nothing downstream re-renders')
  h.reload()
  await h.answer(dump(3, 't2'))
  assert.equal(h.store.current().value?.n, 3)
  assert.equal(changes, 2)
})

test('readers mounted together share one ask', () => {
  const h = harness()
  h.store.subscribe(() => undefined)
  h.store.subscribe(() => undefined)
  assert.equal(h.asks(), 1)
})

test('a character switch drops the answer, even with no reader, and an old reply never lands', async () => {
  const h = harness()
  const off = h.store.subscribe(() => undefined)
  await h.answer(dump(1))
  off()
  h.switchCharacter()
  assert.deepEqual(h.store.current(), { value: null, ready: false })

  h.store.subscribe(() => undefined)
  h.switchCharacter()
  await h.answer(dump(9))
  assert.equal(h.store.current().ready, false, 'the reply for the old character is dropped')
  assert.equal(h.asks(), 3, 'and the new character is asked')
  await h.answer({ path: 'other.txt', loadedAt: 't1', n: 4 })
  assert.equal(h.store.current().value?.n, 4)
})

test('a failed ask settles as no dump', async () => {
  const store = createDumpStore<Answer>(
    () => Promise.reject(new Error('ipc gone')),
    () => ({ onInventoryReload: () => () => undefined, onCharacter: () => () => undefined })
  )
  store.subscribe(() => undefined)
  await new Promise((r) => setImmediate(r))
  assert.deepEqual(store.current(), { value: null, ready: true })
})
