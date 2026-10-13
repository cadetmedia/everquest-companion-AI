// useMapTrack.ts — the track list as React state, kept in step across windows.
//
// The rules are mapTrack.ts; this is the wiring. Every write goes through `saveTrack`, and every
// OTHER window of the app hears it as a `storage` event and re-reads, so the Maps tab and the map
// pin overlay always show one list (mapTrack.ts says why there is no channel through main).

import { useCallback, useEffect, useState } from 'react'
import { TRACK_KEY, loadTrack, saveTrack, type TrackState } from './mapTrack'

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
