// useGapShow — "Show: All / New pages / Updates" (owner, 2026-10-21: "a small update needed vs a
// missing item"): the list narrowed to one job (shared/gapJob.ts). All by default; remembered per
// viewer like Zone I'm in. Copy list and the grouped view read the narrowed rows.

import { useCallback, useMemo } from 'react'
import { gapShowOf, onlyJob, type GapShow } from '@shared/gapJob'
import type { GapActionContext, GapRow } from '@shared/gaps'
import { useRawPref } from '../combat/useCombatPrefs'

const SHOW_KEY = 'eq.gaps.show'

export interface GapShowState {
  show: GapShow
  setShow: (show: GapShow) => void
  /** the rows of the chosen job, all of them for All */
  rows: readonly GapRow[]
}

export function useGapShow(rows: readonly GapRow[], ctx: GapActionContext): GapShowState {
  const [raw, setRaw] = useRawPref(SHOW_KEY)
  const show = gapShowOf(raw)
  const setShow = useCallback((s: GapShow) => setRaw(s === 'all' ? null : s), [setRaw])
  const kept = useMemo(() => onlyJob(rows, show, ctx), [rows, show, ctx])
  return { show, setShow, rows: kept }
}
