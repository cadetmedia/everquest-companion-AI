// MapPinsOverlay.tsx — the zone laid over the GAME'S OWN map (map-waypoints).
//
// WHAT IT DRAWS is the user's choice, one chip each (owner, 2026-10-13): the zone's lines from the
// same map pack as the Maps tab, the points of interest (named mobs and map labels), the timer
// pins, and the tracked points. The zone is fitted into the window the way the game's map shows a
// whole zone (mapTrack.ts `fitExtent`; unlocked, scroll and drag zoom it by hand, the Fit chip
// undoes that), so the user sizes the window to the map window's
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
import { FOOTER_ROW } from './overlayScale'
import { markZones, type MarkZoneInput } from './markZones'
import { labelRows } from '../features/maps/mobPins'
import { useOverlayModule } from './useOverlayModule'
import { TRACK_COLOR, trackedIn, viewFit, type ExtentFit, type TrackedPin, type TrackedPoint, type ZoneExtent } from '../features/maps/mapTrack'
import { useMapTrack } from '../features/maps/useMapTrack'
import { withWatched } from '../features/maps/watchTrack'
import { waypointCommand } from '../features/maps/waypoint'
import { MapPinsField } from './MapPinsField'
import { LayerChips, usePinLayers, usePinsBg, usePinsFollow, type PinLayers } from './mapPinsLayers'
import { useGameMapShown, useHiddenMouse } from './useGameMapFollow'
import { useMobPlaces, useOverlayMapData } from './useMapPinsData'
import { useOverlayView, type OverlayViewControls } from './useOverlayView'
import { zoneMobPins, zoneTimerPins, zoneWatched } from '../features/maps/overlayPoints'

const NO_CHARACTER: CharacterSnap = { character: null }
const CORNER_PX = 16
const COPIED_MS = 1800
const TEXT = 'rgba(255,255,255,0.85)'
const SHADOW = '0 0 2px #000, 0 0 2px #000'
/** The header and footer sit above the map and stay see-through, so the game's own UI under them
 *  still shows; the map is CLIPPED at their edges instead (owner, 2026-10-13: a zoomed map ran
 *  into both bars, and a solid bar would hide the game's map window under it). */
const BAR: React.CSSProperties = { position: 'absolute', left: 0, right: 0, zIndex: 10 }
/** The header row's height (overlayHotZone.ts measures it at 36) and the footer's. */
const HEADER_PX = 36
const FOOTER_PX = 24

/** The map's clip: off the header row while it shows, off the footer while unlocked. */
function barClip(locked: boolean, headerShown: boolean): string {
  const top = headerShown ? HEADER_PX : 0
  const bottom = locked ? 0 : FOOTER_PX
  return `inset(${String(top)}px 0 ${String(bottom)}px 0)`
}

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

/**
 * Is the pointer over the header's strip? Pinned, the window captures the mouse over its marks as
 * well as over the strip (usePinnedMarkZones), so `hovering` alone would bring the header back over
 * a pin and crop the map's top; the header answers to the strip only (review, 2026-10-13).
 */
function useTopStrip(locked: boolean, hovering: boolean): { shown: boolean; onMove: (e: React.PointerEvent) => void; onLeave: () => void } {
  const [inStrip, setInStrip] = useState(false)
  const onMove = (e: React.PointerEvent): void => {
    setInStrip(e.clientY < HEADER_PX)
  }
  const onLeave = (): void => {
    setInStrip(false)
  }
  return { shown: !locked || (hovering && inStrip), onMove, onLeave }
}

