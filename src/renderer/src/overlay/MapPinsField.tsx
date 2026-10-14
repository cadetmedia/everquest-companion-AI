// MapPinsField.tsx — everything the Map pins overlay draws inside its window: the zone's lines,
// the points of interest, the timer pins and the tracked points, each behind its own chip
// (mapPinsLayers.tsx), all placed through ONE whole-zone fit (mapTrack.ts `fitExtent`).
//
// A label near the right edge is drawn on the pin's LEFT, ending at the pin, so it never runs off
// the window (owner, 2026-10-13).

import { useMemo, useState, type CSSProperties, type JSX } from 'react'
import type { MapData, MapPoint } from '@shared/maps'
import { MapCanvas } from '../features/maps/MapCanvas'
import { DEFAULT_LAYERS, viewRect } from '../features/maps/mapGeometry'
import { TRACK_COLOR, placeInExtent, type ExtentFit, type TrackedPin, type TrackedPoint, type ZoneExtent } from '../features/maps/mapTrack'
import { labelRows } from '../features/maps/mobPins'
import { justDue, timerPinLabels, type TimerPin } from '../features/maps/respawnPins'
import type { CatalogPin } from '../features/maps/overlayPoints'
import type { PinLayers } from './mapPinsLayers'

const TEXT = 'rgba(255,255,255,0.88)'
const SHADOW = '0 0 2px #000, 0 0 2px #000'
const POI_COLOR = '#e8a43c'
const TIMER_COLOR = '#ef5350'

export type CopyPin = (name: string, pin: TrackedPin) => void

interface MarkProps {
  at: { px: number; py: number }
  w: number
  text: string
  color: string
  size: number
  shape: 'dot' | 'diamond'
  faint?: boolean
  /** A timer that has just come due: the mark grows, shrinks and glows. */
  pulse?: boolean
  onClick: () => void
  testId: string
}

/** The pulse, as a keyframe rule the overlay bundle carries itself (it loads no CSS framework). */
const PULSE_CSS = `@keyframes eqmp-pulse { from { transform: scale(1) rotate(45deg); box-shadow: 0 0 0 1px rgba(0,0,0,0.85); } to { transform: scale(2.2) rotate(45deg); box-shadow: 0 0 10px 3px ${'#ef5350'}; } }`

function dotStyle(size: number, shape: MarkProps['shape'], color: string, flip: boolean): CSSProperties {
  return {
    width: size,
    height: size,
    ...(flip ? { marginRight: -size / 2 } : { marginLeft: -size / 2 }),
    borderRadius: shape === 'dot' ? '50%' : 1,
    transform: shape === 'diamond' ? 'rotate(45deg)' : undefined,
    background: color,
    boxShadow: '0 0 0 1px rgba(0,0,0,0.85)',
    flexShrink: 0
  }
}

/**
 * One mark and its label. A FAINT mark (a point of interest) shows its name only while hovered:
 * every name at once buried the zone (owner, 2026-10-13); timers and tracked marks always carry
 * theirs. The label flips to the left of the mark when it would cross the right edge.
 */
function Mark({ at, w, text, color, size, shape, faint = false, pulse = false, onClick, testId }: MarkProps): JSX.Element {
  const [hot, setHot] = useState(false)
  const showText = !faint || hot
  const font = faint ? 9 : 10
  const flip = at.px + size + text.length * font * 0.56 + 6 > w
  return (
    <div
      data-testid={testId}
      data-mark
      onClick={onClick}
      onMouseEnter={() => {
        setHot(true)
      }}
      onMouseLeave={() => {
        setHot(false)
      }}
      style={{
        position: 'absolute',
        top: at.py,
        ...(flip ? { right: w - at.px } : { left: at.px }),
        transform: 'translateY(-50%)',
        display: 'flex',
        flexDirection: flip ? 'row-reverse' : 'row',
        alignItems: 'center',
        gap: 3,
        cursor: 'pointer',
        opacity: faint && !hot ? 0.75 : 1,
        zIndex: hot ? 5 : undefined
      }}
    >
      <span
        data-pulse={pulse ? 'true' : undefined}
        style={{ ...dotStyle(size, shape, color, flip), ...(pulse ? { animation: 'eqmp-pulse 0.6s ease-in-out infinite alternate' } : {}) }}
      />
      {showText && (
        <span
          data-testid="map-pins-text"
          style={{ fontSize: font, color: TEXT, textShadow: SHADOW, whiteSpace: 'nowrap', pointerEvents: 'none' }}
        >
          {text}
        </span>
      )}
    </div>
  )
}

