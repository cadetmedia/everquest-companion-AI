// itemShotsStore — what pasted screenshots of item windows gave, as the player kept them, by item name
// (owner ask, 2026-10-21). Per viewer, in localStorage beside the Done marks (doneMarksStore.ts), so
// a reading survives a tab switch and a restart until the page is made. Copy wiki page reads it
// (shared/wikiPage.ts `ItemPageShot`). Spell display windows keep theirs the same way, under their
// own key (shared/spellWindow.ts `SpellPageShot`).

import { useSyncExternalStore } from 'react'
import type { ItemPageShot } from '@shared/wikiPage'
import type { SpellPageShot } from '@shared/spellWindow'

export const SHOTS_KEY = 'eq.gaps.itemShots'
export const SPELL_SHOTS_KEY = 'eq.gaps.spellShots'
/** The newest this many are kept: a page a day for most of a year. */
const KEEP = 300

type Stored<T> = T & { at: string }
export type StoredShot = Stored<ItemPageShot>
export type StoredSpellShot = Stored<SpellPageShot>

/** One kind of kept reading, by row name, in localStorage under `key`. */
function shotStore<T extends object>(key: string): {
  now: (name: string) => Stored<T> | undefined
  set: (name: string, shot: T | null) => void
  use: () => Readonly<Record<string, Stored<T>>>
} {
  const load = (): Record<string, Stored<T>> => {
    try {
      const raw = localStorage.getItem(key)
      const parsed: unknown = raw === null ? {} : JSON.parse(raw)
      return parsed !== null && typeof parsed === 'object' ? (parsed as Record<string, Stored<T>>) : {}
    } catch {
      return {}
    }
  }
  const listeners = new Set<() => void>()
  let cached: { raw: string | null; shots: Readonly<Record<string, Stored<T>>> } = { raw: null, shots: {} }
  const snapshot = (): Readonly<Record<string, Stored<T>>> => {
    let raw: string | null = null
    try {
      raw = localStorage.getItem(key)
    } catch {
      return cached.shots
    }
    if (raw !== cached.raw) cached = { raw, shots: load() }
    return cached.shots
  }
  const subscribe = (onChange: () => void): (() => void) => {
    const onStorage = (e: StorageEvent): void => {
      if (e.key === null || e.key === key) onChange()
    }
    listeners.add(onChange)
    window.addEventListener('storage', onStorage)
    return () => {
      listeners.delete(onChange)
      window.removeEventListener('storage', onStorage)
    }
  }
  const save = (shots: Record<string, Stored<T>>): void => {
    const newest = Object.entries(shots)
      .sort((a, b) => b[1].at.localeCompare(a[1].at))
      .slice(0, KEEP)
    try {
      localStorage.setItem(key, JSON.stringify(Object.fromEntries(newest)))
    } catch {
      // A blocked store keeps nothing; the reading stays on screen for this paste.
    }
    for (const l of listeners) l()
  }
  return {
    now: (name) => load()[name],
    set: (name, shot) => {
      const others = Object.fromEntries(Object.entries(load()).filter(([k]) => k !== name))
      save(shot === null ? others : { ...others, [name]: { ...shot, at: new Date().toISOString() } })
    },
    use: () => useSyncExternalStore(subscribe, snapshot, snapshot)
  }
}

const items = shotStore<ItemPageShot>(SHOTS_KEY)
const spells = shotStore<SpellPageShot>(SPELL_SHOTS_KEY)

/** The reading kept for one item right now (not a render's copy: a paste merges against this). */
export const itemShotNow = (name: string): StoredShot | undefined => items.now(name)
/** Keep (or replace) the reading for one item; `null` forgets it. */
export const setItemShot = (name: string, shot: ItemPageShot | null): void => items.set(name, shot)
/** Every kept reading by item name, current across windows. */
export const useItemShots = (): Readonly<Record<string, StoredShot>> => items.use()

/** Keep (or replace) the reading for one spell; `null` forgets it. */
export const setSpellShot = (name: string, shot: SpellPageShot | null): void => spells.set(name, shot)
/** Every kept spell window reading by spell name. */
export const useSpellShots = (): Readonly<Record<string, StoredSpellShot>> => spells.use()

/**
 * The Gaps Items rows' names as the list last held them (CaptureBar keeps this current): a paste's name
 * read through an OCR slip is checked against the other rows too (shared/itemShotKeep.ts `sameItem`).
 */
let rowNames: readonly string[] = []
export const setItemRowNames = (names: readonly string[]): void => {
  rowNames = names
}
export const itemRowNamesNow = (): readonly string[] => rowNames
