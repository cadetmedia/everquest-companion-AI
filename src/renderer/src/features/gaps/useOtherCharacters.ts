// useOtherCharacters — the Gaps tab's All characters (owner, 2026-10-19): every other character's
// saved Gaps inputs, asked of main (main/gapsCharacters.ts) only while the box is ticked. Asked again
// when the attached character or the day window moves, and every few minutes, since the attached
// character's own saves land while the tab is open.

import { useEffect, useMemo, useState } from 'react'
import { DEFAULT_GAP_DAYS, MAX_GAP_DAYS, cutoffOf, type CharacterGaps } from '@shared/gapsAllCharacters'
import type { CharacterRef } from '@shared/types'
import { useBoolPref, useRawPref } from '../combat/useCombatPrefs'
import type { AllCharacters } from './useGapsData'

const REFRESH_MS = 5 * 60 * 1000
/** Where the day window is remembered, per viewer. */
const DAYS_KEY = 'eq.gaps.days'
/** Where All characters is remembered (owner, 2026-10-19: off by default). */
const ALL_CHARACTERS_KEY = 'eq.gaps.allCharacters'

/** The day window (owner: default 60, the player may change it), clamped to 1..MAX_GAP_DAYS. */
export function useGapDays(): [number, (days: number) => void] {
  const [raw, setRaw] = useRawPref(DAYS_KEY)
  const n = raw === null ? NaN : Number(raw)
  const days = Number.isInteger(n) && n >= 1 && n <= MAX_GAP_DAYS ? n : DEFAULT_GAP_DAYS
  return [days, (d: number) => setRaw(String(Math.min(MAX_GAP_DAYS, Math.max(1, Math.round(d)))))]
}

/** The window's cut-off from the start of today, so it holds still all day instead of every second. */
export function useGapCutoff(days: number): { stamp: string; ms: number } {
  const today = new Date().toDateString()
  return useMemo(() => cutoffOf(days, new Date(today)), [days, today])
}

/** The other characters' inputs while `on`; undefined until the first answer lands, or while off. */
export function useOtherCharacters(on: boolean, sinceStamp: string, attached: string | null): CharacterGaps[] | undefined {
  const [got, setGot] = useState<{ key: string; value: CharacterGaps[] } | null>(null)
  const key = `${sinceStamp}|${attached ?? ''}`
  useEffect(() => {
    if (!on) return
    let live = true
    const ask = (): void => {
      window.eq
        .gapsAllCharacters(sinceStamp)
        .then((value) => {
          if (live) setGot({ key, value })
        })
        .catch(() => {
          if (live) setGot({ key, value: [] })
        })
    }
    ask()
    const timer = setInterval(ask, REFRESH_MS)
    return () => {
      live = false
      clearInterval(timer)
    }
  }, [on, key, sinceStamp])
  return on && got?.key === key ? got.value : undefined
}

export interface AllCharactersState {
  on: boolean
  setOn: (on: boolean) => void
  days: number
  setDays: (days: number) => void
  /** The other characters' inputs; undefined while off or until main answers. */
  others: readonly CharacterGaps[] | undefined
  liveLabel: string
  /** What useGapsData joins; null while off or loading, so the tab shows the one character meanwhile. */
  all: AllCharacters | null
  /** The shown-count line's tail: ", every character, last 60 days" while ticked. */
  caption: string
}

/** The box, the day window, and the other characters' inputs, for the tab and useGapsData. */
export function useAllCharacters(me: CharacterRef | null): AllCharactersState {
  const [on, setOn] = useBoolPref(ALL_CHARACTERS_KEY, false)
  const [days, setDays] = useGapDays()
  const cut = useGapCutoff(days)
  const others = useOtherCharacters(on, cut.stamp, me === null ? null : `${me.name}_${me.server}`.toLowerCase())
  const liveLabel = me?.name ?? 'This character'
  const all = useMemo(() => (others === undefined ? null : { others, liveLabel, cut }), [others, liveLabel, cut])
  return { on, setOn, days, setDays, others, liveLabel, all, caption: on ? `, every character, last ${days} days` : '' }
}
