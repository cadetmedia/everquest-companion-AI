// useOverlayView.ts — the Map pins overlay's own zoom and pan (owner, 2026-10-13), so the user can
// match a zoomed in-game map by hand. Unlocked only: scroll zooms around the cursor in fine steps,
// a drag on empty map pans, and the Fit chip goes back to the whole zone. Remembered per zone, the
// way the game keeps its own zoom, in localStorage for this machine.

import { useCallback, useEffect, useRef, useState, type PointerEvent as ReactPointerEvent } from 'react'
import { panView, zoomView, type OverlayView, type ZoneExtent } from '../features/maps/mapTrack'

const KEY = 'eq.maps.overlayView'
/** One scroll notch: fine, because the point is matching another map to the pixel. */
const STEP = 1.06
const DRAG_SLOP_PX = 3

type Views = Record<string, OverlayView>

function load(): Views {
  try {
    const v = JSON.parse(localStorage.getItem(KEY) ?? '{}') as unknown
    return typeof v === 'object' && v !== null ? (v as Views) : {}
  } catch {
    return {}
  }
}

function save(views: Views): void {
  try {
    localStorage.setItem(KEY, JSON.stringify(views))
  } catch {
    // A blocked store keeps the view for this session only.
  }
}

export interface OverlayViewControls {
  view: OverlayView | null
  /** Back to the whole-zone fit. */
  reset: () => void
  onPointerDown: (e: ReactPointerEvent<HTMLElement>) => void
  onPointerMove: (e: ReactPointerEvent<HTMLElement>) => void
  onPointerUp: (e: ReactPointerEvent<HTMLElement>) => void
}

export function useOverlayView(args: {
  zone: string | null
  ext: ZoneExtent | undefined
  size: { w: number; h: number }
  /** Unlocked: a locked overlay is click-through and takes no wheel or drag. */
  enabled: boolean
  hostRef: React.RefObject<HTMLElement | null>
}): OverlayViewControls {
  const { zone, ext, size, enabled, hostRef } = args
  const [views, setViews] = useState<Views>(load)
  const view = zone == null ? null : (views[zone] ?? null)
  const setView = useCallback(
    (next: OverlayView | null) => {
      if (zone == null) return
      setViews((prev) => {
        const out = Object.fromEntries(Object.entries(prev).filter(([z]) => z !== zone))
        if (next != null) out[zone] = next
        save(out)
        return out
      })
    },
    [zone]
  )

  // Wheel: native and non-passive, so the page does not scroll instead.
  const live = useRef({ ext, size, view, enabled, setView })
  live.current = { ext, size, view, enabled, setView }
  useEffect(() => {
    const el = hostRef.current
    if (!el) return
    const onWheel = (e: WheelEvent): void => {
      const s = live.current
      if (!s.enabled || s.ext == null) return
      e.preventDefault()
      const r = el.getBoundingClientRect()
      s.setView(zoomView({ ext: s.ext, w: s.size.w, h: s.size.h }, s.view, { x: e.clientX - r.left, y: e.clientY - r.top }, e.deltaY < 0 ? STEP : 1 / STEP))
    }
    el.addEventListener('wheel', onWheel, { passive: false })
    return () => {
      el.removeEventListener('wheel', onWheel)
    }
  }, [hostRef])

  const drag = useRef<{ x: number; y: number; from: OverlayView | null; moved: boolean } | null>(null)
  const onPointerDown = useCallback(
    (e: ReactPointerEvent<HTMLElement>) => {
      // A press on a mark or a chip is that control's click, not a pan.
      if (!enabled || e.button !== 0 || (e.target as HTMLElement).closest('[data-mark], button') != null) return
      drag.current = { x: e.clientX, y: e.clientY, from: view, moved: false }
    },
    [enabled, view]
  )
  const onPointerMove = useCallback(
    (e: ReactPointerEvent<HTMLElement>) => {
      const d = drag.current
      if (d == null || ext == null) return
      const dx = e.clientX - d.x
      const dy = e.clientY - d.y
      if (!d.moved && Math.abs(dx) < DRAG_SLOP_PX && Math.abs(dy) < DRAG_SLOP_PX) return
      if (!d.moved) e.currentTarget.setPointerCapture(e.pointerId)
      d.moved = true
      setView(panView({ ext, w: size.w, h: size.h }, d.from, dx, dy))
    },
    [ext, size.w, size.h, setView]
  )
  const onPointerUp = useCallback((e: ReactPointerEvent<HTMLElement>) => {
    drag.current = null
    if (e.currentTarget.hasPointerCapture(e.pointerId)) e.currentTarget.releasePointerCapture(e.pointerId)
  }, [])
  const reset = useCallback(() => {
    setView(null)
  }, [setView])
  return { view, reset, onPointerDown, onPointerMove, onPointerUp }
}
