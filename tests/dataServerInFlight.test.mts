// ONE ENGINE REQUEST PER QUESTION IN FLIGHT — the coalescer under `readShim.ts`'s shared reads.
//
// `src/main/dataServer/inFlight.ts` is pure, so every claim is driven with hand-made promises: no
// shim, no clock, no socket. The claims are the ones the read path leans on — a joiner gets the same
// promise and starts nothing, the entry goes the moment the read settles (so it is never a cache), a
// rejection is shared like an answer and never sticks, and a params object is one question whatever
// order its keys were written in. The shim-level rows (one request on the wire, each caller its own
// fallback) are in `dataServerShim.test.mts`.

import { test } from 'node:test'
import assert from 'node:assert/strict'
import { createInFlight, stableKey } from '../src/main/dataServer/inFlight'

/** A promise this suite settles by hand, so "still in flight" is a state rather than a race. */
function deferred<T>(): {
  promise: Promise<T>
  resolve: (v: T) => void
  reject: (e: Error) => void
} {
  let resolve!: (v: T) => void
  let reject!: (e: Error) => void
  const promise = new Promise<T>((res, rej) => {
    resolve = res
    reject = rej
  })
  return { promise, resolve, reject }
}

test('A SECOND CALLER OF AN IN-FLIGHT KEY STARTS NOTHING and is handed the same answer', async () => {
  const inFlight = createInFlight()
  const gate = deferred<{ seq: number }>()
  let started = 0
  const start = (): Promise<{ seq: number }> => {
    started += 1
    return gate.promise
  }

  const first = inFlight.share('module.snapshot {"module":"buffs"}', start)
  const second = inFlight.share('module.snapshot {"module":"buffs"}', start)
  const third = inFlight.share('module.snapshot {"module":"buffs"}', start)
  assert.equal(started, 1, 'three callers, one request')
  assert.equal(inFlight.size(), 1)

  gate.resolve({ seq: 9 })
  const answers = await Promise.all([first, second, third])
  assert.deepEqual(answers, [{ seq: 9 }, { seq: 9 }, { seq: 9 }])
  assert.equal(answers[0], answers[1], 'one answer, not three copies of it')
})

test('DIFFERENT KEYS ARE DIFFERENT QUESTIONS: each starts its own request', async () => {
  const inFlight = createInFlight()
  const asked: string[] = []
  const start = (what: string) => (): Promise<string> => {
    asked.push(what)
    return Promise.resolve(what)
  }

  const [a, b] = await Promise.all([
    inFlight.share('module.snapshot {"module":"buffs"}', start('buffs')),
    inFlight.share('module.snapshot {"module":"loot"}', start('loot'))
  ])
  assert.deepEqual(asked, ['buffs', 'loot'])
  assert.equal(a, 'buffs')
  assert.equal(b, 'loot')
})

test('IT IS NOT A CACHE: once the read settles the entry is gone, and the next call asks again', async () => {
  const inFlight = createInFlight()
  let started = 0
  const start = (): Promise<number> => {
    started += 1
    return Promise.resolve(started)
  }

  assert.equal(await inFlight.share('k', start), 1)
  assert.equal(inFlight.size(), 0, 'nothing outlives the request that produced it')
  assert.equal(await inFlight.share('k', start), 2, 'a fresh question gets a fresh answer')
  assert.equal(started, 2)
})

test('A REJECTION IS SHARED LIKE AN ANSWER, and it never sticks to the key', async () => {
  const inFlight = createInFlight()
  const gate = deferred<string>()
  const first = inFlight.share('k', () => gate.promise)
  const second = inFlight.share('k', () => Promise.resolve('never started'))

  gate.reject(new Error('the engine refused'))
  await assert.rejects(first, /the engine refused/)
  await assert.rejects(second, /the engine refused/)
  assert.equal(inFlight.size(), 0)
  assert.equal(await inFlight.share('k', () => Promise.resolve('asked again')), 'asked again')
})

test('A START THAT THROWS is a rejection, not a throw out of share, and leaves nothing in flight', async () => {
  const inFlight = createInFlight()
  await assert.rejects(
    inFlight.share('k', () => {
      throw new Error('no connection object')
    }),
    /no connection object/
  )
  assert.equal(inFlight.size(), 0)
})

test('stableKey: key order does not make a second question, array order and values do', () => {
  assert.equal(
    stableKey({ opts: { maxSegments: 0, selectedId: 'f-3' } }),
    stableKey({ opts: { selectedId: 'f-3', maxSegments: 0 } })
  )
  assert.notEqual(stableKey({ mobs: ['a', 'b'] }), stableKey({ mobs: ['b', 'a'] }))
  assert.notEqual(stableKey({ opts: { maxSegments: 0 } }), stableKey({ opts: { maxSegments: 1 } }))
  assert.notEqual(stableKey({ opts: {} }), stableKey({ opts: { timeline: false } }))
  // An absent option and an `undefined` one are the same on the wire, so they are the same here.
  assert.equal(stableKey({ opts: { timeline: undefined } }), stableKey({ opts: {} }))
})
