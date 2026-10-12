// gapVerdicts.ts — the Gaps tab's verdict store: what the runtime knowledge caches say about the
// names on screen, asked once per visible set and read by version (owner ask, 2026-10-12).
//
// The table renders every row as `unchecked` until an answer lands, so a keystroke never waits
// on the main process. A request is batched: names the store has not seen are queued per domain
// and sent in one IPC on the next tick; every name asked is remembered, `unchecked` included, so
// a name is asked at most once per session. Spells have no cache and are never asked.

import { useEffect, useMemo, useSyncExternalStore } from 'react'
import type { GapDomain, GapRow, GapVerdict, GapVerdicts } from '@shared/gaps'

type CachedDomain = 'item' | 'mob'

const verdicts = new Map<string, GapVerdict>()
const pending: Record<CachedDomain, Set<string>> = { item: new Set(), mob: new Set() }
const listeners = new Set<() => void>()
let version = 0
let scheduled = false

const keyOf = (domain: CachedDomain, name: string): string => `${domain}\u0000${name}`

function notify(): void {
  version += 1
  for (const l of listeners) l()
}

async function flush(): Promise<void> {
  scheduled = false
  for (const domain of ['item', 'mob'] as const) {
    const batch = [...pending[domain]]
    pending[domain].clear()
    if (batch.length === 0) continue
    let answered: GapVerdicts = {}
    try {
      answered = await window.eq.gapVerdicts(domain, batch)
    } catch {
      // Main could not answer: every name stays `unchecked`, remembered so it is not asked again.
    }
    for (const name of batch) verdicts.set(keyOf(domain, name), answered[name] ?? 'unchecked')
  }
  notify()
}

/** Queue the names this store has not answered yet; one IPC per domain on the next tick. */
export function requestGapVerdicts(domain: GapDomain, names: readonly string[]): void {
  if (domain === 'spell') return
  let queued = false
  for (const name of names) {
    if (verdicts.has(keyOf(domain, name)) || pending[domain].has(name)) continue
    pending[domain].add(name)
    queued = true
  }
  if (queued && !scheduled) {
    scheduled = true
    setTimeout(() => void flush(), 0)
  }
}

export function readGapVerdict(domain: GapDomain, name: string): GapVerdict {
  return domain === 'spell' ? 'unchecked' : (verdicts.get(keyOf(domain, name)) ?? 'unchecked')
}

const subscribe = (l: () => void): (() => void) => {
  listeners.add(l)
  return () => listeners.delete(l)
}

/** The verdicts for a row set, by name; asks for what is missing and re-reads when answers land. */
export function useGapVerdicts(domain: GapDomain, rows: readonly GapRow[]): GapVerdicts {
  const seen = useSyncExternalStore(subscribe, () => version)
  useEffect(() => {
    requestGapVerdicts(domain, rows.map((r) => r.name))
  }, [domain, rows])
  return useMemo(() => {
    const out: GapVerdicts = {}
    for (const r of rows) out[r.name] = readGapVerdict(domain, r.name)
    return out
    // `seen` is the store's version: a new one means answers landed and the map must be re-read.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [domain, rows, seen])
}
