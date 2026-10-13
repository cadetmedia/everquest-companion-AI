// MapPinsOverlay.tsx — the zone laid over the GAME'S OWN map (map-waypoints).
//
// WHAT IT DRAWS is the user's choice, one chip each (owner, 2026-10-13): the zone's lines from the
// same map pack as the Maps tab, the points of interest (named mobs and map labels), the timer
// pins, and the tracked points. The zone is fitted into the window the way the game's map shows a
// whole zone (mapTrack.ts `fitExtent`), so the user sizes the window to the map window's
// parchment, checks the lines against the game's, and every pin is where the game draws that spot.
//
// UNLOCKED it is a faint frame with the chips under its header: drag it by the header, resize it
// from the edges, click any mark to copy its `/waypoint` line. LOCKED it is click-through and only
// what the chips leave on shows, so the game's map under it takes every click; the header comes
// back while the pointer is over the top strip, which is how it is unlocked again.
//
// The zone is the one the log last named. The track list and the pack choice are the Maps tab's,
// read out of localStorage, which this window shares with the main window (useMapTrack.ts).

import { useEffect, useMemo, useRef, useState, type JSX } from 'react'
import type { CharacterSnap } from '@shared/types'
import { EMPTY_RESPAWN_SNAP, type RespawnSnap } from '@shared/respawn'
import { zoneShortName } from '@shared/zones'
import { OverlayHeader } from './OverlayHeader'
import { useOverlayChrome } from './useOverlayChrome'
import { useOverlayModule } from './useOverlayModule'
import { TRACK_COLOR, fitExtent, trackedIn, type ExtentFit, type TrackedPin, type TrackedPoint, type ZoneExtent } from '../features/maps/mapTrack'
import { useMapTrack } from '../features/maps/useMapTrack'
import { withWatched } from '../features/maps/watchTrack'
import { waypointCommand } from '../features/maps/waypoint'
import { MapPinsField } from './MapPinsField'
import { LayerChips, usePinLayers, type PinLayers } from './mapPinsLayers'
import { useMobPlaces, useOverlayMapData } from './useMapPinsData'
import { zoneMobPins, zoneTimerPins, zoneWatched } from '../features/maps/overlayPoints'

const NO_CHARACTER: CharacterSnap = { character: null }
const CORNER_PX = 16
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

/** A 1 Hz clock for the timer labels, ticking only while timers are drawn. */
function useClock(on: boolean): number {
  const [now, setNow] = useState(() => Date.now())
  useEffect(() => {
    if (!on) return
    const t = setInterval(() => {
      setNow(Date.now())
    }, 1000)
    return () => {
      clearInterval(t)
    }
  }, [on])
  return now
}

