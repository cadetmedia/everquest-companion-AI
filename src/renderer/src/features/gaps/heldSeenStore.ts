// heldSeenStore — the held items an inventory export listed that the wiki data has no page for,
// remembered after they leave the export (shared/gapHeldSeen.ts; owner, 2026-10-22: Plea to Freeport,
// turned in, vanished from the tab "just because i turned it in"). Per viewer, in localStorage beside
// the captured items (capturedItemsStore.ts), every character's, each under its holder's name.

import { useSyncExternalStore } from 'react'
import { heldSeenOf, type HeldSeen } from '@shared/gapHeldSeen'

export const HELD_SEEN_KEY = 'eq.gaps.heldSeen'

function load(): HeldSeen[] {
  try {
    const raw = localStorage.getItem(HELD_SEEN_KEY)
    return heldSeenOf(raw === null ? [] : JSON.parse(raw))
  } catch {
    return []
  }
}

const listeners = new Set<() => void>()
let cached: { raw: string | null; items: readonly HeldSeen[] } = { raw: null, items: [] }

function snapshot(): readonly HeldSeen[] {
  let raw: string | null = null
  try {
    raw = localStorage.getItem(HELD_SEEN_KEY)
  } catch {
    return cached.items
  }
  if (raw !== cached.raw) cached = { raw, items: load() }
  return cached.items
}

function subscribe(onChange: () => void): () => void {
  const onStorage = (e: StorageEvent): void => {
    if (e.key === null || e.key === HELD_SEEN_KEY) onChange()
  }
  listeners.add(onChange)
  window.addEventListener('storage', onStorage)
  return () => {
    listeners.delete(onChange)
    window.removeEventListener('storage', onStorage)
  }
}

/** Keep the list (shared/gapHeldSeen.ts `withHeldSeen` made it). */
export function saveHeldSeen(list: readonly HeldSeen[]): void {
  try {
    localStorage.setItem(HELD_SEEN_KEY, JSON.stringify(list))
  } catch {
    // A blocked store keeps nothing; the export's own rows still show.
  }
  for (const l of listeners) l()
}

export function useHeldSeen(): readonly HeldSeen[] {
  return useSyncExternalStore(subscribe, snapshot, snapshot)
}
