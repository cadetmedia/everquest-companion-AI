// useExtraItemRows — the Items rows for items no log line names (shared/gapExtraItems.ts; owner,
// 2026-10-22: Petamorph Wand: Gelatinous Cube). The held items no row names, and the captured ones,
// are asked of main once per change of that list (main/gapUnknownItems.ts, the engine's item check
// restated). A capture was checked when it was taken too (CaptureBar), but the data moves on: a
// delta that adds its page takes the row away (owner, 2026-10-25: Jenni's Robe).
//
// A held item the wiki lacks is remembered once an export lists it, and stays a row after it leaves
// the export (owner, 2026-10-22: Plea to Freeport, turned in; shared/gapHeldSeen.ts) until the data
// knows it or it is marked Done. A held row carries the app's guesses at its quest: the step that
// handed it over with no line (gapQuests.ts `silentGiver`) and who a Quest Journal objective sends it
// to (questJournal.ts `journalTurnIn`), each shown as a guess.

import { useCallback, useEffect, useMemo, useState } from 'react'
import { capturedExtras, capturedNames, capturedStillUnknown, extraItemRows, heldExtras, type ExtraGuess } from '@shared/gapExtraItems'
import { askedNames, heldSeenChanged, heldSightings, rememberedExtras, withHeldSeen, type ExtraViewer } from '@shared/gapHeldSeen'
import type { HeldIndex } from '@shared/gapHeld'
import { doneKey, type GapRow } from '@shared/gaps'
import { questsOfRows } from '@shared/gapQuests'
import { foldedEdits } from '@shared/gapEdits'
import { itemTierKey } from '@shared/itemStats'
import { useCapturedItems } from './capturedItemsStore'
import { useCurrentGapEdits } from './gapEditsStore'
import { saveHeldSeen, useHeldSeen } from './heldSeenStore'
import { useQuestJournals } from './itemShotsStore'

const NONE: ReadonlySet<string> = new Set()
const NO_ROWS: readonly GapRow[] = []
/** What main last answered: the names it was asked about and the ones it found no page for. */
interface Answer {
  asked: ReadonlySet<string>
  unknown: ReadonlySet<string>
}
const NO_ANSWER: Answer = { asked: NONE, unknown: NONE }
/** Main's last answer and the names it answered, kept across remounts: the corpus it reads is static. */
let lastAnswer: { names: string; answer: Answer } | null = null

export function useExtraItemRows(rows: readonly GapRow[] | undefined, holding: HeldIndex, viewer: ExtraViewer = { me: null, all: false }): readonly GapRow[] {
  const engineRows = rows ?? NO_ROWS
  const captured = useCapturedItems()
  const remembered = useHeldSeen()
  const journals = useQuestJournals()
  const edits = useCurrentGapEdits()
  // A captured row's Edit name (a misread capture put right by hand): its key is the captured name.
  const byKey = useMemo(() => foldedEdits(edits), [edits])
  const renamed = useCallback((name: string): string | undefined => {
    const edit: unknown = byKey.get(doneKey({ domain: 'item', name } as GapRow))
    const fixed = edit !== null && typeof edit === 'object' ? (edit as { name?: unknown }).name : undefined
    return typeof fixed === 'string' ? fixed : undefined
  }, [byKey])
  const asked = useMemo(() => {
    const held = askedNames(holding, engineRows, remembered, viewer)
    const names = [...(held === '' ? [] : held.split('\n')), ...capturedNames(captured, renamed)]
    return [...new Set(names)].sort((a, b) => a.localeCompare(b)).join('\n')
  }, [holding, engineRows, remembered, viewer, captured, renamed])
  const [answer, setAnswer] = useState<Answer>(() => (lastAnswer?.names === asked ? lastAnswer.answer : NO_ANSWER))
  useEffect(() => {
    if (asked === '') {
      setAnswer(NO_ANSWER)
      return undefined
    }
    if (lastAnswer?.names === asked) {
      setAnswer(lastAnswer.answer)
      return undefined
    }
    let live = true
    const names = asked.split('\n')
    window.eq
      .gapUnknownItems(names)
      .then((found) => {
        const next = { asked: new Set(names), unknown: new Set(found) }
        lastAnswer = { names: asked, answer: next }
        if (live) setAnswer(next)
      })
      .catch(() => undefined)
    return () => {
      live = false
    }
  }, [asked])
  const unknown = answer.unknown
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
    const capturedRows = capturedExtras(capturedStillUnknown(captured, answer.asked, unknown, renamed))
    return extraItemRows([...held, ...gone, ...capturedRows], engineRows, guess)
  }, [holding, unknown, answer.asked, captured, renamed, engineRows, remembered, viewer.all, me, guess])
}