/** A 1 Hz clock for the timer labels, ticking only while timers are drawn. */
function useClock(on: boolean): number {
  const [now, setNow] = useState(() => Date.now())
  useEffect(() => {
    if (!on) return
    // Read at once: `now` may be from mount, long before the first timer appeared.
    const tick = (): void => {
      setNow(Date.now())
    }
    tick()
    const t = setInterval(tick, 1000)
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

/** The footer bar, unlocked only: the layer chips, Fit and the background slider, at the bottom
 *  like the XP window's controls, so the header stays one slim line over the map (owner,
 *  2026-10-13). */
function PinsFooter({
  layers,
  onToggle,
  zoom,
  bg,
  follow,
  noDrag
}: {
  layers: PinLayers
  onToggle: (k: keyof PinLayers) => void
  zoom: OverlayViewControls
  bg: [number, (v: number) => void]
  follow: [boolean, () => void]
  noDrag: React.CSSProperties
}): JSX.Element {
  return (
    <div
      data-testid="map-pins-footer"
      style={{ ...FOOTER_ROW, ...BAR, bottom: 0, padding: 0, background: 'rgba(14,17,21,0.78)' }}
    >
      <LayerChips layers={layers} onToggle={onToggle} onFit={zoom.reset} zoomed={zoom.view != null} follow={follow[0]} onFollow={follow[1]} bg={bg[0]} onBg={bg[1]} noDrag={noDrag} />
    </div>
  )
}

/** The header. Shown unlocked, or pinned while the pointer is over its strip. */
function PinsChrome({
  heading,
  count,
  chrome,
  shown
}: {
  heading: string
  count: number
  chrome: ReturnType<typeof useOverlayChrome>
  shown: boolean
}): JSX.Element | null {
  const { locked, hovering, toggleLock, capture, dragRegion, noDrag } = chrome
  if (!shown) return null
  return (
    // Solid while unlocked, as on the other overlays; pinned, it shows only on hover and stays
    // see-through, so the game's map under it is not covered.
    <div style={{ ...BAR, top: 0, background: locked ? undefined : 'rgb(14,17,21)' }}>
      <OverlayHeader
        tag="MAP"
        title={heading}
        titleColor={TRACK_COLOR}
        tail={count > 0 ? String(count) : undefined}
        tailTitle="Tracked points in this zone. Size the window to the game map's parchment."
        chrome={{ locked, hovering, dragRegion, noDrag, toggleLock, capture }}
      />
    </div>
  )
}

/**
 * Pinned, tell main where the clickable marks are, so the pointer over one takes the mouse and the
 * rest of the window stays click-through. Sent only when the set changes; nothing while unlocked
 * (the window owns the mouse then) and nothing once the window is gone.
 */
function usePinnedMarkZones(input: MarkZoneInput | null, locked: boolean, hidden: boolean): void {
  const sent = useRef('')
  const zones = useMemo(() => (locked && !hidden && input != null ? markZones(input) : []), [locked, hidden, input])
  useEffect(() => {
    const key = `${String(hidden)}|${JSON.stringify(zones)}`
    if (key === sent.current) return
    sent.current = key
    // Hidden, the window claims no zone at all, its header strip included (main/overlayHover.ts).
    window.eqOverlay.setMarkZones(zones, hidden)
  }, [zones, hidden])
  useEffect(
    () => () => {
      window.eqOverlay.setMarkZones([])
    },
    []
  )
}

/**
 * Following the game map and the game map is closed: the overlay hides (useGameMapFollow.ts).
 * PINNED ONLY. Unlocked it always draws, so the chips that turn Auto-hide off stay reachable: a
 * tester's overlay hid unlocked while his game map read as closed, and nothing could bring it back
 * (2026-10-14). Unlocked, the note says what Auto-hide would do.
 */
function useFollowHidden(follow: boolean, locked: boolean): { hidden: boolean; note: string | null } {
  const gameMap = useGameMapShown()
  const hidden = locked && follow && gameMap === false
  useHiddenMouse(hidden, locked)
  return { hidden, note: followNote(follow, gameMap) }
}

/** The centred note, unlocked only: the empty-zone note first, else Auto-hide's. */
function unlockedNote(locked: boolean, note: string | null, autoHide: string | null): string | null {
  return locked ? null : (note ?? autoHide)
}

function followNote(follow: boolean, gameMap: boolean | null): string | null {
  if (!follow) return null
  if (gameMap === false) return 'Auto-hide: the game map reads as closed, so this hides once pinned.'
  if (gameMap === null) return "Auto-hide: the game's UI file for this character cannot be found."
  return null
}

export default function MapPinsOverlay(): JSX.Element {
  const who = useOverlayModule<CharacterSnap>('character', NO_CHARACTER)
  const chrome = useOverlayChrome()
  const { locked } = chrome
  const [layers, toggleLayer] = usePinLayers()
  const bg = usePinsBg()
  const { w, h } = useWindowSize()
  const zone = zoneShortName(who.zone)
  const { data, tracked, mobs, timers, ext } = useZoneMarks(zone, layers)
  const nowMs = useClock(layers.timers && timers.length > 0)
  const { copied, onCopy } = useCopy()
  const hostRef = useRef<HTMLDivElement>(null)
  const zoom = useOverlayView({ zone, ext, size: { w, h }, enabled: !locked, hostRef })
  const fit = useMemo(() => (ext == null ? null : viewFit(ext, w, h, zoom.view)), [ext, w, h, zoom.view])
  const note = emptyNote(zone, ext)
  const labels = useMemo(() => labelRows(data?.points ?? []).map((r) => r.point), [data])
  const zoneInput = useMemo(
    () => (ext == null || fit == null ? null : { ext, fit, w, h, layers, labels, mobs, timers, tracked, nowMs }),
    [ext, fit, w, h, layers, labels, mobs, timers, tracked, nowMs]
  )
  const [follow, toggleFollow] = usePinsFollow()
  const { hidden, note: autoHideNote } = useFollowHidden(follow, locked)
  usePinnedMarkZones(zoneInput, locked, hidden)
  const strip = useTopStrip(locked, chrome.hovering)
  const shownNote = unlockedNote(locked, note, autoHideNote)
  const clip = barClip(locked, strip.shown)

  // Hidden with the game map: nothing drawn, no click taken (useHiddenMouse, the zones above).
  if (hidden) return <div data-testid="map-pins-overlay" data-hidden="true" style={{ width: '100%', height: '100%' }} />

  return (
    <div
      ref={hostRef}
      data-testid="map-pins-overlay"
      onPointerDown={zoom.onPointerDown}
      onPointerMove={(e) => {
        strip.onMove(e)
        zoom.onPointerMove(e)
      }}
      onPointerLeave={strip.onLeave}
      onPointerUp={zoom.onPointerUp}
      onPointerCancel={zoom.onPointerUp}
      style={{
        position: 'relative',
        width: '100%',
        height: '100%',
        fontFamily: 'Inter, "Segoe UI", Roboto, system-ui, sans-serif',
        background: `rgba(14,17,21,${String(bg[0])})`,
        // The other overlays' frame (RespawnOverlay, XpOverlay): an accent line while unlocked, all
        // but invisible pinned (owner, 2026-10-13).
        border: locked ? '1px solid rgba(255,255,255,0.04)' : `1px solid ${TRACK_COLOR}66`,
        borderRadius: 8,
        boxSizing: 'border-box',
        overflow: 'hidden'
      }}
    >
      {ext != null && fit != null && (
        // Clipped, not moved: the fit is still the whole window, so the alignment holds whether
        // or not the bars are showing (pinned and not hovered, they are not, and nothing is cut).
        <div style={{ position: 'absolute', inset: 0, clipPath: clip }}>
          <Corners fit={fit} />
          <MapPinsField ext={ext} fit={fit} w={w} h={h} data={data} layers={layers} mobs={mobs} timers={timers} tracked={tracked} nowMs={nowMs} onCopy={onCopy} />
        </div>
      )}
      <PinsChrome heading={who.zone ?? 'Map pins'} count={tracked.length} chrome={chrome} shown={strip.shown} />
      {shownNote != null && <Note text={shownNote} />}
      {!locked && <PinsFooter layers={layers} onToggle={toggleLayer} zoom={zoom} bg={bg} follow={[follow, toggleFollow]} noDrag={chrome.noDrag} />}
      {copied != null && <Note text={copied} bottom={locked ? CORNER_PX + 2 : 34} />}
    </div>
  )
}
