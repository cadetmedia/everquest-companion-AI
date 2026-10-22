// gapItemForage.ts — the forage rows' other side: what each foraged item's own wiki page states of
// foraging (main's corpus, src/main/gapItemForage.ts). Asked once per item per session, as the
// item-page mobs are (lib/gapItemMobs.ts); the answers merge into one map.

import { useEffect, useSyncExternalStore } from 'react'
import { forageKey, type ItemForage, type ItemPageForage } from '@shared/gapForage'

const BATCH = 1000

const asked = new Set<string>()
let answered: ItemForage | undefined
const listeners = new Set<() => void>()

async function ask(names: readonly string[]): Promise<void> {
  const next = new Map<string, ItemPageForage | null>()
  for (let i = 0; i < names.length; i += BATCH) {
    try {
      const page = await window.eq.gapItemForage(names.slice(i, i + BATCH))
      for (const [name, forage] of Object.entries(page)) next.set(forageKey(name), forage)
    } catch {
      // Main could not answer: those items get no row, and are not asked again this session.
    }
  }
  answered = new Map([...(answered ?? []), ...next])
  for (const l of listeners) l()
}

const subscribe = (l: () => void): (() => void) => {
  listeners.add(l)
  return () => listeners.delete(l)
}

/** The page forage statements for these names; undefined until main's first answer lands. */
export function useItemForage(names: readonly string[]): ItemForage | undefined {
  useEffect(() => {
    const fresh = names.filter((n) => !asked.has(forageKey(n)))
    for (const n of fresh) asked.add(forageKey(n))
    if (fresh.length > 0) void ask(fresh)
  }, [names])
  return useSyncExternalStore(subscribe, () => answered)
}
