// MapTrackedLayer.tsx — the track list on the Maps tab's surface: a ring in the tracked colour
// around every position of every tracked mob and label, the same colour the overlay draws them in.
//
// Rings rather than a second pin, so the mob pin or label dot underneath keeps its own colour and
// its own clicks; the layer takes no pointer events at all. A tracked mob is ringed even while
// the pane's search has filtered its pin away, because tracking is the user saying "always show me
// this one".

import { useMemo, type JSX } from 'react'
import { TRACK_COLOR, type TrackedPoint } from './mapTrack'
import type { MapViewport } from './useMapViewport'

const RING_PX = 17

export function MapTrackedLayer({ points, vp }: { points: readonly TrackedPoint[]; vp: MapViewport }): JSX.Element {
  const { toScreen } = vp
  const rings = useMemo(
    () => points.flatMap((p) => p.pins.map((pin, i) => ({ key: `${p.id}#${String(i)}`, at: toScreen(pin.x, pin.y) }))),
    [points, toScreen]
  )
  return (
    <div data-testid="maps-tracked" style={{ position: 'absolute', inset: 0, overflow: 'hidden', pointerEvents: 'none' }}>
      {rings.map((r) => (
        <span
          key={r.key}
          data-testid="maps-tracked-ring"
          style={{
            position: 'absolute',
            left: r.at.px,
            top: r.at.py,
            width: RING_PX,
            height: RING_PX,
            transform: 'translate(-50%, -50%)',
            borderRadius: '50%',
            border: `2px solid ${TRACK_COLOR}`,
            boxShadow: '0 0 0 1px rgba(0,0,0,0.6)'
          }}
        />
      ))}
    </div>
  )
}
