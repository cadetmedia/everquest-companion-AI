// useNotablePickups (Task #53) — surface the last few looted items that are lore- or
// quest-relevant, for the "Notable pickups" strip + extending the row indicator beyond
// the local Plane of Sky set to any wiki-known quest item.
//
// Loot knowledge lives in MAIN (local-posky-first + cached wiki lookup). We can't know
// synchronously whether an arbitrary looted item is notable, so this hook lazily fetches
// knowledge for the most-recent distinct looted items (bounded), memoizes each result in
// a renderer-side map, and returns (a) that map for row indicators and (b) the ordered
// notable subset for the strip. Bounded + memoized so it never storms main: each distinct
// name is fetched at most once; main's serialized queue + persistent cache throttle the
// rest. Fully additive — no change to how loot is transported.

import { useEffect, useRef, useState } from 'react'
import type { ItemKnowledge, LootEvent } from '@shared/types'
import { isNotableKnowledge } from '@shared/itemKnowledge'
import { isDestroyed } from '@shared/lootDisposition'
import { itemCountKey } from '../../lib/itemName'

/** How many most-recent distinct looted items to probe for notability. */
const PROBE_LIMIT = 40

/**
 * How long answers wait to be committed together, in ms (perf audit, 2026-10-20).
 *
 * The probe asks main one name at a time, and it used to commit each answer the moment it
 * landed: a new Map, a `setByKey`, and a full re-render of whatever view holds the hook. Main
 * answers a cached name in a millisecond or two, so a visit to the Loot tab re-rendered the whole
 * ledger 41 times in its first ~300 ms (measured: 41 LootView renders, 1,330 row renders), and the
 * Overview, which runs the same probe, paid the same storm. The requests stay one at a time, as
 * the header promises main; only the COMMITS are coalesced, one per window, so a warm probe lands
 * in two or three renders. 50 ms is below anything a reader could see as a late badge.
 */
const COMMIT_WINDOW_MS = 50

export interface NotablePickup {
  /** display item name (most recent occurrence) */
  item: string
  /** most recent loot timestamp */
  ts: number
  knowledge: ItemKnowledge
}

export interface NotableState {
  /** knowledge keyed by itemCountKey — for per-row indicators (undefined = unknown yet) */
  byKey: Map<string, ItemKnowledge>
  /** the notable pickups (lore or quest-relevant), most-recent first */
  notable: NotablePickup[]
}

/**
 * Is a knowledge record "notable" (worth flagging / listing)?
 *
 * The rule itself moved to shared/itemKnowledge.ts (Task #59) because the main-side event-feed
 * module applies the SAME test to decide whether a live loot becomes an event-log row — one
 * definition means the strip and the feed can never disagree. Re-exported here so every
 * existing caller keeps its import.
 */
export const isNotable = isNotableKnowledge

/**
 * Probe the most-recent distinct looted items for lore/quest knowledge. `history` is the
 * full loot list (oldest→newest, as the loot module serves it). Returns a live-updating
 * map + the notable subset. Dismissed keys are filtered out of the strip.
 */
export function useNotablePickups(history: LootEvent[], dismissed: Set<string>): NotableState {
  const [byKey, setByKey] = useState<Map<string, ItemKnowledge>>(new Map())
  // Names we've already requested (dedupe across renders); persists for the component life.
  const requested = useRef<Set<string>>(new Set())

  // The most-recent distinct items (newest first), capped.
  const recent = useRef<{ item: string; ts: number; key: string }[]>([])
  {
    const seen = new Set<string>()
    const list: { item: string; ts: number; key: string }[] = []
    for (let i = history.length - 1; i >= 0 && list.length < PROBE_LIMIT; i--) {
      const e = history[i]
      // A DESTROY IS NOT A PICKUP (JOS-401, the census), and here that is a cost as well as a
      // meaning: the probe window is the 40 most recent DISTINCT items, so admitting a bag
      // cleanup would push real pickups out of it and spend main's lookup queue on items the
      // player just threw away. An item known to this app ONLY from a destroy line therefore has
      // no knowledge record, which is the right trade - nothing on any surface asks about it.
      if (isDestroyed(e)) continue
      const key = itemCountKey(e.item)
      if (seen.has(key)) continue
      seen.add(key)
      list.push({ item: e.item, ts: e.ts, key })
    }
    recent.current = list
  }

  useEffect(() => {
    let alive = true
    const toFetch = recent.current.filter((r) => !requested.current.has(r.key))
    if (toFetch.length === 0) return
    for (const r of toFetch) requested.current.add(r.key)
    // Answers wait in `pending` until the window closes (COMMIT_WINDOW_MS above). The cleanup
    // commits whatever is still waiting, so every answer that arrived is kept exactly as it was
    // when each one was committed on arrival; a commit after unmount is a no-op in React 18.
    let pending: [string, ItemKnowledge][] = []
    let timer: ReturnType<typeof setTimeout> | null = null
    const commit = (): void => {
      if (timer !== null) clearTimeout(timer)
      timer = null
      if (pending.length === 0) return
      const batch = pending
      pending = []
      setByKey((prev) => {
        const next = new Map(prev)
        for (const [key, k] of batch) next.set(key, k)
        return next
      })
    }
    void (async () => {
      for (const r of toFetch) {
        if (!alive) return
        try {
          const k = await window.eq.lookupItem(r.item)
          if (!alive) return
          pending.push([r.key, k])
          timer ??= setTimeout(commit, COMMIT_WINDOW_MS)
        } catch {
          /* main never rejects; ignore */
        }
      }
      commit()
    })()
    return () => {
      alive = false
      commit()
    }
    // Re-run when the set of recent keys changes (join of the capped recent keys).
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [recent.current.map((r) => r.key).join('|')])

  const notable: NotablePickup[] = []
  for (const r of recent.current) {
    if (dismissed.has(r.key)) continue
    const k = byKey.get(r.key)
    if (k && isNotable(k)) notable.push({ item: r.item, ts: r.ts, knowledge: k })
  }

  return { byKey, notable }
}
