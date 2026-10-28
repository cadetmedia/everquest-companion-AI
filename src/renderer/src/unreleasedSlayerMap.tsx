// unreleasedSlayerMap — the UNRELEASED gate's reach into the Maps tab, for the Slayer areas.
//
// unreleasedSlayer.tsx's arrangement, for the layer instead of the tab: the lazy const compiles to
// `null` in a build without the flag, so the dynamic `import()` is dead code and the Maps tab
// carries nothing of `features/slayer/**`. The map renders this unconditionally and gets `null`.
// The Map pins overlay's feed of the same areas is gated here too (UnreleasedSlayerOverlayFeed).

import { type ComponentType, type JSX, Suspense, lazy, memo } from 'react'
import type { ZoneShort } from '@shared/maps'
import { UNRELEASED } from './devFlags'
import type { MapViewport } from './features/maps/useMapViewport'
import { useOverlayOpen } from './lib/useOverlayOpen'

const LazyLayer = UNRELEASED ? lazy(() => import('./features/slayer/SlayerMapLayer')) : null
const LazyOverlayPublisher = UNRELEASED ? lazy(() => import('./features/slayer/SlayerOverlayPublisher')) : null

export default function UnreleasedSlayerMap({
  zone,
  vp
}: {
  zone: ZoneShort
  vp: MapViewport
}): JSX.Element | null {
  if (!LazyLayer) return null
  return (
    <Suspense fallback={null}>
      <LazyLayer zone={zone} vp={vp} />
    </Suspense>
  )
}

/** The publisher while the Map pins overlay is open; closed, nothing is read or written. */
function SlayerOverlayFeedGate({ Publisher }: { Publisher: ComponentType }): JSX.Element | null {
  if (!useOverlayOpen('mapPins')) return null
  return (
    <Suspense fallback={null}>
      <Publisher />
    </Suspense>
  )
}

/**
 * The Map pins overlay's Achievements areas (shared/slayerOverlay.ts). Mounted once, in
 * AppCelebrations, so it runs on every tab; memo'd, so that component's re-renders stop here.
 * Nothing at all in a build without the flag.
 */
export const UnreleasedSlayerOverlayFeed = memo(function UnreleasedSlayerOverlayFeed(): JSX.Element | null {
  return LazyOverlayPublisher ? <SlayerOverlayFeedGate Publisher={LazyOverlayPublisher} /> : null
})
