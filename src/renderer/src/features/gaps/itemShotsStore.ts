// itemShotsStore — what pasted screenshots of item windows gave, as the player kept them, by item name
// (owner ask, 2026-10-21). Per viewer, in localStorage beside the Done marks (doneMarksStore.ts), so
// a reading survives a tab switch and a restart until the page is made. Copy wiki page reads it
// (shared/wikiPage.ts `ItemPageShot`).

import { useSyncExternalStore } from 'react'
import type { ItemPageShot } from '@shared/wikiPage'

export const SHOTS_KEY = 'eq.gaps.itemShots'
/** The newest this many are kept: a page a day for most of a year. */
const KEEP = 300

export type StoredShot = ItemPageShot & { at: string }

function load(): Record<string, StoredShot> {
  try {
    const raw = localStorage.getItem(SHOTS_KEY)
    const parsed: unknown = raw === null ? {} : JSON.parse(raw)
    return parsed !== null && typeof parsed === 'object' ? (parsed as Record<string, StoredShot>) : {}
  } catch {
    return {}
  }
}

const listeners = new Set<() => void>()
let cached: { raw: string | null; shots: Readonly<Record<string, StoredShot>> } = { raw: null, shots: {} }

function snapshot(): Readonly<Record<string, StoredShot>> {
  let raw: string | null = null
  try {
    raw = localStorage.getItem(SHOTS_KEY)
  } catch {
    return cached.shots
  }
  if (raw !== cached.raw) cached = { raw, shots: load() }
  return cached.shots
}

function subscribe(onChange: () => void): () => void {
  const onStorage = (e: StorageEvent): void => {
    if (e.key === null || e.key === SHOTS_KEY) onChange()
  }
  listeners.add(onChange)
  window.addEventListener('storage', onStorage)
  return () => {
    listeners.delete(onChange)
    window.removeEventListener('storage', onStorage)
  }
}

function save(shots: Record<string, StoredShot>): void {
  const newest = Object.entries(shots)
    .sort((a, b) => b[1].at.localeCompare(a[1].at))
    .slice(0, KEEP)
  try {
    localStorage.setItem(SHOTS_KEY, JSON.stringify(Object.fromEntries(newest)))
  } catch {
    // A blocked store keeps nothing; the reading stays on screen for this paste.
  }
  for (const l of listeners) l()
}

/** The reading kept for one item right now (not a render's copy: a paste merges against this). */
export function itemShotNow(name: string): StoredShot | undefined {
  return load()[name]
}

/** Keep (or replace) the reading for one item; `null` forgets it. */
export function setItemShot(name: string, shot: ItemPageShot | null): void {
  const others = Object.fromEntries(Object.entries(load()).filter(([k]) => k !== name))
  save(shot === null ? others : { ...others, [name]: { ...shot, at: new Date().toISOString() } })
}

/** Every kept reading by item name, current across windows. */
export function useItemShots(): Readonly<Record<string, StoredShot>> {
  return useSyncExternalStore(subscribe, snapshot, snapshot)
}
