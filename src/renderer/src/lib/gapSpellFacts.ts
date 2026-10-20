// gapSpellFacts.ts — a copied spell page's fill: what the install's spell files state about each
// unknown spell (main's src/main/gapSpellFacts.ts, files read at rest). Asked once per spell name per
// session; the answers merge into one map, as the item-page store does (lib/gapItemMobs.ts).

import { useEffect, useSyncExternalStore } from 'react'
import type { ClientSpellFacts } from '@shared/gaps'

const asked = new Set<string>()
let answered: Readonly<Record<string, ClientSpellFacts>> = {}
const listeners = new Set<() => void>()

async function ask(names: readonly string[]): Promise<void> {
  try {
    const page = await window.eq.gapSpellFacts(names)
    answered = { ...answered, ...page }
  } catch {
    // Main could not read the files: the pages copy without the client's fields.
  }
  for (const l of listeners) l()
}

const subscribe = (l: () => void): (() => void) => {
  listeners.add(l)
  return () => listeners.delete(l)
}

/** The client facts for these spell names; `{}` until main answers. */
export function useSpellFacts(names: readonly string[]): Readonly<Record<string, ClientSpellFacts>> {
  useEffect(() => {
    const fresh = names.filter((n) => !asked.has(n))
    for (const n of fresh) asked.add(n)
    if (fresh.length > 0) void ask(fresh)
  }, [names])
  return useSyncExternalStore(subscribe, () => answered)
}
