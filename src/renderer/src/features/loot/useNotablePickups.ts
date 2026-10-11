// useNotablePickups — the "notable pickups" strip's probe over the most recent loot (Task #53).
//
// The renderer cannot say synchronously whether an arbitrary looted item is notable, so this
// hook probes the 40 most recent distinct pickups. Since 2026-10-10 it asks for their MARKS in
// one batched call (`lib/itemMarks.ts`: the committed DB and the local quest sources, no wiki)
// and fetches a full knowledge record only for the ones the marks call notable, all at once.
// Before that it fetched a full record for each of the 40, one after another, through
// `lookupItem`'s cache-then-wiki fallback: slow to fill, and a wiki request for every pickup the
// DB did not know. An item the DB does not know is simply not notable here.
//
// Bounded + memoized so it never storms main: each distinct item key is asked once per mount.

import { useEffect, useRef, useState } from 'react'
import type { ItemKnowledge, LootEvent } from '@shared/types'
import { isNotableKnowledge, isNotableMarks } from '@shared/itemKnowledge'
import { isDestroyed } from '@shared/lootDisposition'
import { itemCountKey } from '../../lib/itemName'
import { fetchItemMarks } from '../../lib/itemMarks'

const PROBE_LIMIT = 40

export interface NotablePickup {
  item: string
  ts: number
  knowledge: ItemKnowledge
}

export interface NotableState {
  /** full knowledge for the NOTABLE recent pickups (the strip, and the rows' card pre-fill) */
  byKey: Map<string, ItemKnowledge>
  /** the notable pickups (lore or quest-relevant), most-recent first */
  notable: NotablePickup[]
}

/** Is a knowledge record "notable" (worth flagging / listing)? Shared with the event feed. */
export const isNotable = isNotableKnowledge

interface Recent {
  item: string
  ts: number
  key: string
}

function recentDistinct(history: LootEvent[]): Recent[] {
  const seen = new Set<string>()
  const list: Recent[] = []
  for (let i = history.length - 1; i >= 0 && list.length < PROBE_LIMIT; i--) {
    const e = history[i]
    if (isDestroyed(e)) continue
    const key = itemCountKey(e.item)
    if (seen.has(key)) continue
    seen.add(key)
    list.push({ item: e.item, ts: e.ts, key })
  }
  return list
}

/** One batch of marks, then one round of full records for the notable ones. */
async function probe(toFetch: Recent[]): Promise<Map<string, ItemKnowledge>> {
  const marks = await fetchItemMarks(toFetch.map((r) => r.item))
  const notable = toFetch.filter((r) => {
    const m = marks[r.item]
    return m !== undefined && isNotableMarks(m)
  })
  const records = await Promise.all(notable.map((r) => window.eq.lookupItem(r.item).catch(() => null)))
  const out = new Map<string, ItemKnowledge>()
  notable.forEach((r, i) => {
    const k = records[i]
    if (k) out.set(r.key, k)
  })
  return out
}

export function useNotablePickups(history: LootEvent[], dismissed: Set<string>): NotableState {
  const [byKey, setByKey] = useState<Map<string, ItemKnowledge>>(new Map())
  const requested = useRef<Set<string>>(new Set())
  const recent = useRef<Recent[]>([])
  recent.current = recentDistinct(history)
  const recentKeys = recent.current.map((r) => r.key).join('|')

  useEffect(() => {
    let alive = true
    const asked = requested.current
    const toFetch = recent.current.filter((r) => !asked.has(r.key))
    if (toFetch.length === 0) return
    for (const r of toFetch) asked.add(r.key)
    void probe(toFetch).then((got) => {
      if (!alive) {
        for (const r of toFetch) asked.delete(r.key)
        return
      }
      if (got.size === 0) return
      setByKey((prev) => new Map([...prev, ...got]))
    })
    return () => {
      alive = false
    }
  }, [recentKeys])

  const notable: NotablePickup[] = []
  for (const r of recent.current) {
    if (dismissed.has(r.key)) continue
    const k = byKey.get(r.key)
    if (k && isNotable(k)) notable.push({ item: r.item, ts: r.ts, knowledge: k })
  }
  return { byKey, notable }
}
