// factions/useDontCareFactions.ts — the factions the player has marked DON'T CARE (factionCare.ts
// says what the mark is for), as a small localStorage-backed set: the favorites/useQuestFlags.ts
// store shape, keyed by `factionNameKey` so the dump's spelling and the quest pages' agree.
//
// PER MACHINE, not per character: the app's other picks (quest stars, the wishlist's reasons) are
// per machine too. A player whose characters live in different cities will want different marks;
// that is the day this grows a character key.

import { useSyncExternalStore } from 'react'

const STORAGE_KEY = 'eq.factionsDontCare'

function load(): Set<string> {
  try {
    const raw: unknown = JSON.parse(localStorage.getItem(STORAGE_KEY) ?? '[]')
    return new Set((Array.isArray(raw) ? raw : []).map((s) => String(s).toLowerCase()))
  } catch {
    return new Set()
  }
}

let current: ReadonlySet<string> = load()
const listeners = new Set<() => void>()

function subscribe(listener: () => void): () => void {
  listeners.add(listener)
  return () => {
    listeners.delete(listener)
  }
}

/** Flip one faction's mark. `key` is `factionNameKey(name)`. A fresh Set, so React sees it. */
function toggle(key: string): void {
  const next = new Set(current)
  if (!next.delete(key)) next.add(key)
  current = next
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify([...next]))
  } catch {
    // A full or blocked store keeps the mark for this run only.
  }
  for (const l of listeners) l()
}

export interface DontCareFactions {
  /** the marked factions' join keys; stable identity until a toggle, so a sound memo dependency */
  keys: ReadonlySet<string>
  toggle: (key: string) => void
}

export function useDontCareFactions(): DontCareFactions {
  const keys = useSyncExternalStore(subscribe, () => current)
  return { keys, toggle }
}
