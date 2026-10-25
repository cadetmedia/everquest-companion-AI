/**
 * useSecondsClock runs only while there is something to time (perf audit, 2026-10-20: idle
 * wakeups), and a clock that starts again shows the current time at once, not the time it stopped.
 */

import { test } from 'node:test'
import assert from 'node:assert/strict'
import { mountHook } from './hookHost.mjs'
import { useSecondsClock } from '../src/renderer/src/lib/useSecondsClock'

test('a running clock ticks once a second; a stopped one keeps no timer', (t) => {
  t.mock.timers.enable({ apis: ['setInterval', 'Date'], now: 1_000_000 })
  let running = true
  const host = mountHook(() => useSecondsClock(running))
  assert.equal(host.value, 1_000_000)
  t.mock.timers.tick(1_000)
  assert.equal(host.render(), 1_001_000)

  running = false
  host.render()
  t.mock.timers.tick(5_000)
  assert.equal(host.render(), 1_001_000, 'no tick while nothing is timed')
  host.unmount()
})

test('a clock that starts again reads the time before anything reads it', (t) => {
  t.mock.timers.enable({ apis: ['setInterval', 'Date'], now: 2_000_000 })
  let running = false
  const host = mountHook(() => useSecondsClock(running))
  t.mock.timers.tick(30_000)
  running = true
  assert.equal(host.render(), 2_030_000, 'the restart is the current time, not the mount time')
  t.mock.timers.tick(1_000)
  assert.equal(host.render(), 2_031_000)
  host.unmount()
})

test('the default is a clock that always runs, as before', (t) => {
  t.mock.timers.enable({ apis: ['setInterval', 'Date'], now: 3_000_000 })
  const host = mountHook(() => useSecondsClock())
  t.mock.timers.tick(2_000)
  assert.equal(host.render(), 3_002_000)
  host.unmount()
})
