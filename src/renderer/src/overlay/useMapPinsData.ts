// useMapPinsData.ts — what the Map pins overlay needs from outside its window: the zone's map
// (the same call and pack choice as the Maps tab), the slim placed-mob catalog from main, and the
// Achievements areas the main window writes (shared/slayerOverlay.ts).

import { useEffect, useState } from 'react'
import type { MapData } from '@shared/maps'
import type { MobEntry } from '@shared/types'
import { SLAYER_OVERLAY_KEY, parseSlayerOverlay, type SlayerOverlayPayload } from '@shared/slayerOverlay'
import { PACK_PREFS_KEY, loadPackPrefs } from '../features/maps/useMapData'

/** The slim placed-mob catalog from main, once; an empty list until it lands. */
export function useMobPlaces(): MobEntry[] {
  const [places, setPlaces] = useState<MobEntry[]>([])
  useEffect(() => {
    let live = true
    void window.eqOverlay
      .getMobPlaces()
      .then((p) => {
        if (live) setPlaces(p)
      })
      .catch(() => undefined)
    return () => {
      live = false
    }
  }, [])
  return places
}

function prefsKey(): string {
  try {
    return localStorage.getItem(PACK_PREFS_KEY) ?? ''
  } catch {
    return ''
  }
}

/** The zone's map, refetched when the zone or the Maps tab's pack choice changes. */
export function useOverlayMapData(zone: string | null): MapData | null {
  const [data, setData] = useState<MapData | null>(null)
  const [prefsRaw, setPrefsRaw] = useState(prefsKey)
  useEffect(() => {
    const onStorage = (e: StorageEvent): void => {
      if (e.key === PACK_PREFS_KEY || e.key === null) setPrefsRaw(prefsKey())
    }
    window.addEventListener('storage', onStorage)
    return () => {
      window.removeEventListener('storage', onStorage)
    }
  }, [])
  useEffect(() => {
    if (zone == null) {
      setData(null)
      return
    }
    let live = true
    const { geometry, labels } = loadPackPrefs()
    void window.eqOverlay
      .getMapData(zone, { ...(geometry == null ? {} : { geometry }), ...(labels == null ? {} : { labels }) })
      .then((res) => {
        if (live) setData(res.ok ? res.data : null)
      })
      .catch(() => {
        if (live) setData(null)
      })
    return () => {
      live = false
    }
  }, [zone, prefsRaw])
  return data
}

function readSlayer(): SlayerOverlayPayload | null {
  try {
    return parseSlayerOverlay(localStorage.getItem(SLAYER_OVERLAY_KEY))
  } catch {
    return null
  }
}

/** The Achievements areas the main window last wrote, kept current through `storage` events. */
export function useSlayerOverlay(): SlayerOverlayPayload | null {
  const [payload, setPayload] = useState(readSlayer)
  useEffect(() => {
    const onStorage = (e: StorageEvent): void => {
      if (e.key === SLAYER_OVERLAY_KEY || e.key === null) setPayload(readSlayer())
    }
    window.addEventListener('storage', onStorage)
    return () => {
      window.removeEventListener('storage', onStorage)
    }
  }, [])
  return payload
}
