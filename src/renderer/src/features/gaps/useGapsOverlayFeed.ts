// useGapsOverlayFeed — the Wiki Gaps overlay's feed (owner, 2026-10-20): the first ten rows of the
// Gaps list, written to the storage the overlay window shares with this one (shared/gapsOverlay.ts).
//
// ONLY WHILE THE OVERLAY IS OPEN: closed, nothing is built and nothing is written. And at most once
// a second (gapsOverlayPublishStep): a push that leaves the first ten rows as they were writes
// nothing, and a list moving on every kill is written once per second, the latest version.

import { useEffect, useMemo } from 'react'
import { GAPS_OVERLAY_KEY, gapsOverlayPublishStep } from '@shared/gapsOverlay'
import { gapsOverlayPayload } from '@shared/gapsOverlayFeed'
import { useOverlayOpen } from '../../lib/useOverlayOpen'
import { GAPS_DATA_DATE, PAGE_EXTRAS } from './useGapsData'
import type { GapsList } from './useGapsList'

/** What the To-do chips may say beyond the row, as the tab's own chips take it. */
const CHIP_CONTEXT = { dataDate: GAPS_DATA_DATE, isMob: PAGE_EXTRAS.isMob }

/** When this window last wrote the payload, shared by the tab and the publisher, which hand over. */
let lastAt = Number.NEGATIVE_INFINITY

function stored(): string | null {
  try {
    return localStorage.getItem(GAPS_OVERLAY_KEY)
  } catch {
    return null
  }
}

function write(raw: string): void {
  lastAt = Date.now()
  try {
    if (localStorage.getItem(GAPS_OVERLAY_KEY) !== raw) localStorage.setItem(GAPS_OVERLAY_KEY, raw)
  } catch {
    // Storage refused the write: the overlay keeps the rows it last read.
  }
}

/** Keep the overlay's rows in step with `list` while the overlay is open. */
export function useGapsOverlayFeed(list: Pick<GapsList, 'data' | 'domain' | 'sorted' | 'verdicts'>): void {
  const open = useOverlayOpen('gaps')
  const loaded = list.data.snap != null
  const { domain, sorted, verdicts } = list
  const raw = useMemo(
    () => (open ? JSON.stringify(gapsOverlayPayload({ loaded, domain, rows: sorted, verdicts, ctx: CHIP_CONTEXT })) : null),
    [open, loaded, domain, sorted, verdicts]
  )
  useEffect(() => {
    if (raw === null) return
    const step = gapsOverlayPublishStep(raw, stored(), { now: Date.now(), lastAt })
    if (step.kind === 'now') write(raw)
    if (step.kind !== 'wait') return
    // A newer list cancels this one; its own step waits out the same gap, measured from `lastAt`.
    const timer = setTimeout(() => {
      write(raw)
    }, step.ms)
    return () => {
      clearTimeout(timer)
    }
  }, [raw])
}
