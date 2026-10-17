import { useEffect, useMemo } from 'react'
import type { ItemMarks } from '@shared/itemKnowledge'
import { SKY_OVERLAY_KEY, orderSkyOverlayRows, type SkyOverlayRow } from '@shared/skyQuestOverlay'
import { useQuestFavorites } from '../favorites/useQuestFlags'
import { fetchItemMarks, useItemMarksReader } from '../../lib/itemMarks'
import { hasEveryItem } from './questCompletion'
import type { QuestProgress } from './useProgress'

// The Sky quest overlay's feed (sky-quest-overlay): the starred quests, as the Sky tab counts them,
// written to the storage the overlay window shares with this one (shared/skyQuestOverlay.ts). Item
// icons come from `items:marks`, the committed item database only, never the wiki.

function toRow(q: QuestProgress, marksOf: (name: string) => ItemMarks | undefined): SkyOverlayRow {
  return {
    key: q.key,
    className: q.className,
    name: q.name,
    reward: q.reward,
    giver: q.giver,
    items: q.items.map((it) => ({ name: it.name, have: it.have, need: it.need, iconId: marksOf(it.name)?.iconId })),
    ready: hasEveryItem(q)
  }
}

/** Keep the overlay's rows in step with `quests`; a write happens only when they change. */
export function useSkyOverlayFeed(quests: readonly QuestProgress[], loaded: boolean): void {
  const starred = useQuestFavorites()
  const marksOf = useItemMarksReader()
  const shown = useMemo(() => quests.filter((q) => starred.has(q.key)), [quests, starred])
  // One batched ask per new set of item names; a name already asked is not asked again.
  const names = useMemo(() => [...new Set(shown.flatMap((q) => q.items.map((it) => it.name)))].join('\n'), [shown])
  useEffect(() => {
    if (names) void fetchItemMarks(names.split('\n'))
  }, [names])
  const raw = useMemo(() => {
    const rows = orderSkyOverlayRows(shown.map((q) => toRow(q, marksOf)))
    return JSON.stringify({ loaded, rows })
  }, [shown, loaded, marksOf])
  useEffect(() => {
    try {
      if (localStorage.getItem(SKY_OVERLAY_KEY) !== raw) localStorage.setItem(SKY_OVERLAY_KEY, raw)
    } catch {
      // Storage refused the write: the overlay keeps the rows it last read.
    }
  }, [raw])
}
