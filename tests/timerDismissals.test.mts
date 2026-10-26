// useTimerDismissals — the buff/debuff timer windows' cleared bars, run for real through
// `tests/hookHost.mts`. The drop flash keys its epoch on `changes`, so every dismissal must move it
// (a re-dismissal and one past the cap leave the map's size alone, and used to read as "X dropped");
// and another character's bars start clean, because row ids repeat across characters.
import test from 'node:test'
import assert from 'node:assert/strict'
import { mountHook } from './hookHost.mjs'
import { useTimerDismissals } from '../src/renderer/src/overlay/useTimerDismissals.ts'
import { MAX_TIMER_DISMISSALS, type BuffTimerRow } from '../src/shared/buffTimers.ts'
import type { CharacterRef } from '../src/shared/types.ts'

const row = (id: string, startedTs: number): BuffTimerRow => ({ id, kind: 'buff', name: id, group: 'self', startedTs }) as BuffTimerRow

function mount(): { host: ReturnType<typeof mountHook<ReturnType<typeof useTimerDismissals>>>; switchTo: (c: CharacterRef | null) => void } {
  let onChar: ((c: CharacterRef | null) => void) | null = null
  const eqOverlay = {
    onCharacter: (cb: (c: CharacterRef | null) => void) => {
      onChar = cb
      return (): void => {
        onChar = null
      }
    }
  }
  ;(globalThis as unknown as { window: unknown }).window = { eqOverlay }
  const host = mountHook(() => useTimerDismissals())
  return { host, switchTo: (c) => host.act(() => onChar?.(c)) }
}

test('every dismissal moves the epoch, a re-dismissal and one past the cap included', () => {
  const { host } = mount()
  host.act(() => host.value.dismiss(row('self|self|clarity', 1)))
  const once = host.value.changes
  // Clarity was cast again and cleared again: the map still holds one entry.
  host.act(() => host.value.dismiss(row('self|self|clarity', 2)))
  assert.equal(host.value.dismissals.size, 1)
  assert.notEqual(host.value.changes, once, 'a re-dismissal is not a drop')
  for (let i = 0; i < MAX_TIMER_DISMISSALS; i++) host.act(() => host.value.dismiss(row(`self|self|b${i}`, 1)))
  const full = host.value.changes
  host.act(() => host.value.dismiss(row('self|self|one-more', 1)))
  assert.equal(host.value.dismissals.size, MAX_TIMER_DISMISSALS)
  assert.notEqual(host.value.changes, full, 'a dismissal past the cap is not a drop')
  host.unmount()
})

test('a switch to another character clears the dismissals; a rebuild of the same one keeps them', () => {
  const { host, switchTo } = mount()
  const leric: CharacterRef = { name: 'Leric', server: 'legends', logPath: 'a' }
  switchTo(leric)
  host.act(() => host.value.dismiss(row('self|self|clarity', 1)))
  switchTo(leric)
  assert.equal(host.value.dismissals.size, 1, 'the same character rebuilt keeps its cleared bars')
  switchTo({ name: 'Aaron', server: 'legends', logPath: 'b' })
  assert.equal(host.value.dismissals.size, 0, "another character's Clarity is not the cleared one")
  host.unmount()
})
