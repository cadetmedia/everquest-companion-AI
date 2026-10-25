// lib/mapZoneLink.ts — the Maps tab's zone opener (App's `openMapZone`, appRouting.ts) handed to a
// tree that sits behind a lazy gate (unreleasedGaps.tsx), so its rows open a zone's map without the
// opener threaded through every component between (review C7). Outside a provider there is no
// opener (an overlay window, a test) and a link is not drawn. In lib/, not features/gaps/, so the
// gate's static import carries none of the tab into a packaged build.

import { createContext, useContext } from 'react'
import type { ZoneShort } from '@shared/maps'

export type MapZoneOpener = (zone: ZoneShort) => void

export const MapZoneContext = createContext<MapZoneOpener | undefined>(undefined)

/** The opener a provider above gave, or undefined. */
export const useMapZoneOpener = (): MapZoneOpener | undefined => useContext(MapZoneContext)
