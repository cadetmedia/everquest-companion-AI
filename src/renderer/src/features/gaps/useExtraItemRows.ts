// useExtraItemRows — the Items rows for items no log line names (shared/gapExtraItems.ts; owner,
// 2026-10-22: Petamorph Wand: Gelatinous Cube). The held items no row names are asked of main once
// per change of that list (main/gapUnknownItems.ts, the engine's item check restated); the captured
// ones were checked when they were captured (CaptureBar).

import { useEffect, useMemo, useState } from 'react'
import { capturedExtras, extraItemRows, heldCandidates, heldExtras } from '@shared/gapExtraItems'
import type { HeldIndex } from '@shared/gapHeld'
import type { GapRow } from '@shared/gaps'
import { useCapturedItems } from './capturedItemsStore'

const NONE: ReadonlySet<string> = new Set()
const NO_ROWS: readonly GapRow[] = []

export function useExtraItemRows(rows: readonly GapRow[] | undefined, holding: HeldIndex): readonly GapRow[] {
  const engineRows = rows ?? NO_ROWS
  const captured = useCapturedItems()
  const candidates = useMemo(() => heldCandidates(holding, engineRows), [holding, engineRows])
  const asked = candidates.join('\n')
  const [unknown, setUnknown] = useState<ReadonlySet<string>>(NONE)
  useEffect(() => {
    if (asked === '') {
      setUnknown(NONE)
      return undefined
    }
    let live = true
    window.eq
      .gapUnknownItems(asked.split('\n'))
      .then((names) => {
        if (live) setUnknown(new Set(names))
      })
      .catch(() => undefined)
    return () => {
      live = false
    }
  }, [asked])
  return useMemo(
    () => (unknown.size === 0 && captured.length === 0 ? NO_ROWS : extraItemRows([...heldExtras(holding, unknown), ...capturedExtras(captured)], engineRows)),
    [holding, unknown, captured, engineRows]
  )
}
