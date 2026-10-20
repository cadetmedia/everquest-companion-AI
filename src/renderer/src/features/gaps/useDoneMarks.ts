// useDoneMarks — the rows the player has marked done (owner ask, 2026-10-19): a page made or an image
// uploaded leaves its row on the tab until the next data refresh, so a Done mark hides it here first.
// Per viewer, in localStorage; a mark is dropped once its row is gone from the snapshot (the data
// caught up). "Show done" brings them back, for a wrong click.

import { useCallback, useEffect, useMemo, useState } from 'react'
import { doneKey, type GapRow } from '@shared/gaps'

const DONE_KEY = 'eq.gaps.done'

function load(): Record<string, string> {
  try {
    const raw = localStorage.getItem(DONE_KEY)
    const parsed: unknown = raw === null ? {} : JSON.parse(raw)
    return parsed !== null && typeof parsed === 'object' ? (parsed as Record<string, string>) : {}
  } catch {
    return {}
  }
}

function save(done: Record<string, string>): void {
  try {
    localStorage.setItem(DONE_KEY, JSON.stringify(done))
  } catch {
    // A blocked store keeps the marks for this session only.
  }
}

export interface DoneMarks {
  done: ReadonlySet<string>
  toggle: (row: GapRow) => void
}

/** `rows`: every row the tab holds, so marks for rows the data has since learned are dropped. */
export function useDoneMarks(rows: readonly GapRow[] | undefined, today: string): DoneMarks {
  const [marks, setMarks] = useState<Record<string, string>>(load)
  useEffect(() => {
    if (rows === undefined || rows.length === 0) return
    const live = new Set(rows.map(doneKey))
    setMarks((cur) => {
      const kept = Object.fromEntries(Object.entries(cur).filter(([k]) => live.has(k)))
      if (Object.keys(kept).length === Object.keys(cur).length) return cur
      save(kept)
      return kept
    })
  }, [rows])
  const toggle = useCallback(
    (row: GapRow) =>
      setMarks((cur) => {
        const key = doneKey(row)
        const next = key in cur ? Object.fromEntries(Object.entries(cur).filter(([k]) => k !== key)) : { ...cur, [key]: today }
        save(next)
        return next
      }),
    [today]
  )
  const done = useMemo(() => new Set(Object.keys(marks)), [marks])
  return { done, toggle }
}

const PLAYERS_KEY = 'eq.gaps.players'

export interface PlayerList {
  /** Lower-cased names the player marked as players: never a Mobs row again. */
  players: ReadonlySet<string>
  mark: (name: string) => void
}

/**
 * Names the player marked as players (owner, 2026-10-19: "allow them to mark it as a player and we
 * add it to the permanent player list"). Per viewer, kept until cleared; nothing drops a name.
 */
export function usePlayerList(): PlayerList {
  const [names, setNames] = useState<string[]>(() => {
    try {
      const parsed: unknown = JSON.parse(localStorage.getItem(PLAYERS_KEY) ?? '[]')
      return Array.isArray(parsed) ? parsed.filter((n): n is string => typeof n === 'string') : []
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
  const players = useMemo(() => new Set(names), [names])
  return { players, mark }
}
