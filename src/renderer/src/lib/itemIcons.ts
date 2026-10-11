// itemIcons — icon ids by item name for list rows, fetched in ONE call per paint rather than one
// per row: every row that mounts in the same tick adds its name to a batch, the batch goes to
// main as a single `itemIcons` ask, and the rows re-render once when it lands. A name is asked
// once per app run; an answer of "no icon" is remembered too. Reads the committed item DB only.

import { useEffect, useSyncExternalStore } from 'react'

/** name → icon id, or null once asked and found to have none. */
const ids = new Map<string, number | null>()
let pending = new Set<string>()
let flush: ReturnType<typeof setTimeout> | null = null
let version = 0
const listeners = new Set<() => void>()

function subscribe(l: () => void): () => void {
  listeners.add(l)
  return () => {
    listeners.delete(l)
  }
}

function settle(names: readonly string[], got: Record<string, number>): void {
  for (const n of names) ids.set(n, got[n] ?? null)
  version++
  for (const l of listeners) l()
}

function schedule(): void {
  flush ??= setTimeout(() => {
    flush = null
    const names = [...pending]
    pending = new Set()
    window.eq.itemIcons(names).then(
      (got) => settle(names, got),
      () => settle(names, {})
    )
  }, 30)
}

/** The icon id for an item name, undefined until the batch answers or when the page names none. */
export function useItemIconId(name: string): number | undefined {
  useSyncExternalStore(subscribe, () => version)
  useEffect(() => {
    if (ids.has(name)) return
    ids.set(name, null)
    pending.add(name)
    schedule()
  }, [name])
  return ids.get(name) ?? undefined
}