function labelColor(p: MapPoint): string {
  return `rgb(${String(p.r)},${String(p.g)},${String(p.b)})`
}

export interface MapPinsFieldProps {
  ext: ZoneExtent
  fit: ExtentFit
  w: number
  h: number
  data: MapData | null
  layers: PinLayers
  mobs: readonly CatalogPin[]
  timers: readonly TimerPin[]
  tracked: readonly TrackedPoint[]
  nowMs: number
  onCopy: CopyPin
}

/** The zone's lines, drawn by the Maps tab's own canvas through a fixed whole-zone view. */
function Lines({ data, ext, fit, w, h }: { data: MapData; ext: ZoneExtent; fit: ExtentFit; w: number; h: number }): JSX.Element {
  const vp = useMemo(() => {
    // The map point at the window's centre under this fit, so the lines follow the user's zoom.
    const view = { cx: ext.minX + (w / 2 - fit.left) / fit.scale, cy: ext.minY + (h / 2 - fit.top) / fit.scale, scale: fit.scale }
    const size = { w, h }
    return { view, size, rect: viewRect(view, size) }
  }, [ext, fit.left, fit.top, fit.scale, w, h])
  return <MapCanvas lines={data.lines} vp={vp} layers={DEFAULT_LAYERS} ink={`${TRACK_COLOR}cc`} />
}

function PoiMarks(props: MapPinsFieldProps): JSX.Element {
  const { ext, fit, w, data, mobs, onCopy } = props
  const labels = useMemo(() => labelRows(data?.points ?? []).map((r) => r.point), [data])
  return (
    <>
      {labels.map((p, i) => (
        <Mark
          key={`l${String(i)}`}
          testId="map-pins-label"
          at={placeInExtent(ext, fit, p)}
          w={w}
          text={p.display}
          color={labelColor(p)}
          size={5}
          shape="dot"
          faint
          onClick={() => {
            onCopy(p.display, { x: p.x, y: p.y, z: p.z })
          }}
        />
      ))}
      {mobs.map((m) => (
        <Mark
          key={m.key}
          testId="map-pins-poi"
          at={placeInExtent(ext, fit, m)}
          w={w}
          text={m.name}
          color={POI_COLOR}
          size={6}
          shape="dot"
          faint
          onClick={() => {
            onCopy(m.name, { x: m.x, y: m.y })
          }}
        />
      ))}
    </>
  )
}

function TimerMarks({ ext, fit, w, timers, nowMs, onCopy }: MapPinsFieldProps): JSX.Element {
  return (
    <>
      {timers.flatMap((t) =>
        t.pins.map((pin, i) => (
          <Mark
            key={`${t.id}#${String(i)}`}
            testId="map-pins-timer"
            at={placeInExtent(ext, fit, pin)}
            w={w}
            text={`${t.display} ${timerPinLabels(t, nowMs).clock}`}
            color={TIMER_COLOR}
            size={8}
            shape="diamond"
            pulse={justDue(t, nowMs)}
            onClick={() => {
              onCopy(t.display, { x: pin.x, y: pin.y })
            }}
          />
        ))
      )}
    </>
  )
}

function TrackedMarks({ ext, fit, w, tracked, timers, layers, onCopy }: MapPinsFieldProps): JSX.Element {
  // A tracked mob with a running clock is drawn ONCE, as its timer mark (owner, 2026-10-13: the
  // name showed twice, once plain and once with "due"). Timers off, the tracked mark is back.
  const clocked = new Set(layers.timers ? timers.flatMap((t) => t.pins.map((p) => `${String(p.x)},${String(p.y)}`)) : [])
  return (
    <>
      {tracked.flatMap((p) =>
        p.pins.filter((pin) => !clocked.has(`${String(pin.x)},${String(pin.y)}`)).map((pin, i) => (
          <Mark
            key={`${p.id}#${String(i)}`}
            testId="map-pins-pin"
            at={placeInExtent(ext, fit, pin)}
            w={w}
            text={p.name}
            color={TRACK_COLOR}
            size={9}
            shape="dot"
            onClick={() => {
              onCopy(p.name, pin)
            }}
          />
        ))
      )}
    </>
  )
}

export function MapPinsField(props: MapPinsFieldProps): JSX.Element {
  const { data, layers, ext, fit, w, h } = props
  return (
    <>
      {layers.lines && data != null && <Lines data={data} ext={ext} fit={fit} w={w} h={h} />}
      {layers.poi && <PoiMarks {...props} />}
      {layers.timers && (
        <>
          <style>{PULSE_CSS}</style>
          <TimerMarks {...props} />
        </>
      )}
      {layers.tracked && <TrackedMarks {...props} />}
    </>
  )
}
