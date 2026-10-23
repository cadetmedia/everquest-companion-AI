// gapItemTrades.ts — a new merchant page's description reads the trade its items are used in (main's
// src/main/gapItemTrades.ts, the corpus is main-only). Asked once per item name per session; the
// answers merge into one map under the lower-cased name, as the spell-facts store does
// (lib/gapSpellFacts.ts).

import { useEffect, useSyncExternalStore } from 'react'

const asked = new Set<string>()
let answered: Readonly<Record<string, readonly string[]>> | undefined
const listeners = new Set<() => void>()

async function ask(names: readonly string[]): Promise<void> {
  const next: Record<string, readonly string[]> = {}
  try {
    for (const [name, trades] of Object.entries(await window.eq.gapItemTrades(names))) next[name.toLowerCase()] = trades
  } catch {
    // Main could not answer: the pages copy without a trade from the items.
  }
  answered = { ...answered, ...next }
  for (const l of listeners) l()
}

const subscribe = (l: () => void): (() => void) => {
  listeners.add(l)
  return () => listeners.delete(l)
}

/** The tradeskills of these items, by lower-cased name; undefined until main's first answer lands. */
export function useItemTrades(names: readonly string[]): Readonly<Record<string, readonly string[]>> | undefined {
  useEffect(() => {
    const fresh = names.filter((n) => !asked.has(n.toLowerCase()))
    for (const n of fresh) asked.add(n.toLowerCase())
    if (fresh.length > 0) void ask(fresh)
  }, [names])
  return useSyncExternalStore(subscribe, () => answered)
}
