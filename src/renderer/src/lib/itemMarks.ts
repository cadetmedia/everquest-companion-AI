// itemMarks — the list-row marks (icon id, lore/quest/recipe counts, no-trade) by item name,
// fetched in ONE call per paint rather than one record per row: every row that mounts in the same
// tick adds its name to a batch, the batch goes to main as a single `itemMarks` ask, and the rows
// re-render once when it lands. A name is asked once per app run; "the DB does not know it" is
// remembered too. Reads the committed DB and the local quest sources only, never the wiki.

import { useEffect, useSyncExternalStore } from 'react'
import type { ItemMarks } from '@shared/itemKnowledge'

/** name → its marks, or null once asked and found unknown. */
const marks = new Map<string, ItemMarks | null>()
let pending = new Set<string>()
let flush: ReturnType<typeof setTimeout> | null = null
let version = 0
const listeners = new Set<() => void>()

function readMarks(name: string): ItemMarks | undefined {
  return marks.get(name) ?? undefined
}
/** The read as a SNAPSHOT: a new identity each time a batch lands and the same one between, so a
 *  memo keyed on it rebuilds exactly when the marks change (the Overview's rows). */
let reader: (name: string) => ItemMarks | undefined = readMarks

function subscribe(l: () => void): () => void {
  listeners.add(l)
  return () => {
    listeners.delete(l)
  }
}

function settle(names: readonly string[], got: Record<string, ItemMarks>): void {
  for (const n of names) marks.set(n, got[n] ?? null)
  version++
  reader = (name) => readMarks(name)
  for (const l of listeners) l()
}

function schedule(): void {
  flush ??= setTimeout(() => {
    flush = null
    const names = [...pending]
    pending = new Set()
    window.eq.itemMarks(names).then(
      (got) => settle(names, got),
      () => settle(names, {})
    )
  }, 30)
}

/** Ask for names outside a component (a probe over a list): resolves when their batch has landed. */
export function fetchItemMarks(names: readonly string[]): Promise<Record<string, ItemMarks>> {
  const missing = names.filter((n) => !marks.has(n))
  if (missing.length === 0) return Promise.resolve(collect(names))
  for (const n of missing) marks.set(n, null)
  return window.eq.itemMarks(missing).then(
    (got) => {
      settle(missing, got)
      return collect(names)
    },
    () => {
      settle(missing, {})
      return collect(names)
    }
  )
}

function collect(names: readonly string[]): Record<string, ItemMarks> {
  const out: Record<string, ItemMarks> = {}
  for (const n of names) {
    const m = marks.get(n)
    if (m) out[n] = m
  }
  return out
}

/** The store as a hook can read it: subscribe + version for `useSyncExternalStore`, and a
 *  synchronous read, for a surface that asks for a whole list at once (the Bazaar's facts). */
export const subscribeItemMarks = subscribe
export const itemMarksVersion = (): number => version
export const itemMarksOf = readMarks

/** The synchronous read, re-issued when a batch lands: a memo over many names keys on it. */
export function useItemMarksReader(): (name: string) => ItemMarks | undefined {
  return useSyncExternalStore(subscribe, () => reader)
}

/** The marks for an item name: undefined until its batch answers, or when the DB does not know it. */
export function useItemMarks(name: string): ItemMarks | undefined {
  useSyncExternalStore(subscribe, () => version)
  useEffect(() => {
    if (marks.has(name)) return
    marks.set(name, null)
    pending.add(name)
    schedule()
  }, [name])
  return marks.get(name) ?? undefined
}
