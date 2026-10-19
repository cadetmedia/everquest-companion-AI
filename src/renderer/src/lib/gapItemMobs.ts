// gapItemMobs.ts — the Drops domain's other side: the mobs each looted item's own wiki page names
// (main's corpus, src/main/gapItemMobs.ts). Asked once per item per session, 1,000 names a call;
// the answer lands as one map, so the server-wide rule never runs on half of it.

import { useEffect, useSyncExternalStore } from 'react'
import type { ItemMobs } from '@shared/gapDrops'
import { itemBaseName } from '@shared/itemStats'

const BATCH = 1000

const key = (name: string): string => itemBaseName(name).toLowerCase()
const asked = new Set<string>()
let answered: ItemMobs | undefined
const listeners = new Set<() => void>()

async function ask(names: readonly string[]): Promise<void> {
  const next = new Map<string, readonly string[] | null>()
  for (let i = 0; i < names.length; i += BATCH) {
    try {
      const page = await window.eq.gapItemMobs(names.slice(i, i + BATCH))
      for (const [name, mobs] of Object.entries(page)) next.set(key(name), mobs)
    } catch {
      // Main could not answer: those items read as unknown, and are not asked again this session.
    }
  }
  // Merged, not replaced: two asks in flight each add their own names.
  answered = new Map([...(answered ?? []), ...next])
  for (const l of listeners) l()
}

const subscribe = (l: () => void): (() => void) => {
  listeners.add(l)
  return () => listeners.delete(l)
}

/** The item-page mobs for these names; undefined until main's first answer lands. */
export function useItemMobs(names: readonly string[]): ItemMobs | undefined {
  useEffect(() => {
    const fresh = names.filter((n) => !asked.has(key(n)))
    for (const n of fresh) asked.add(key(n))
    if (fresh.length > 0) void ask(fresh)
  }, [names])
  return useSyncExternalStore(subscribe, () => answered)
}
