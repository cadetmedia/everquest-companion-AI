import { useSyncExternalStore } from 'react'
import type { CountSource } from '@shared/types'
import { COUNT_SOURCE_KEY, resolveCountSource } from '../inventory/countSource'

// The "Count items from" pick, one value per window. Each `useProgress` used to hold its own copy,
// read once at mount, so a change on the Sky tab never reached the always-mounted instance that
// feeds the Sky quest overlay (or the Loot tab's). One store, read by all of them.
//
// The stored pick, or the default for somebody who has never made one (JOS-294): both halves live
// in `countSource.ts`, whose header argues the `both` default. An explicit stored choice is
// returned verbatim; the default reaches only an absent key.

let current: CountSource | null = null
const listeners = new Set<() => void>()

function snapshot(): CountSource {
  current ??= resolveCountSource(localStorage.getItem(COUNT_SOURCE_KEY))
  return current
}

function subscribe(listener: () => void): () => void {
  listeners.add(listener)
  return () => {
    listeners.delete(listener)
  }
}

export function setCountSource(s: CountSource): void {
  localStorage.setItem(COUNT_SOURCE_KEY, s)
  current = s
  for (const l of listeners) l()
}

export function useCountSource(): CountSource {
  return useSyncExternalStore(subscribe, snapshot)
}
