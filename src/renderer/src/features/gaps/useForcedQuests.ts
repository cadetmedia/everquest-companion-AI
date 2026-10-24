// useForcedQuests — the quests the player named by hand (owner, 2026-10-23: "i need to be able to force a
// quest association"), per character, kept in localStorage like the tab's other per-viewer marks
// (useDoneMarks.ts). Never cleared on its own: a named quest stays until the player removes it.

import { useCallback, useMemo, useState } from 'react'
import { withoutQuest, withThreadAccepted, withVisitsAdded, type ForcedQuestMap, type TalkVisit } from '@shared/gapForcedQuests'
import type { QuestThread } from '@shared/gapQuestThreads'

const FORCED_KEY = 'eq.gaps.forcedQuests'
const NONE: ForcedQuestMap = {}

/** Every character's named quests as stored, by lower-cased character name. */
function load(): Record<string, ForcedQuestMap> {
  try {
    const parsed: unknown = JSON.parse(localStorage.getItem(FORCED_KEY) ?? '{}')
    return parsed !== null && typeof parsed === 'object' ? (parsed as Record<string, ForcedQuestMap>) : {}
  } catch {
    return {}
  }
}

function save(all: Record<string, ForcedQuestMap>): void {
  try {
    localStorage.setItem(FORCED_KEY, JSON.stringify(all))
  } catch {
    // A blocked store keeps them for this session only.
  }
}

export interface ForcedQuests {
  forced: ForcedQuestMap
  /** Visits added to the quest `name`; a name the log has no quest for becomes one. */
  add: (name: string, visits: readonly TalkVisit[]) => void
  /** The quest `name`'s association, gone: a named quest's row, or the visits added to a logged one. */
  remove: (name: string) => void
  /** A chain the log rebuilt, accepted as the quest `name`. */
  accept: (name: string, thread: QuestThread) => void
}

export function useForcedQuests(character: string | null | undefined): ForcedQuests {
  const who = (character ?? '').toLowerCase()
  const [all, setAll] = useState(load)
  const update = useCallback(
    (f: (mine: ForcedQuestMap) => ForcedQuestMap) =>
      setAll((cur) => {
        const next = { ...cur, [who]: f(cur[who] ?? NONE) }
        save(next)
        return next
      }),
    [who]
  )
  const add = useCallback((name: string, visits: readonly TalkVisit[]) => update((m) => withVisitsAdded(m, name, visits)), [update])
  const remove = useCallback((name: string) => update((m) => withoutQuest(m, name)), [update])
  const accept = useCallback((name: string, thread: QuestThread) => update((m) => withThreadAccepted(m, name, thread)), [update])
  const forced = all[who] ?? NONE
  return useMemo(() => ({ forced, add, remove, accept }), [forced, add, remove, accept])
}
