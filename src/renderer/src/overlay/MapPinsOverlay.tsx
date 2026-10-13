// MapPinsOverlay.tsx — the tracked map points laid over the GAME'S OWN map (map-waypoints).
//
// NO MAP IS DRAWN (owner, 2026-10-13): two near-identical maps on top of each other would only
// get in the way. The window draws the four corners of the zone's map and the tracked points, and
// nothing else. The user sizes the window until its corners sit on the corners of the game's map
// window; every pin is then where the game draws that spot (mapTrack.ts `placeInExtent`).
//
// UNLOCKED it is a faint frame: drag it by the header, resize it from the edges, click a pin to
// copy its `/waypoint` line. LOCKED it is click-through and only the corners and pins show, so the
// game's map under it takes every click; the header comes back while the pointer is over the top
// strip, which is how it is unlocked again.
//
// The zone is the one the log last named, and the list is the Maps tab's: both come out of
// localStorage, which this window shares with the main window (useMapTrack.ts).

import { useEffect, useRef, useState, type JSX } from 'react'
import type { CharacterSnap } from '@shared/types'
import { zoneShortName } from '@shared/zones'
import { OverlayHeader } from './OverlayHeader'
import { useOverlayChrome } from './useOverlayChrome'
import { useOverlayModule } from './useOverlayModule'
import { TRACK_COLOR, placeInExtent, trackedIn, type TrackedPin, type TrackedPoint, type ZoneExtent } from '../features/maps/mapTrack'
import { useMapTrack } from '../features/maps/useMapTrack'
import { waypointCommand } from '../features/maps/waypoint'

const NO_CHARACTER: CharacterSnap = { character: null }
const CORNER_PX = 16
const PIN_PX = 9
const COPIED_MS = 1800
const TEXT = 'rgba(255,255,255,0.85)'
const SHADOW = '0 0 2px #000, 0 0 2px #000'

function useWindowSize(): { w: number; h: number } {
  const [size, setSize] = useState({ w: window.innerWidth, h: window.innerHeight })
  useEffect(() => {
    const onResize = (): void => {
      setSize({ w: window.innerWidth, h: window.innerHeight })
    }
    window.addEventListener('resize', onResize)
    return () => {
      window.removeEventListener('resize', onResize)
    }
  }, [])
  return size
}

/** One L-shaped bracket. `h`/`v` say which edges of the window it hugs. */
function Corner({ h, v }: { h: 'left' | 'right'; v: 'top' | 'bottom' }): JSX.Element {
  const edge = `2px solid ${TRACK_COLOR}`
  return (
    <div
      data-testid="map-pins-corner"
      style={{
        position: 'absolute',
        [h]: 0,
        [v]: 0,
        width: CORNER_PX,
        height: CORNER_PX,
        borderLeft: h === 'left' ? edge : undefined,
        borderRight: h === 'right' ? edge : undefined,
        borderTop: v === 'top' ? edge : undefined,
        borderBottom: v === 'bottom' ? edge : undefined,
        pointerEvents: 'none'
      }}
    />
  )
}

function Pin({
  name,
  pin,
  at,
  onCopy
}: {
  name: string
  pin: TrackedPin
  at: { px: number; py: number }
  onCopy: (name: string, pin: TrackedPin) => void
}): JSX.Element {
  return (
    <div
      data-testid="map-pins-pin"
      onClick={() => {
        onCopy(name, pin)
      }}
      style={{ position: 'absolute', left: at.px, top: at.py, cursor: 'pointer', display: 'flex', alignItems: 'center' }}
    >
      <span
        style={{
          width: PIN_PX,
          height: PIN_PX,
          marginLeft: -PIN_PX / 2,
          marginTop: 0,
          transform: 'translateY(-50%)',
          borderRadius: '50%',
          background: TRACK_COLOR,
          boxShadow: '0 0 0 1px rgba(0,0,0,0.85)',
          flexShrink: 0
        }}
      />
      <span
        style={{
          marginLeft: 3,
          transform: 'translateY(-50%)',
          fontSize: 10,
          color: TEXT,
          textShadow: SHADOW,
          whiteSpace: 'nowrap',
          pointerEvents: 'none'
        }}
      >
        {name}
      </span>
    </div>
  )
}

