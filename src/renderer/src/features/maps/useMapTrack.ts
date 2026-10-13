// useMapTrack.ts — the track list as React state, kept in step across windows.
//
// The rules are mapTrack.ts; this is the wiring. Every write goes through `saveTrack`, and every
// OTHER window of the app hears it as a `storage` event and re-reads, so the Maps tab and the map
// pin overlay always show one list (mapTrack.ts says why there is no channel through main).

import { useCallback, useEffect, useMemo, useState } from 'react'
import type { MapData } from '@shared/maps'
import type { MapPaneRow } from './mobPins'
import {
  TRACK_KEY,
  loadTrack,
  saveTrack,
  toggleTracked,
  trackedIn,
  withExtent,
  type TrackState,
  type TrackedPoint
} from './mapTrack'

function safeLoad(): TrackState {
  try {
    return loadTrack()
  } catch {
    return loadTrack({ getItem: () => null, setItem: () => undefined })
  }
}

export interface MapTrack {
  state: TrackState
  /** Apply a pure edit (mapTrack.ts) and persist it. An edit that returns the same state writes nothing. */
  update: (edit: (s: TrackState) => TrackState) => void
}

export function useMapTrack(): MapTrack {
  const [state, setState] = useState<TrackState>(safeLoad)
  useEffect(() => {
    const onStorage = (e: StorageEvent): void => {
      if (e.key === TRACK_KEY || e.key === null) setState(safeLoad())
    }
    window.addEventListener('storage', onStorage)
    return () => {
      window.removeEventListener('storage', onStorage)
    }
  }, [])
  const update = useCallback((edit: (s: TrackState) => TrackState) => {
    setState((prev) => {
      const next = edit(prev)
      if (next === prev) return prev
      try {
        saveTrack(next)
      } catch {
        // A full or blocked store keeps the edit for this window only; nothing to tell the user
        // that the list on screen does not already show.
      }
      return next
    })
  }, [])
  return { state, update }
}

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
  toggle: (row: MapPaneRow) => void
  untrack: (id: string) => void
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
  const points = useMemo(() => trackedIn(state, zone), [state, zone])
  const ids = useMemo(() => new Set(points.map((p) => p.id)), [points])
  const toggle = useCallback(
    (row: MapPaneRow) => {
      if (zone != null) update((s) => toggleTracked(s, pointFromRow(zone, row)))
    },
    [zone, update]
  )
  const untrack = useCallback(
    (id: string) => {
      if (zone != null) update((s) => ({ ...s, points: s.points.filter((p) => !(p.zone === zone && p.id === id)) }))
    },
    [zone, update]
  )
  return { points, ids, toggle, untrack }
}
