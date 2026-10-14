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

const BG_KEY = 'eq.maps.overlayBg'
/** The overlay's own backdrop, 0 (clear) to 0.9. Its own, not the shared overlay transparency:
 *  that one starts at 0.72 and stops at 0.1, which would hide the game map it sits on. */
export const BG_MAX = 0.9
const BG_DEFAULT = 0.2

function loadBg(): number {
  try {
    const v = Number(localStorage.getItem(BG_KEY))
    return localStorage.getItem(BG_KEY) != null && Number.isFinite(v) ? Math.min(BG_MAX, Math.max(0, v)) : BG_DEFAULT
  } catch {
    return BG_DEFAULT
  }
}

export function usePinsBg(): [number, (v: number) => void] {
  const [bg, setBg] = useState<number>(loadBg)
  const set = useCallback((v: number) => {
    const next = Math.min(BG_MAX, Math.max(0, v))
    setBg(next)
    try {
      localStorage.setItem(BG_KEY, String(next))
    } catch {
      // A blocked store keeps the value for this session only.
    }
  }, [])
  return [bg, set]
}

const FOLLOW_KEY = 'eq.maps.overlayFollow'

/** Hide the overlay while the in-game map is closed? Off unless the user turns it on. */
export function usePinsFollow(): [boolean, () => void] {
  const [follow, setFollow] = useState<boolean>(() => {
    try {
      return localStorage.getItem(FOLLOW_KEY) === '1'
    } catch {
      return false
    }
  })
  const toggle = useCallback(() => {
    setFollow((prev) => {
      try {
        localStorage.setItem(FOLLOW_KEY, prev ? '0' : '1')
      } catch {
        // A blocked store keeps the choice for this session only.
      }
      return !prev
    })
  }, [])
  return [follow, toggle]
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
  follow,
  onFollow,
  bg,
  onBg,
  noDrag
}: {
  layers: PinLayers
  onToggle: (k: keyof PinLayers) => void
  /** Back to the whole-zone fit after a manual zoom; shown only while zoomed. */
  onFit: () => void
  zoomed: boolean
  /** Hide with the game map: the chip that switches it. */
  follow: boolean
  onFollow: () => void
  bg: number
  onBg: (v: number) => void
  noDrag: CSSProperties
}): JSX.Element {
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 4, padding: '2px 6px', flexWrap: 'wrap', ...noDrag }}>
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
      <button
        type="button"
        data-testid="map-pins-follow"
        aria-pressed={follow}
        onClick={onFollow}
        style={chipStyle(follow)}
      >
        Follow map
      </button>
      {zoomed && (
        <button type="button" data-testid="map-pins-fit" onClick={onFit} style={{ ...chipStyle(true), borderStyle: 'dashed' }}>
          Fit
        </button>
      )}
      <span style={{ display: 'flex', alignItems: 'center', gap: 4, font: '600 10px Inter, "Segoe UI", system-ui, sans-serif', color: 'rgba(255,255,255,0.7)' }}>
        bg
        <input
          type="range"
          aria-label={`Background (${String(Math.round(bg * 100))}%)`}
          data-testid="map-pins-bg"
          min={0}
          max={BG_MAX}
          step={0.02}
          value={bg}
          onChange={(e) => {
            onBg(Number(e.target.value))
          }}
          style={{ width: 64, accentColor: TRACK_COLOR, height: 4 }}
        />
      </span>
    </div>
  )
}
