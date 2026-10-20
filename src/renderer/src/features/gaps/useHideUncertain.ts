// useHideUncertain — "Hide uncertain" (owner, 2026-10-19): the rows the tab is not sure are gaps at
// all (shared/gaps.ts `uncertainGap`, today the "may be a player" names) can be hidden. Off by
// default, so everything shows; remembered per viewer like the tab's other checkboxes.

import { useMemo } from 'react'
import { withoutUncertain, type GapRow } from '@shared/gaps'
import { useBoolPref } from '../combat/useCombatPrefs'

const HIDE_UNCERTAIN_KEY = 'eq.gaps.hideUncertain'

export interface HideUncertain {
  hide: boolean
  setHide: (on: boolean) => void
  /** the rows left, all of them when off */
  rows: readonly GapRow[]
  /** how many it hid */
  hidden: number
}

export function useHideUncertain(rows: readonly GapRow[]): HideUncertain {
  const [hide, setHide] = useBoolPref(HIDE_UNCERTAIN_KEY, false)
  const kept = useMemo(() => (hide ? withoutUncertain(rows) : rows), [hide, rows])
  return { hide, setHide, rows: kept, hidden: rows.length - kept.length }
}
