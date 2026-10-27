// character/exaltPrefs.ts — the Exaltation cleanup's two remembered choices (Malkil via the owner,
// 2026-10-26):
//
//   THE VIEW - Current or Recommended on the gear grid. Per viewer (this machine), like the carry-all
//     lane beside it: `eq.character.exaltView`.
//   THE LOCKS - "this exaltation is staying, so, figure out the best for the remainder and stop asking
//     me to change it". Per character, in localStorage under `<name>_<server>` (the week-clears and
//     Gaps-edits shape): `eq.character.exaltLocks`. A lock names the seat AND the gem in it, so a gem
//     swapped in game leaves the lock inert rather than pinning whatever took its place.

import { useCallback, useEffect, useState, useSyncExternalStore } from 'react'
import type { CharacterSnap } from '@shared/types'
import { useModule } from '../../lib/useModule'

export type ExaltView = 'current' | 'recommended'

const VIEW_KEY = 'eq.character.exaltView'
const LOCKS_KEY = 'eq.character.exaltLocks'

function readView(): ExaltView {
  try {
    return localStorage.getItem(VIEW_KEY) === 'recommended' ? 'recommended' : 'current'
  } catch {
    return 'current'
  }
}

/** The remembered view; Current until the viewer picks Recommended. */
export function useExaltView(): [ExaltView, (v: ExaltView) => void] {
  const [view, setView] = useState<ExaltView>(readView)
  const pick = useCallback((v: ExaltView) => {
    setView(v)
    try {
      localStorage.setItem(VIEW_KEY, v)
    } catch {
      // A blocked store keeps the choice for this session only.
    }
  }, [])
  return [view, pick]
}

/** One lock: the seat and the gem sitting in it. */
export const lockId = (cellId: string, type: string, gemKey: string): string => `${cellId}|${type}|${gemKey}`

function readLocks(): Record<string, string[]> {
  try {
    const parsed: unknown = JSON.parse(localStorage.getItem(LOCKS_KEY) ?? '{}')
    return parsed !== null && typeof parsed === 'object' && !Array.isArray(parsed) ? (parsed as Record<string, string[]>) : {}
  } catch {
    return {}
  }
}

let all = readLocks()
const NONE: readonly string[] = []
const listeners = new Set<() => void>()

function subscribe(l: () => void): () => void {
  listeners.add(l)
  return () => listeners.delete(l)
}

function save(who: string, ids: readonly string[]): void {
  all = { ...all, [who]: [...ids] }
  try {
    localStorage.setItem(LOCKS_KEY, JSON.stringify(all))
  } catch {
    // A blocked store keeps them for this session only.
  }
  listeners.forEach((l) => l())
}

export interface ExaltLocks {
  /** this character's lock ids (`lockId`) */
  ids: readonly string[]
  /** false until the character is known: a lock saved before then would be nobody's */
  canToggle: boolean
  toggle: (id: string) => void
}

/** The current character's locks, re-read when the character changes. */
export function useExaltLocks(): ExaltLocks {
  const snap = useModule<CharacterSnap>('character')
  const c = snap?.character ?? null
  const who = c === null ? '' : `${c.name}_${c.server}`.toLowerCase()
  const ids = useSyncExternalStore(subscribe, () => (Array.isArray(all[who]) ? all[who] : NONE))
  // Another window may have written since this module read the store.
  useEffect(() => {
    all = readLocks()
    listeners.forEach((l) => l())
  }, [who])
  const toggle = useCallback(
    (id: string) => {
      if (who === '') return
      const mine = Array.isArray(all[who]) ? all[who] : []
      save(who, mine.includes(id) ? mine.filter((x) => x !== id) : [...mine, id])
    },
    [who]
  )
  return { ids, canToggle: who !== '', toggle }
}
