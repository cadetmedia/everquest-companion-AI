// useExtraItemRows — the Items rows for items no log line names (shared/gapExtraItems.ts; owner,
// 2026-10-22: Petamorph Wand: Gelatinous Cube). The held items no row names are asked of main once
// per change of that list (main/gapUnknownItems.ts, the engine's item check restated); the captured
// ones were checked when they were captured (CaptureBar).
//
// A held item the wiki lacks is remembered once an export lists it, and stays a row after it leaves
// the export (owner, 2026-10-22: Plea to Freeport, turned in; shared/gapHeldSeen.ts) until the data
// knows it or it is marked Done. A held row carries the app's guesses at its quest: the step that
// handed it over with no line (gapQuests.ts `silentGiver`) and who a Quest Journal objective sends it
// to (questJournal.ts `journalTurnIn`), each shown as a guess.

import { useEffect, useMemo, useState } from 'react'
import { capturedExtras, extraItemRows, heldExtras, type ExtraGuess } from '@shared/gapExtraItems'
import { askedNames, heldSeenChanged, heldSightings, rememberedExtras, withHeldSeen, type ExtraViewer } from '@shared/gapHeldSeen'
import type { HeldIndex } from '@shared/gapHeld'
import type { GapRow } from '@shared/gaps'
import { questsOfRows } from '@shared/gapQuests'
import { itemTierKey } from '@shared/itemStats'
import { useCapturedItems } from './capturedItemsStore'
import { saveHeldSeen, useHeldSeen } from './heldSeenStore'
import { useQuestJournals } from './itemShotsStore'

const NONE: ReadonlySet<string> = new Set()
const NO_ROWS: readonly GapRow[] = []

export function useExtraItemRows(rows: readonly GapRow[] | undefined, holding: HeldIndex, viewer: ExtraViewer = { me: null, all: false }): readonly GapRow[] {
  const engineRows = rows ?? NO_ROWS
  const captured = useCapturedItems()
  const remembered = useHeldSeen()
  const journals = useQuestJournals()
  const asked = useMemo(() => askedNames(holding, engineRows, remembered, viewer), [holding, engineRows, remembered, viewer])
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
  // What the exports show now is remembered, so it outlives the next export.
  const me = viewer.me
  useEffect(() => {
    if (me === null || unknown.size === 0) return
    const seen = heldSightings(holding, unknown, me)
    if (heldSeenChanged(remembered, seen)) saveHeldSeen(withHeldSeen(remembered, seen))
  }, [holding, unknown, me, remembered])
  const guess: ExtraGuess = useMemo(() => ({ quests: questsOfRows(engineRows), journals: Object.values(journals) }), [engineRows, journals])
  return useMemo(() => {
    if (unknown.size === 0 && captured.length === 0) return NO_ROWS
    const firstOf = new Map(remembered.map((s) => [itemTierKey(s.name), s.first]))
    const held = heldExtras(holding, unknown).map((e) => ({ ...e, first: firstOf.get(itemTierKey(e.name)) ?? e.at }))
    const gone = rememberedExtras(remembered, holding, unknown, viewer.all ? undefined : (me ?? undefined))
    return extraItemRows([...held, ...gone, ...capturedExtras(captured)], engineRows, guess)
  }, [holding, unknown, captured, engineRows, remembered, viewer.all, me, guess])
}
