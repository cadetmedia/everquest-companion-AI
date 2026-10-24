// gapEditsStore — the Gaps rows the player corrected by hand (owner, 2026-10-23: "Perhaps we should be
// able to EDIT values in the gaps tab?"), per character, kept in localStorage like the tab's other marks.
// A small store, not a hook's state: the row buttons save and the tab's data reads, in different parts
// of the tree. The character is the one the tab's data is for, set by useGapEdits.

import { useEffect, useMemo, useSyncExternalStore } from 'react'
import { doneKey, type GapRow } from '@shared/gaps'
import { tidyEdit, withGapEdits, type GapEdit, type GapEditMap } from '@shared/gapEdits'

const EDITS_KEY = 'eq.gaps.edits'
const NONE: GapEditMap = {}

function load(): Record<string, GapEditMap> {
  try {
    const parsed: unknown = JSON.parse(localStorage.getItem(EDITS_KEY) ?? '{}')
    return parsed !== null && typeof parsed === 'object' ? (parsed as Record<string, GapEditMap>) : {}
  } catch {
    return {}
  }
}

let all = load()
let who = ''
const listeners = new Set<() => void>()
const notify = (): void => listeners.forEach((l) => l())

function subscribe(l: () => void): () => void {
  listeners.add(l)
  return () => listeners.delete(l)
}

/** The row's edit saved for the tab's character; null resets it. */
export function saveGapEdit(row: GapRow, edit: GapEdit | null): void {
  const key = doneKey(row)
  const tidy = edit === null ? null : tidyEdit(edit)
  const rest = Object.entries(all[who] ?? NONE).filter(([k]) => k !== key)
  const mine: GapEditMap = Object.fromEntries(tidy === null ? rest : [...rest, [key, tidy]])
  all = { ...all, [who]: mine }
  try {
    localStorage.setItem(EDITS_KEY, JSON.stringify(all))
  } catch {
    // A blocked store keeps them for this session only.
  }
  notify()
}

/** The tab's character's edits; the row buttons save under the same character. */
export function useGapEdits(character: string | null | undefined): GapEditMap {
  const name = (character ?? '').toLowerCase()
  useEffect(() => {
    if (who === name) return
    who = name
    notify()
  }, [name])
  return useSyncExternalStore(subscribe, () => all[name] ?? NONE)
}

/** The snap with the character's hand edits on its rows (`of` names the character): the same object while there are none. */
export function useEditedSnap<S extends { rows: GapRow[] }>(snap: S | null | undefined, of: { character?: string | null } | null | undefined): S | null | undefined {
  const edits = useGapEdits(of?.character)
  return useMemo(() => (snap && Object.keys(edits).length > 0 ? { ...snap, rows: withGapEdits(snap.rows, edits) } : snap), [snap, edits])
}
