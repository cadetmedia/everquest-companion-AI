// slayer/slayerRows.ts — the Slayer plan's view models and its stored choices. Pure: no React.
//
// A COUNTER ROW is one open counter with what the plan says about it: how many kills are left,
// whether a General achievement still requires it, and how many zones and spawn points the
// catalog knows for it. The Achievements tab draws the counters in its own list
// (features/achievements/); these rows are what it reads the reach and the picks from.
//
// THE STORED CHOICES (`eq.slayer.*` in localStorage) exist because a view unmounts on every tab
// switch: the picks, the level cap and the toggle are things the user set on purpose. Every
// read degrades rather than throws; a pick naming a counter the newest dump no longer lists
// (it was completed) is simply not drawn.

import {
  achievementKey,
  requiredByGoal,
  type SlayerCounter,
  type SlayerRecord
} from '@shared/outputs/slayer'
import { counterId, slayerTarget, type SlayerTarget, type ZoneOrder } from '@shared/slayer/slayerPlan'

export interface CounterRow {
  id: string
  counter: SlayerCounter
  target: SlayerTarget
  left: number
  /** 0 to 100 */
  pct: number
  required: boolean
  zones: number
  spawns: number
}

export type Reach = ReadonlyMap<string, { zones: number; spawns: number }>

export function counterRows(record: SlayerRecord, reach: Reach): CounterRow[] {
  const required = requiredByGoal(record.goals)
  return record.counters.map((counter) => {
    const id = counterId(counter)
    const at = reach.get(id)
    return {
      id,
      counter,
      target: slayerTarget(counter),
      left: Math.max(0, counter.need - counter.have),
      pct: counter.need > 0 ? Math.min(100, (100 * counter.have) / counter.need) : 0,
      required: required.get(achievementKey(counter.achievement)) ?? true,
      zones: at?.zones ?? 0,
      spawns: at?.spawns ?? 0
    }
  })
}

/** How few kills away a counter must be for the "Nearly done" pick to take it. */
export const NEARLY_DONE = 50

/** The counters a player could finish soonest that the catalog knows a place for. */
export function nearlyDone(rows: readonly CounterRow[]): string[] {
  return rows.filter((r) => r.left <= NEARLY_DONE && r.zones > 0).map((r) => r.id)
}

// ---- the stored choices ------------------------------------------------------------------------

export const PICKS_KEY = 'eq.slayer.picks'
export const MAX_LEVEL_KEY = 'eq.slayer.maxLevel'
export const OUT_OF_ERA_KEY = 'eq.slayer.outOfEra'
export const NO_FACTION_HITS_KEY = 'eq.slayer.noFactionHits'
export const ZONE_ORDER_KEY = 'eq.slayer.zoneOrder'

/** The slice of `Storage` this module uses, so a test can hand it a plain object. */
export interface PrefStore {
  getItem: (key: string) => string | null
  setItem: (key: string, value: string) => void
}

export function readPref(store: PrefStore, key: string): string | null {
  try {
    return store.getItem(key)
  } catch {
    return null
  }
}

/** Fired on this window after a stored choice is saved: `storage` events reach only OTHER windows,
 *  and the Map pins overlay's always-mounted feed must see a pick made on the tab at once. */
export const SLAYER_PREFS_EVENT = 'eq-slayer-prefs'

export function savePref(key: string, value: string, store: PrefStore = localStorage): void {
  try {
    store.setItem(key, value)
  } catch {
    // A full or forbidden store costs the choice its persistence, never the tab.
  }
  if (typeof window !== 'undefined') window.dispatchEvent(new Event(SLAYER_PREFS_EVENT))
}

export function loadPicks(store: PrefStore = localStorage): string[] {
  try {
    const parsed: unknown = JSON.parse(readPref(store, PICKS_KEY) ?? '[]')
    return Array.isArray(parsed) ? parsed.filter((p): p is string => typeof p === 'string') : []
  } catch {
    return []
  }
}

/**
 * The level cap: a number, `null` for no cap, or `undefined` when the user has never set one
 * (the tab then follows the character's own level).
 */
export function loadMaxLevel(store: PrefStore = localStorage): number | null | undefined {
  const raw = readPref(store, MAX_LEVEL_KEY)
  if (raw === null) return undefined
  if (raw === '') return null
  const n = Number(raw)
  return Number.isInteger(n) && n > 0 && n < 200 ? n : undefined
}

export function loadZoneOrder(store: PrefStore = localStorage): ZoneOrder {
  const raw = readPref(store, ZONE_ORDER_KEY)
  return raw === 'spawns' || raw === 'level' ? raw : 'matches'
}

/** The cap the plan applies: the stored one, or the character's own level until one is set. */
export function levelCap(
  stored: number | null | undefined,
  own: number | undefined
): number | null {
  return stored === undefined ? (own ?? null) : stored
}

export function loadFlag(key: string, store: PrefStore = localStorage): boolean {
  return readPref(store, key) === '1'
}
