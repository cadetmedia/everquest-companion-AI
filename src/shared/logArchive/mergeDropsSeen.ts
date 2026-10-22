// shared/logArchive/mergeDropsSeen.ts — one mob's "seen it drop" list across archived logs and the
// live answer (step 4.1).
//
// The engine's own-loot index is published in no module snapshot; it reaches the app only as
// `dropsSeen` on `knowledge.mob`. A segment does keep the `loot` module's rows, and the index is
// folded from exactly those rows (`consider.rs`: every loot but a destroy, with a source and a
// non-empty item, adding its count or 1). So the archived part is rebuilt from archived loot rows
// under every spelling the mob answers to, and joined to the served list the way `drops_across`
// joins two spellings: counts add, last seen takes the later, the first spelling recorded is kept.

import { mobKey } from '../mobKey'
import type { MobSeenDrop } from '../types'

interface LootLike {
  item?: unknown
  source?: unknown
  count?: unknown
  ts?: unknown
  disposition?: unknown
}

/** The engine's order: most looted first, then the most recent, then by name so ties are stable. */
function byEngineOrder(a: MobSeenDrop, b: MobSeenDrop): number {
  if (a.count !== b.count) return b.count - a.count
  if (a.lastTs !== b.lastTs) return b.lastTs - a.lastTs
  return a.item < b.item ? -1 : a.item > b.item ? 1 : 0
}

function add(into: Map<string, MobSeenDrop>, item: string, count: number, lastTs: number): void {
  const key = item.trim().toLowerCase()
  const prev = into.get(key)
  if (prev === undefined) {
    into.set(key, { item: item.trim(), count, lastTs })
    return
  }
  prev.count += count
  if (lastTs > prev.lastTs) prev.lastTs = lastTs
}

/** What `rows` (loot rows, oldest first) say was looted off any of `spellings`. */
export function dropsFromLoot(rows: readonly unknown[], spellings: readonly string[]): MobSeenDrop[] {
  const keys = new Set(spellings.map(mobKey))
  const out = new Map<string, MobSeenDrop>()
  for (const raw of rows) {
    if (raw === null || typeof raw !== 'object') continue
    const r = raw as LootLike
    if (typeof r.item !== 'string' || r.item.trim() === '' || typeof r.source !== 'string') continue
    if (r.disposition === 'destroyed' || typeof r.ts !== 'number' || !keys.has(mobKey(r.source))) continue
    add(out, r.item, typeof r.count === 'number' ? r.count : 1, r.ts)
  }
  return [...out.values()].sort(byEngineOrder)
}

/** `older` then `newer`, one row per item. Neither input is changed. */
export function mergeDropsSeen(older: readonly MobSeenDrop[], newer: readonly MobSeenDrop[]): MobSeenDrop[] {
  const out = new Map<string, MobSeenDrop>()
  for (const d of [...older, ...newer]) add(out, d.item, d.count, d.lastTs)
  return [...out.values()].sort(byEngineOrder)
}

/**
 * The served box with archived loot joined in. `archivedLoot` is each archived `loot` state, oldest
 * first. With nothing archived for this mob the box comes back as the same object.
 */
export function withArchivedDrops(
  box: { seen?: MobSeenDrop[] },
  archivedLoot: readonly unknown[],
  spellings: readonly string[]
): { seen?: MobSeenDrop[] } {
  const rows = archivedLoot.flatMap((state) => (Array.isArray(state) ? (state as unknown[]) : []))
  const old = dropsFromLoot(rows, spellings)
  if (old.length === 0) return box
  return { seen: mergeDropsSeen(old, box.seen ?? []) }
}
