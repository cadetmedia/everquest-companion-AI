// useDoneMarks — the rows the player has marked done (owner ask, 2026-10-19): a page made or an image
// uploaded leaves its row on the tab until the next data refresh, so a Done mark hides it here first.
// Per viewer, in localStorage. "Show done" brings them back, for a wrong click.
//
// EVERY MARK CLEARS WHEN THE WIKI DATA IS NEWER THAN IT (owner, 2026-10-19: "after a scrape, wipe
// all DONE entries"), by the time, not the date (owner, 2026-10-25): a row the refresh still lacks
// comes back. A row's absence is never the test:
// the list fills in stages at launch and swaps with the character, and dropping on absence lost marks.

import { useCallback, useEffect, useMemo, useState } from 'react'
import { doneKey, keptDoneMarks, withDoneMarks, type GapRow } from '@shared/gaps'
import { playerNames, type PlayerNames } from '@shared/gapPlayers'
import { loadDoneMarks as load, loadPlayers, PLAYERS_KEY, saveDoneMarks as save } from './doneMarksStore'
import { useOwnCharacterNames } from './useOwnCharacters'

export interface DoneMarks {
  done: ReadonlySet<string>
  toggle: (row: GapRow) => void
  /** every one of `rows` marked done, or every one cleared: a mob heading's Done (owner ask, 2026-10-21) */
  setMany: (rows: readonly GapRow[], on: boolean) => void
}

/** `scrapedAt`: when the wiki data was scraped (an ISO time); every mark made before it is cleared (keptDoneMarks). */
export function useDoneMarks(scrapedAt: string): DoneMarks {
  const [marks, setMarks] = useState<Record<string, string>>(load)
  useEffect(() => {
    if (scrapedAt === '') return
    setMarks((cur) => {
      const kept = keptDoneMarks(cur, scrapedAt)
      if (Object.keys(kept).length === Object.keys(cur).length) return cur
      save(kept)
      return kept
    })
  }, [scrapedAt])
  const toggle = useCallback(
    (row: GapRow) =>
      setMarks((cur) => {
        const key = doneKey(row)
        const next = key in cur ? Object.fromEntries(Object.entries(cur).filter(([k]) => k !== key)) : { ...cur, [key]: new Date().toISOString() }
        save(next)
        return next
      }),
    []
  )
  const setMany = useCallback(
    (rows: readonly GapRow[], on: boolean) =>
      setMarks((cur) => {
        const next = withDoneMarks(cur, rows, on, new Date().toISOString())
        save(next)
        return next
      }),
    []
  )
  const done = useMemo(() => new Set(Object.keys(marks)), [marks])
  return { done, toggle, setMany }
}

export interface PlayerList {
  /** Lower-cased names the player marked as players: never a Mobs row again; `own`, the player's own characters: never a row. */
  players: PlayerNames
  mark: (name: string) => void
}

/**
 * Names the player marked as players (owner, 2026-10-19: "allow them to mark it as a player and we
 * add it to the permanent player list"). Per viewer, kept until cleared; nothing drops a name.
 */
export function usePlayerList(): PlayerList {
  const [names, setNames] = useState<string[]>(() => {
    try {
      return loadPlayers(localStorage.getItem(PLAYERS_KEY))
    } catch {
      return []
    }
  })
  const mark = useCallback(
    (name: string) =>
      setNames((cur) => {
        const next = cur.includes(name.toLowerCase()) ? cur : [...cur, name.toLowerCase()]
        try {
          localStorage.setItem(PLAYERS_KEY, JSON.stringify(next))
        } catch {
          // A blocked store keeps the list for this session only.
        }
        return next
      }),
    []
  )
  const own = useOwnCharacterNames()
  const players = useMemo(() => playerNames(names, own), [names, own])
  return { players, mark }
}
