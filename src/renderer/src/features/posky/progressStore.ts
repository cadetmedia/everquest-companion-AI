// progressStore.ts — the window's one held copy of the character's progress (perf audit,
// 2026-10-20: the Posky and Loot tabs asked `getProgress` again on every visit and drew null, then
// the answer, so every quest row rendered twice).
//
// It is still asked again on every mount and every inventory reload, as useProgress always did.
// What a remount gains: the last answer paints at once, readers mounting together share one ask,
// and a reply equal to the held copy keeps it. Every write lands here (a push from main, a turn-in
// or held-count reply), so every reader sees it; a reply asked before a newer write is dropped. A
// character switch drops the held copy at once, so turn-ins never cross characters (the ledger
// skips while progress is null).

import { useSyncExternalStore } from 'react'
import type { CharacterRef, ProgressState } from '@shared/types'

/** The bridge calls the store makes, structural so a test can fake them. */
export interface ProgressBridge {
  getProgress: () => Promise<ProgressState>
  onProgress: (cb: (p: ProgressState) => void) => () => void
  onInventoryReload: (cb: () => void) => () => void
  onCharacter: (cb: (c: CharacterRef | null) => void) => () => void
}

export interface ProgressStore {
  /** Watch the held copy; asks again unless an ask is already in flight. Returns the unsubscribe. */
  subscribe: (onChange: () => void) => () => void
  /** The held copy, or null before the first answer for this character. */
  current: () => ProgressState | null
  /** A newer state from a write the renderer made. */
  set: (p: ProgressState) => void
}

/** A re-ask that found nothing new keeps the held object, so no reader re-renders for it. */
function sameState(held: ProgressState | null, reply: ProgressState): boolean {
  return held !== null && JSON.stringify(held) === JSON.stringify(reply)
}

export function createProgressStore(bridge: () => ProgressBridge): ProgressStore {
  let held: ProgressState | null = null
  const subs = new Set<() => void>()
  /** Bumped on every publish: a reply to an ask made before the latest one is older than it. */
  let writes = 0
  let inFlight = false
  let again = false
  let listening = false

  const publish = (next: ProgressState | null): void => {
    writes++
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
    const asked = writes
    void bridge()
      .getProgress()
      .then((p) => {
        if (asked === writes && !sameState(held, p)) publish(p)
      })
      .catch(() => undefined)
      .finally(() => {
        inFlight = false
        const more = again && subs.size > 0
        again = false
        if (more) read(false)
      })
  }

  // Attached once and kept: a switch while no tab reads progress must still drop the old copy.
  const listen = (): void => {
    if (listening) return
    listening = true
    const b = bridge()
    b.onProgress(publish)
    b.onInventoryReload(() => {
      if (subs.size > 0) read(true)
    })
    b.onCharacter(() => {
      // Before the new read lands: the ledger must not pair the old progress with the new turn-ins.
      publish(null)
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
    current: () => held,
    set: publish
  }
}

const store = createProgressStore(() => window.eq)

/** The window's progress and its one setter, shared by every useProgress. */
export function useHeldProgress(): [ProgressState | null, (p: ProgressState) => void] {
  return [useSyncExternalStore(store.subscribe, store.current), store.set]
}
