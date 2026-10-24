// useExtraSpellRows — the Spells rows for spells no log line names (owner, 2026-10-23: "i pasted this
// image and it's not creating a spell row": Pet Illusion: Gelatinous Cube). A pasted spell window is
// kept under its spell's name (pictureIntake.ts); the ones whose spell the wiki data lacks, asked of
// main once per change of that list (main/gapUnknownItems.ts `unknownSpells`), are rows.

import { useEffect, useMemo, useState } from 'react'
import { extraSpellRows } from '@shared/gapExtraItems'
import type { GapRow } from '@shared/gaps'
import { useSpellShots } from './itemShotsStore'

const NONE: ReadonlySet<string> = new Set()
const NO_ROWS: readonly GapRow[] = []

export function useExtraSpellRows(rows: readonly GapRow[] | undefined): readonly GapRow[] {
  const shots = useSpellShots()
  const windows = useMemo(() => Object.entries(shots).map(([name, s]) => ({ name, at: s.at })), [shots])
  const asked = useMemo(() => windows.map((w) => w.name).sort().join('\n'), [windows])
  const [unknown, setUnknown] = useState<ReadonlySet<string>>(NONE)
  useEffect(() => {
    if (asked === '') {
      setUnknown(NONE)
      return undefined
    }
    let live = true
    window.eq
      .gapUnknownSpells(asked.split('\n'))
      .then((names) => {
        if (live) setUnknown(new Set(names))
      })
      .catch(() => undefined)
    return () => {
      live = false
    }
  }, [asked])
  return useMemo(() => (unknown.size === 0 ? NO_ROWS : extraSpellRows(windows, unknown, rows ?? NO_ROWS)), [windows, unknown, rows])
}
