// questLivePages.ts — the quest pages a Copy click found on the wiki this session (owner, 2026-10-23),
// so a row the committed catalog does not know yet (a page written since the last scrape) reads
// Update page once the wiki has answered. Session memory only: the next data refresh carries the
// page into quests.json for good.

import { useSyncExternalStore } from 'react'
import { questTitleKey } from '@shared/gapQuests'

/** The pages found, replaced (never mutated) on each find, so its identity says when it changed. */
let pages: ReadonlyMap<string, string> = new Map()
const listeners = new Set<() => void>()

/** The wiki answered: the quest has a page, under this title. */
export function noteQuestPage(name: string, title: string): void {
  const key = questTitleKey(name)
  if (pages.get(key) === title) return
  pages = new Map([...pages, [key, title]])
  for (const l of listeners) l()
}

/** The pages live reads found, by `questTitleKey`; a new map each time one is found. */
export function useQuestLivePages(): ReadonlyMap<string, string> {
  return useSyncExternalStore(
    (l) => {
      listeners.add(l)
      return () => listeners.delete(l)
    },
    () => pages
  )
}