function emptyNote(zone: string | null, ext: ZoneExtent | undefined, count: number): string | null {
  if (zone == null) return 'Waiting for the log to name your zone.'
  if (ext == null) return 'Open this zone on the Maps tab once to place its corners.'
  if (count === 0) return 'Nothing tracked here - track mobs or labels on the Maps tab.'
  return null
}

/** The four corners and every tracked pin, placed in the window. Nothing at all without an extent. */
function PinField({
  ext,
  points,
  onCopy
}: {
  ext: ZoneExtent | undefined
  points: readonly TrackedPoint[]
  onCopy: (name: string, pin: TrackedPin) => void
}): JSX.Element | null {
  const { w, h } = useWindowSize()
  if (ext == null) return null
  return (
    <>
      <Corner h="left" v="top" />
      <Corner h="right" v="top" />
      <Corner h="left" v="bottom" />
      <Corner h="right" v="bottom" />
      {points.map((p) =>
        p.pins.map((pin, i) => (
          <Pin key={`${p.id}#${String(i)}`} name={p.name} pin={pin} at={placeInExtent(ext, w, h, pin)} onCopy={onCopy} />
        ))
      )}
    </>
  )
}

export default function MapPinsOverlay(): JSX.Element {
  const who = useOverlayModule<CharacterSnap>('character', NO_CHARACTER)
  const { locked, hovering, toggleLock, capture, dragRegion, noDrag } = useOverlayChrome()
  const { state } = useMapTrack()
  const [copied, setCopied] = useState<string | null>(null)
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null)

  const zone = zoneShortName(who.zone)
  const points = trackedIn(state, zone)
  const ext = zone == null ? undefined : state.extents[zone]
  const note = emptyNote(zone, ext, points.length)

  const onCopy = (name: string, pin: TrackedPin): void => {
    const line = waypointCommand(pin)
    void window.eqOverlay.writeClipboard(line).then((ok) => {
      setCopied(ok ? `${name}: ${line} copied` : 'Could not reach the clipboard.')
      if (timer.current) clearTimeout(timer.current)
      timer.current = setTimeout(() => {
        setCopied(null)
      }, COPIED_MS)
    })
  }

  return (
    <div
      data-testid="map-pins-overlay"
      style={{
        position: 'relative',
        width: '100%',
        height: '100%',
        fontFamily: 'Inter, "Segoe UI", Roboto, system-ui, sans-serif',
        background: locked ? 'transparent' : 'rgba(14,17,21,0.25)',
        outline: locked ? undefined : `1px dashed ${TRACK_COLOR}66`,
        outlineOffset: -1,
        overflow: 'hidden'
      }}
    >
      <PinField ext={ext} points={points} onCopy={onCopy} />
      {(!locked || hovering) && (
        <div style={{ position: 'absolute', top: 0, left: 0, right: 0 }}>
          <OverlayHeader
            tag="MAP"
            title={who.zone ?? 'Map pins'}
            titleColor={TRACK_COLOR}
            tail={points.length > 0 ? String(points.length) : undefined}
            tailTitle="Tracked points in this zone. Line the four corners up with the game's map."
            chrome={{ locked, hovering, dragRegion, noDrag, toggleLock, capture }}
          />
        </div>
      )}
      {!locked && note != null && (
        <div style={{ position: 'absolute', left: 8, right: 8, top: '45%', textAlign: 'center', fontSize: 10.5, color: TEXT, textShadow: SHADOW }}>
          {note}
        </div>
      )}
      {copied != null && (
        <div
          data-testid="map-pins-copied"
          style={{ position: 'absolute', left: 8, right: 8, bottom: CORNER_PX + 2, textAlign: 'center', fontSize: 10.5, color: TEXT, textShadow: SHADOW }}
        >
          {copied}
        </div>
      )}
    </div>
  )
}
