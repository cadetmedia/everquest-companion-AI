// lib/dumpStore.ts — one window-wide answer for a read of the character's inventory dump (perf
// audit, 2026-10-20: the Gear, Character and Leveling tabs re-asked on every mount and drew
// null, then the answer, so everything rendered twice).
//
// What changes is only where the answer is HELD. It is still re-asked on every mount and on every
// `inventory:autoReloaded`, exactly as the hooks always did, so a dump the player rewrites still
// shows. What a remount gains: the last answer paints at once, readers mounted together share one
// ask, and a reply for the same file (path + mtime, the key main caches on) keeps the held object,
// so nothing downstream re-renders for it. `onCharacter` drops the answer: another character's
// dump is never painted.

import { useSyncExternalStore } from 'react'
import type { CharacterRef } from '../../../shared/types'

/** What every dump answer carries: which file, and its mtime. */
interface DumpAnswer {
  path: string
  loadedAt: string
}

export interface DumpState<T> {
  /** the answer, or null when this character has never written a dump */
  value: T | null
  /** false until the first read of this character settles */
  ready: boolean
}

/** The two bridge events the store listens to, structural so a test can fake them. */
export interface DumpBridge {
  onInventoryReload: (cb: () => void) => () => void
  onCharacter: (cb: (c: CharacterRef | null) => void) => () => void
}

export interface DumpStore<T> {
  /** Watch the answer; asks again unless an ask is already in flight. Returns the unsubscribe. */
  subscribe: (onChange: () => void) => () => void
  current: () => DumpState<T>
}

const UNREAD: DumpState<never> = { value: null, ready: false }

function sameFile(a: DumpAnswer | null, b: DumpAnswer | null): boolean {
  return a === b || (a !== null && b !== null && a.path === b.path && a.loadedAt === b.loadedAt)
}

export function createDumpStore<T extends DumpAnswer>(ask: () => Promise<T | null>, bridge: () => DumpBridge): DumpStore<T> {
  let held: DumpState<T> = UNREAD
  const subs = new Set<() => void>()
  let generation = 0
  let inFlight = false
  let again = false
  let listening = false

  const publish = (next: DumpState<T>): void => {
    held = next
    for (const s of subs) s()
  }

  /** `fresh`: the world moved since any ask in flight began, so one more ask follows it. */
  const read = (fresh: boolean): void => {
    if (inFlight) {
      again ||= fresh
      return
    }
    inFlight = true
    const gen = generation
    void ask()
      .catch(() => null) // main never rejects; a failed invoke is "no dump", not a red box
      .then((value) => {
        inFlight = false
        // An answer from before a character switch is dropped, and asked again if anyone reads.
        const stale = gen !== generation
        if (!stale && !(held.ready && sameFile(held.value, value))) publish({ value, ready: true })
        const more = (again || stale) && subs.size > 0
        again = false
        if (more) read(false)
      })
  }

  // Attached once and kept: a character switch while no tab reads the dump must still drop it.
  const listen = (): void => {
    if (listening) return
    listening = true
    const b = bridge()
    b.onInventoryReload(() => {
      if (subs.size > 0) read(true)
    })
    b.onCharacter(() => {
      generation++
      publish(UNREAD)
      if (subs.size > 0) read(true)
    })
  }

  return {
    subscribe: (onChange) => {
      listen()
      subs.add(onChange)
      read(false)
      return () => {
        subs.delete(onChange)
      }
    },
    current: () => held
  }
}

/** A component's view of a dump store. */
export function useDumpStore<T>(store: DumpStore<T>): DumpState<T> {
  return useSyncExternalStore(store.subscribe, store.current)
}
