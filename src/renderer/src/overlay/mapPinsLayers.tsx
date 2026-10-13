// mapPinsLayers.tsx — what the Map pins overlay draws, and the chips that switch it (owner,
// 2026-10-13): the map's lines, the points of interest (named mobs and map labels), the timer
// pins, the tracked points. Remembered in localStorage for this machine, like the Maps tab's own
// view choices.

import { useCallback, useState, type CSSProperties, type JSX } from 'react'
import { TRACK_COLOR } from '../features/maps/mapTrack'

export interface PinLayers {
  lines: boolean
  poi: boolean
  timers: boolean
  tracked: boolean
}

const KEY = 'eq.maps.overlayLayers'
const ALL_ON: PinLayers = { lines: true, poi: true, timers: true, tracked: true }
const CHIPS: readonly (readonly [keyof PinLayers, string])[] = [
  ['lines', 'Map'],
  ['poi', 'Points'],
  ['timers', 'Timers'],
  ['tracked', 'Tracked']
]

function load(): PinLayers {
  try {
    const raw = localStorage.getItem(KEY)
    if (raw == null) return ALL_ON
    const v = JSON.parse(raw) as Partial<Record<keyof PinLayers, unknown>>
    return {
      lines: v.lines !== false,
      poi: v.poi !== false,
      timers: v.timers !== false,
      tracked: v.tracked !== false
    }
  } catch {
    return ALL_ON
  }
}

export function usePinLayers(): [PinLayers, (k: keyof PinLayers) => void] {
  const [layers, setLayers] = useState<PinLayers>(load)
  const toggle = useCallback((k: keyof PinLayers) => {
    setLayers((prev) => {
      const next = { ...prev, [k]: !prev[k] }
      try {
        localStorage.setItem(KEY, JSON.stringify(next))
      } catch {
        // A blocked store keeps the choice for this session only.
      }
      return next
    })
  }, [])
  return [layers, toggle]
}

function chipStyle(on: boolean): CSSProperties {
  return {
    font: '600 10px Inter, "Segoe UI", system-ui, sans-serif',
    padding: '1px 7px',
    borderRadius: 9,
    cursor: 'pointer',
    border: `1px solid ${on ? TRACK_COLOR : 'rgba(255,255,255,0.3)'}`,
    background: on ? `${TRACK_COLOR}33` : 'rgba(14,17,21,0.6)',
    color: on ? '#f2f2f2' : 'rgba(255,255,255,0.55)'
  }
}

export function LayerChips({
  layers,
  onToggle,
  onFit,
  zoomed,
  noDrag
}: {
  layers: PinLayers
  onToggle: (k: keyof PinLayers) => void
  /** Back to the whole-zone fit after a manual zoom; shown only while zoomed. */
  onFit: () => void
  zoomed: boolean
  noDrag: CSSProperties
}): JSX.Element {
  return (
    <div style={{ display: 'flex', gap: 4, padding: '2px 6px', flexWrap: 'wrap', ...noDrag }}>
      {CHIPS.map(([k, label]) => (
        <button
          key={k}
          type="button"
          data-testid={`map-pins-chip-${k}`}
          aria-pressed={layers[k]}
          onClick={() => {
            onToggle(k)
          }}
          style={chipStyle(layers[k])}
        >
          {label}
        </button>
      ))}
      {zoomed && (
        <button type="button" data-testid="map-pins-fit" onClick={onFit} style={{ ...chipStyle(true), borderStyle: 'dashed' }}>
          Fit
        </button>
      )}
    </div>
  )
}
