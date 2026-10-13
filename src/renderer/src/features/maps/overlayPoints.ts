// The Map pins overlay's points that need the mob catalog: watched mobs, the zone's named mobs,
// the timer pins. Pure over a catalog HANDED in: the overlay gets a slim copy from main
// (`maps:mobPlaces`) and never imports the 3 MB catalog, which the bundler would otherwise put in
// a chunk every overlay window loads.

import type { MobEntry } from '@shared/types'
import type { RespawnRow, RespawnWatchPref } from '@shared/respawn'
import { ZONES } from '../../../../shared/zones'
import { mobRows } from './mobPins'
import { placeableTimerPins, timerPinRows, timerZone, type TimerPin } from './respawnPins'
import type { TrackedPoint } from './mapTrack'
import { watchedPoints } from './watchTrack'

/** A point of interest the overlay draws: a named mob's spawn point, in map coordinates. */
export interface CatalogPin {
  key: string
  name: string
  x: number
  y: number
}

/** This zone's named mobs with a stated position, the same rows the Maps tab pins. */
export function zoneMobPins(stem: string | null, catalog: MobEntry[]): CatalogPin[] {
  if (stem == null) return []
  const name = ZONES.find((z) => z.short === stem)?.name
  if (name === undefined) return []
  return mobRows(name, catalog).flatMap((r) => r.pins.map((p, i) => ({ key: `${r.id}#${String(i)}`, name: r.name, x: p.x, y: p.y })))
}

/** The respawn clocks the catalog can place in this zone, as the red timer pins. */
export function zoneTimerPins(stem: string | null, rows: readonly RespawnRow[], catalog: MobEntry[]): TimerPin[] {
  return placeableTimerPins(timerPinRows(rows, timerZone(stem, catalog)))
}

/** The Timers tab's watched mobs in this zone, as tracked points. */
export function zoneWatched(stem: string | null, watches: readonly RespawnWatchPref[], catalog: MobEntry[]): TrackedPoint[] {
  return watchedPoints(stem, watches, catalog)
}