/** One L-shaped bracket on a corner of the fitted zone, `fit`'s rectangle in the window. */
function Corner({ h, v, fit }: { h: 'left' | 'right'; v: 'top' | 'bottom'; fit: ExtentFit }): JSX.Element {
  const edge = `2px solid ${TRACK_COLOR}`
  return (
    <div
      data-testid="map-pins-corner"
      style={{
        position: 'absolute',
        left: h === 'left' ? fit.left : fit.left + fit.width - CORNER_PX,
        top: v === 'top' ? fit.top : fit.top + fit.height - CORNER_PX,
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

/** Everything placed in the zone, through the window's whole-zone fit. */
function useZoneMarks(zone: string | null, layers: PinLayers) {
  const { state } = useMapTrack()
  const data = useOverlayMapData(zone)
  const catalog = useMobPlaces()
  const respawn = useOverlayModule<RespawnSnap>('respawn', EMPTY_RESPAWN_SNAP)
  const tracked = useMemo<TrackedPoint[]>(
    () => withWatched(trackedIn(state, zone), zoneWatched(zone, respawn.prefs.watches, catalog)),
    [state, zone, catalog, respawn.prefs.watches]
  )
  const mobs = useMemo(() => (layers.poi ? zoneMobPins(zone, catalog) : []), [zone, catalog, layers.poi])
  const timers = useMemo(() => zoneTimerPins(zone, respawn.rows, catalog), [zone, respawn.rows, catalog])
  const ext: ZoneExtent | undefined = data?.bounds ?? (zone == null ? undefined : state.extents[zone])
  return { data, tracked, mobs, timers, ext }
}

function emptyNote(zone: string | null, ext: ZoneExtent | undefined): string | null {
  if (zone == null) return 'Waiting for the log to name your zone.'
  if (ext == null) return 'No map for this zone - install a map pack, or open it on the Maps tab.'
  return null
}

function useCopy(): { copied: string | null; onCopy: (name: string, pin: TrackedPin) => void } {
  const [copied, setCopied] = useState<string | null>(null)
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null)
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
  return { copied, onCopy }
}

function Note({ text, bottom }: { text: string; bottom?: number }): JSX.Element {
  return (
    <div
      data-testid={bottom == null ? undefined : 'map-pins-copied'}
      style={{
        position: 'absolute',
        left: 8,
        right: 8,
        ...(bottom == null ? { top: '45%' } : { bottom }),
        textAlign: 'center',
        fontSize: 10.5,
        color: TEXT,
        textShadow: SHADOW,
        pointerEvents: 'none'
      }}
    >
      {text}
    </div>
  )
}

/** The four brackets on the fitted zone's corners. */
function Corners({ fit }: { fit: ExtentFit }): JSX.Element {
  return (
    <>
      <Corner h="left" v="top" fit={fit} />
      <Corner h="right" v="top" fit={fit} />
      <Corner h="left" v="bottom" fit={fit} />
      <Corner h="right" v="bottom" fit={fit} />
    </>
  )
}

/** The header, and the layer chips under it while unlocked. Shown unlocked, or while hovered. */
function PinsChrome({
  title,
  count,
  layers,
  onToggle,
  chrome
}: {
  title: string
  count: number
  layers: PinLayers
  onToggle: (k: keyof PinLayers) => void
  chrome: ReturnType<typeof useOverlayChrome>
}): JSX.Element | null {
  const { locked, hovering, toggleLock, capture, dragRegion, noDrag } = chrome
  if (locked && !hovering) return null
  return (
    <div style={{ position: 'absolute', top: 0, left: 0, right: 0 }}>
      <OverlayHeader
        tag="MAP"
        title={title}
        titleColor={TRACK_COLOR}
        tail={count > 0 ? String(count) : undefined}
        tailTitle="Tracked points in this zone. Size the window to the game map's parchment."
        chrome={{ locked, hovering, dragRegion, noDrag, toggleLock, capture }}
      />
      {!locked && <LayerChips layers={layers} onToggle={onToggle} noDrag={noDrag} />}
    </div>
  )
}

export default function MapPinsOverlay(): JSX.Element {
  const who = useOverlayModule<CharacterSnap>('character', NO_CHARACTER)
  const chrome = useOverlayChrome()
  const { locked } = chrome
  const [layers, toggleLayer] = usePinLayers()
  const { w, h } = useWindowSize()
  const zone = zoneShortName(who.zone)
  const { data, tracked, mobs, timers, ext } = useZoneMarks(zone, layers)
  const nowMs = useClock(layers.timers && timers.length > 0)
  const { copied, onCopy } = useCopy()
  const fit = ext == null ? null : fitExtent(ext, w, h)
  const note = emptyNote(zone, ext)

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
      {ext != null && fit != null && (
        <>
          <Corners fit={fit} />
          <MapPinsField ext={ext} fit={fit} w={w} h={h} data={data} layers={layers} mobs={mobs} timers={timers} tracked={tracked} nowMs={nowMs} onCopy={onCopy} />
        </>
      )}
      <PinsChrome title={who.zone ?? 'Map pins'} count={tracked.length} layers={layers} onToggle={toggleLayer} chrome={chrome} />
      {!locked && note != null && <Note text={note} />}
      {copied != null && <Note text={copied} bottom={CORNER_PX + 2} />}
    </div>
  )
}
