// doneMarksStore — the Gaps tab's Done marks as stored, for every window that reads them.
//
// The marks live in localStorage under one key (useDoneMarks.ts has the why). The Event log overlay
// reads them too (owner, 2026-10-20: "if i've marked it done, don't tell me it needs a screenshot
// still"): an overlay is another window of the same origin, so it shares the store, and the
// browser's `storage` event tells it the moment the Gaps tab marks or unmarks a row.

import { useSyncExternalStore } from 'react'

export const DONE_KEY = 'eq.gaps.done'

/** The marks as stored: `domain:name` → the day it was marked. Empty when absent or unreadable. */
export function loadDoneMarks(): Record<string, string> {
  try {
    const raw = localStorage.getItem(DONE_KEY)
    const parsed: unknown = raw === null ? {} : JSON.parse(raw)
    return parsed !== null && typeof parsed === 'object' ? (parsed as Record<string, string>) : {}
  } catch {
    return {}
  }
}

export function saveDoneMarks(done: Record<string, string>): void {
  try {
    localStorage.setItem(DONE_KEY, JSON.stringify(done))
  } catch {
    // A blocked store keeps the marks for this session only.
  }
}

/** Whether `domain:name` is marked done, ignoring case: a con line sentence-cases the article. */
export function isMarkedDone(done: ReadonlySet<string>, domain: string, name: string): boolean {
  return done.has(`${domain}:${name}`.toLowerCase())
}

/** The names marked "Mark as player" on the Gaps tab (useDoneMarks.ts `usePlayerList`): a lower-cased list. */
export const PLAYERS_KEY = 'eq.gaps.players'

/** The stored players list as names. Empty when absent or unreadable. */
export function loadPlayers(raw: string | null): string[] {
  try {
    const parsed: unknown = JSON.parse(raw ?? '[]')
    return Array.isArray(parsed) ? parsed.filter((n): n is string => typeof n === 'string') : []
  } catch {
    return []
  }
}

/** One stored key read as a Set of lowercased strings; one Set per stored value, so a reader re-renders only on a change. */
function storedSet(key: string, keysOf: (raw: string | null) => Iterable<string>): { snapshot: () => ReadonlySet<string>; subscribe: (onChange: () => void) => () => void } {
  let cached: { raw: string | null; keys: ReadonlySet<string> } = { raw: null, keys: new Set() }
  const snapshot = (): ReadonlySet<string> => {
    let raw: string | null = null
    try {
      raw = localStorage.getItem(key)
    } catch {
      return cached.keys
    }
    if (raw !== cached.raw) cached = { raw, keys: new Set([...keysOf(raw)].map((k) => k.toLowerCase())) }
    return cached.keys
  }
  const subscribe = (onChange: () => void): (() => void) => {
    const onStorage = (e: StorageEvent): void => {
      if (e.key === null || e.key === key) onChange()
    }
    window.addEventListener('storage', onStorage)
    return () => window.removeEventListener('storage', onStorage)
  }
  return { snapshot, subscribe }
}

const doneStore = storedSet(DONE_KEY, () => Object.keys(loadDoneMarks()))
const playersStore = storedSet(PLAYERS_KEY, loadPlayers)

/** The Done marks another window made, kept current (lowercased `domain:name` keys). */
export function useDoneKeys(): ReadonlySet<string> {
  return useSyncExternalStore(doneStore.subscribe, doneStore.snapshot, doneStore.snapshot)
}

/** The names the viewer marked as players on the Gaps tab, kept current (lowercased): the Event log
 *  marks none of them, as the tab files no Mobs row for them (owner, 2026-10-23). */
export function useMarkedPlayers(): ReadonlySet<string> {
  return useSyncExternalStore(playersStore.subscribe, playersStore.snapshot, playersStore.snapshot)
}
