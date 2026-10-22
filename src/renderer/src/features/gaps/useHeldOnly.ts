// useHeldOnly — "I have it" (owner, 2026-10-21: "a new filter for "held" or "have" or "owned" ... so
// that I can just see all items i have"): the Items list narrowed to what the player holds now, by
// the same index the rows' held chip reads (shared/gapHeld.ts). Since the same day a picker, Off /
// Anywhere / In bags / In bank ("In bags or In bank? depending on what we know right?"). Off by
// default; remembered per viewer like Zone I'm in, under the box's old key (its `1` reads as
// Anywhere). Items only: on another domain the pick stays and filters nothing.

import { useCallback, useMemo } from 'react'
import { heldPickOf, heldPickText, onlyHeld, type HeldIndex, type HeldPick } from '@shared/gapHeld'
import type { GapDomain, GapRow } from '@shared/gaps'
import { useRawPref } from '../combat/useCombatPrefs'

const HELD_ONLY_KEY = 'eq.gaps.heldOnly'

export interface HeldOnly {
  pick: HeldPick
  setPick: (pick: HeldPick) => void
  /** any pick but Off */
  on: boolean
  /** on, and the Items list is showing: the filter is narrowing it */
  active: boolean
  /** the rows left, all of them when not active */
  rows: readonly GapRow[]
}

export function useHeldOnly(rows: readonly GapRow[], holding: HeldIndex, domain: GapDomain): HeldOnly {
  const [raw, setRaw] = useRawPref(HELD_ONLY_KEY)
  const pick = heldPickOf(raw)
  const setPick = useCallback((p: HeldPick) => setRaw(heldPickText(p)), [setRaw])
  const kept = useMemo(() => (pick === 'off' || domain !== 'item' ? rows : onlyHeld(rows, holding, pick)), [pick, domain, rows, holding])
  return { pick, setPick, on: pick !== 'off', active: pick !== 'off' && domain === 'item', rows: kept }
}
