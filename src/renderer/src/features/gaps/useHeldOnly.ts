// useHeldOnly — "I have it" (owner, 2026-10-21: "a new filter for "held" or "have" or "owned" ... so
// that I can just see all items i have"): the Items list narrowed to what the player holds now, by
// the same index the rows' held chip reads (shared/gapHeld.ts). Off by default; remembered per
// viewer like Zone I'm in. Items only: on another domain the box stays ticked and filters nothing.

import { useMemo } from 'react'
import { onlyHeld, type HeldIndex } from '@shared/gapHeld'
import type { GapDomain, GapRow } from '@shared/gaps'
import { useBoolPref } from '../combat/useCombatPrefs'

const HELD_ONLY_KEY = 'eq.gaps.heldOnly'

export interface HeldOnly {
  on: boolean
  setOn: (on: boolean) => void
  /** on, and the Items list is showing: the filter is narrowing it */
  active: boolean
  /** the rows left, all of them when not active */
  rows: readonly GapRow[]
}

export function useHeldOnly(rows: readonly GapRow[], holding: HeldIndex, domain: GapDomain): HeldOnly {
  const [on, setOn] = useBoolPref(HELD_ONLY_KEY, false)
  const active = on && domain === 'item'
  const kept = useMemo(() => (active ? onlyHeld(rows, holding) : rows), [active, rows, holding])
  return { on, setOn, active, rows: kept }
}
