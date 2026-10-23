// capturedItemsStore — the items a capture read whose name the wiki data has no page for and no
// row named (owner, 2026-10-22: a store purchase leaves no log line, so the capture itself is the
// witness). Per viewer, in localStorage beside the kept readings (itemShotsStore.ts), so the row
// and its reading survive a restart; Done hides the row as any other.

import { useSyncExternalStore } from 'react'
import { capturedItemsOf, withCapturedItem, type CapturedItem } from '@shared/gapExtraItems'

export const CAPTURED_ITEMS_KEY = 'eq.gaps.capturedItems'
/** The newest this many are kept. */
const KEEP = 300

function load(): CapturedItem[] {
  try {
    const raw = localStorage.getItem(CAPTURED_ITEMS_KEY)
    return capturedItemsOf(raw === null ? [] : JSON.parse(raw))
  } catch {
    return []
  }
}

const listeners = new Set<() => void>()
let cached: { raw: string | null; items: readonly CapturedItem[] } = { raw: null, items: [] }

function snapshot(): readonly CapturedItem[] {
  let raw: string | null = null
  try {
    raw = localStorage.getItem(CAPTURED_ITEMS_KEY)
  } catch {
    return cached.items
  }
  if (raw !== cached.raw) cached = { raw, items: load() }
  return cached.items
}

function subscribe(onChange: () => void): () => void {
  const onStorage = (e: StorageEvent): void => {
    if (e.key === null || e.key === CAPTURED_ITEMS_KEY) onChange()
  }
  listeners.add(onChange)
  window.addEventListener('storage', onStorage)
  return () => {
    listeners.delete(onChange)
    window.removeEventListener('storage', onStorage)
  }
}

/** Keep a captured item by name (a second capture of it only moves its time). */
export function addCapturedItem(name: string, at = new Date().toISOString()): void {
  try {
    localStorage.setItem(CAPTURED_ITEMS_KEY, JSON.stringify(withCapturedItem(load(), name, at, KEEP)))
  } catch {
    // A blocked store keeps nothing; the reading stays on screen for this capture.
  }
  for (const l of listeners) l()
}

export function useCapturedItems(): readonly CapturedItem[] {
  return useSyncExternalStore(subscribe, snapshot, snapshot)
}
