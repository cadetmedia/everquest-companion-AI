// watchTrack.ts — mobs watched on the Timers tab are tracked on the map automatically (owner,
// 2026-10-13: "any mob that is in the timers tab should automatically be part of the map tracking").
//
// A watch is a mob NAME (`RespawnWatchPref.key`, the `mobKey` fold); where it spawns comes from
// the wiki catalog, joined exactly the way the red timer pins join it (respawnPins.ts
// `timerZone`), so a watched mob is tracked precisely where its timer pin is drawn. These points
// are DERIVED, never stored: unwatching on the Timers tab takes them off the map.

import type { MobEntry } from '@shared/types'
import type { RespawnWatchPref } from '@shared/respawn'
import { mobKey } from '../../../../shared/mobKey'
import type { TrackedPoint } from './mapTrack'
import { mobPins } from './mobPins'
import { timerZone } from './respawnPins'

/** The watched mobs the catalog places in this zone, as tracked points flagged `auto`. */
export function watchedPoints(stem: string | null, watches: readonly RespawnWatchPref[], catalog: MobEntry[]): TrackedPoint[] {
  if (stem == null || watches.length === 0) return []
  const zone = timerZone(stem, catalog)
  if (zone == null) return []
  const out: TrackedPoint[] = []
  const seen = new Set<string>()
  for (const w of watches) {
    const entry = zone.byKey.get(w.key) ?? zone.byKey.get(mobKey(w.display))
    // A page naming several zones cannot place its numbers on this map (mobPins.ts).
    if (entry === undefined || (entry.zones?.length ?? 0) > 1 || seen.has(entry.page)) continue
    const pins = mobPins(entry).map((p) => ({ x: p.x, y: p.y }))
    if (pins.length === 0) continue
    seen.add(entry.page)
    out.push({ zone: stem, id: entry.page, kind: 'mob', name: entry.name, pins, auto: true })
  }
  return out
}

/** The stored list for a zone plus the watched mobs it does not already hold. */
export function withWatched(manual: readonly TrackedPoint[], watched: readonly TrackedPoint[]): TrackedPoint[] {
  if (watched.length === 0) return [...manual]
  const have = new Set(manual.map((p) => p.id))
  return [...manual, ...watched.filter((p) => !have.has(p.id))]
}

/** The snapshot's watches plus those written but not yet echoed back by main, so a second quick
 *  Timer click builds on the first instead of on the stale snapshot (review, 2026-10-13). */
export function withPendingWatches(watches: readonly RespawnWatchPref[], pending: ReadonlyMap<string, string>): RespawnWatchPref[] {
  const have = new Set(watches.map((w) => w.key))
  const added = [...pending].filter(([key]) => !have.has(key)).map(([key, display]) => ({ key, display }))
  return [...watches, ...added]
}
