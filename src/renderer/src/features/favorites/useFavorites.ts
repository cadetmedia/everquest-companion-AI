import { useCallback, useMemo, useSyncExternalStore } from 'react'
import { createQuestFlagStore } from './useQuestFlags'

// A small localStorage-backed store of favorited item names (lowercased), shared
// across every list so a star toggled in one view updates everywhere at once.

// The store shape is the quest flags' own (a JSON array of lowercased keys in localStorage), so it
// is built on their factory rather than kept as a second copy of it.
const store = createQuestFlagStore('eq.favorites')

export function toggleFavorite(name: string): void {
  store.toggle(name)
}

export interface UseFavorites {
  favorites: Set<string>
  isFavorite: (name: string) => boolean
  toggle: (name: string) => void
}

/**
 * IDENTITY IS PART OF THE CONTRACT (JOS-206). This hook used to hand back a fresh `isFavorite`
 * closure and a fresh result object on EVERY render, and that is not a cosmetic detail: the Sky
 * tab passes `isFavorite` down to one component per quest, so a fresh closure per keystroke is a
 * changed prop on every row, which defeats any `React.memo` on the row and makes every character
 * typed into the search box a full re-render of every mounted accordion (measured: 82 ms per
 * keystroke at the default page cap, 179 ms with "show all"). The store already only changes when
 * a star is toggled — `favs` is a new Set exactly then — so the closure and the object can be
 * pinned to it and nothing else. Same values, same behaviour, a reference a memo can trust.
 */
export function useFavorites(): UseFavorites {
  const favs = useSyncExternalStore(store.subscribe, store.snapshot)
  const isFavorite = useCallback((name: string) => favs.has(name.toLowerCase()), [favs])
  return useMemo(
    () => ({ favorites: favs, isFavorite, toggle: toggleFavorite }),
    [favs, isFavorite]
  )
}
