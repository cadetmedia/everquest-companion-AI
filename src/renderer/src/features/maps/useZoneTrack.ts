// useZoneTrack.ts — the Maps tab's track list for the map on screen: the stored entries plus the
// Timers tab's watched mobs. Its own file because it reads the mob catalog, and useMapTrack.ts is
// also imported by the Map pins overlay, which must never pull the 3 MB catalog into its bundle.

import { useCallback, useEffect, useMemo, useRef } from 'react'
import type { MapData } from '@shared/maps'
import type { MapPaneRow } from './mobPins'
import { MOB_CATALOG } from '../mobs/mobSearch'
import { useRespawnSnap, useSetRespawnPrefs, useUnwatch } from '../timers/useRespawn'
import { mobKey } from '../../../../shared/mobKey'
import { watchedPoints, withPendingWatches, withWatched } from './watchTrack'
import { isTracked, toggleTracked, trackedIn, withExtent, type TrackedPoint } from './mapTrack'
import { useMapTrack } from './useMapTrack'

/** A pane row as a track entry: its name and every position it has, in map coordinates. */
export function pointFromRow(zone: string, row: MapPaneRow): TrackedPoint {
  if (row.kind === 'label')
    return { zone, id: row.id, kind: 'label', name: row.name, pins: [{ x: row.point.x, y: row.point.y, z: row.point.z }] }
  return { zone, id: row.id, kind: 'mob', name: row.name, pins: row.pins.map((p) => ({ x: p.x, y: p.y })) }
}

export interface ZoneTrack {
  /** The tracked entries of the zone on screen, in the order tracked. */
  points: TrackedPoint[]
  ids: ReadonlySet<string>
  /** Ids tracked only because the Timers tab watches them. */
  autoIds: ReadonlySet<string>
  toggle: (row: MapPaneRow) => void
  untrack: (id: string) => void
  /** Is this mob on the Timers tab? Keyed by name, the way a watch is (`mobKey`). */
  isTimed: (name: string) => boolean
  /** Not on Timers: add it, and track it if it is not tracked yet. On Timers: remove the timer
   *  only, the tracking stays (owner, 2026-10-13). */
  toggleTimer: (row: MapPaneRow) => void
  /** Take a mob off the Timers tab (the Tracked list's alarm). */
  unwatch: (name: string) => void
}

/** The Timers tab's watch list, read and written from the Maps tab. */
function useMapTimers(zone: string | null, update: ReturnType<typeof useMapTrack>['update']) {
  const prefs = useRespawnSnap().prefs
  const setPrefs = useSetRespawnPrefs()
  const unwatchKey = useUnwatch()
  const keys = useMemo(() => new Set(prefs.watches.map((w) => w.key)), [prefs.watches])
  const isTimed = useCallback((name: string) => keys.has(mobKey(name)), [keys])
  const unwatch = useCallback((name: string) => {
    unwatchKey(mobKey(name))
  }, [unwatchKey])
  // Watches written but not yet echoed back: the snapshot lags a click by an IPC round trip.
  const pending = useRef(new Map<string, string>())
  const toggleTimer = useCallback(
    (row: MapPaneRow) => {
      if (row.kind !== 'mob' || zone == null) return
      const key = mobKey(row.name)
      for (const k of keys) pending.current.delete(k)
      if (keys.has(key) || pending.current.has(key)) {
        pending.current.delete(key)
        unwatchKey(key)
        return
      }
      pending.current.set(key, row.name)
      setPrefs({ ...prefs, watches: withPendingWatches(prefs.watches, pending.current) })
      update((s) => (isTracked(s, zone, row.id) ? s : toggleTracked(s, pointFromRow(zone, row))))
    },
    [zone, keys, prefs, setPrefs, unwatchKey, update]
  )
  return { watches: prefs.watches, isTimed, toggleTimer, unwatch }
}

/**
 * The track list for the map on screen. Writes the map's extent whenever a zone is drawn, which
 * is what places the overlay's corners (mapTrack.ts).
 */
export function useZoneTrack(data: MapData | null): ZoneTrack {
  const { state, update } = useMapTrack()
  const zone = data?.zone ?? null
  const bounds = data?.bounds
  useEffect(() => {
    if (zone != null && bounds != null) update((s) => withExtent(s, zone, bounds))
  }, [zone, bounds, update])
  const { watches, isTimed, toggleTimer, unwatch } = useMapTimers(zone, update)
  const watched = useMemo(() => watchedPoints(zone, watches, MOB_CATALOG), [zone, watches])
  const points = useMemo(() => withWatched(trackedIn(state, zone), watched), [state, zone, watched])
  const ids = useMemo(() => new Set(points.map((p) => p.id)), [points])
  const autoIds = useMemo(() => new Set(points.filter((p) => p.auto === true).map((p) => p.id)), [points])
  const toggle = useCallback(
    (row: MapPaneRow) => {
      // A Timers watch is tracked by the watch; the bookmark cannot take it off the map.
      if (zone != null) update((s) => (watched.some((w) => w.id === row.id) && !s.points.some((p) => p.zone === zone && p.id === row.id) ? s : toggleTracked(s, pointFromRow(zone, row))))
    },
    [zone, update, watched]
  )
  const untrack = useCallback(
    (id: string) => {
      if (zone != null) update((s) => ({ ...s, points: s.points.filter((p) => !(p.zone === zone && p.id === id)) }))
    },
    [zone, update]
  )
  return useMemo(
    () => ({ points, ids, autoIds, toggle, untrack, isTimed, toggleTimer, unwatch }),
    [points, ids, autoIds, toggle, untrack, isTimed, toggleTimer, unwatch]
  )
}
