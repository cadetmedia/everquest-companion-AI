// overlayReset.ts — "Reset overlay positions" in the title bar's Overlay menu (owner ask,
// 2026-10-14, after a tester's overlay had gone where it could not be seen or reached).
//
// A reset puts each overlay back where a first open puts it: the default place and size, the
// kind's default lock, its own transparency and text size, no drill-down. Whether a window is
// open, and what each one is set to show (rows, sounds, a card's hold), are kept: those are
// choices, not a lost window.

import type { OverlayConfig } from './types'
import { TEXT_SCALE_DEFAULT } from './overlayTextScale'

/** The merge-patch that resets one kind, from that kind's defaults. `bounds: undefined` is what
 *  drops the stored rectangle, so the next open is placed by overlayLayout.ts. */
export function overlayResetPatch(def: OverlayConfig): Partial<OverlayConfig> {
  return { bounds: undefined, locked: def.locked, bgAlpha: def.bgAlpha, textScale: TEXT_SCALE_DEFAULT, drill: null }
}

/**
 * localStorage keys an overlay window keeps for itself (overlay windows share the main window's
 * origin). Every key starting with one of these is removed by a reset. An overlay that stores a
 * setting there adds its prefix here.
 */
export const OVERLAY_LOCAL_KEY_PREFIXES: readonly string[] = [
  // The Map pins overlay: its layer chips, backdrop, Auto-hide and per-zone zoom (map-waypoints).
  'eq.maps.overlay'
]

/** Remove every key under the prefixes. Returns how many went. */
export function clearOverlayLocalKeys(
  storage: Pick<Storage, 'length' | 'key' | 'removeItem'>,
  prefixes: readonly string[] = OVERLAY_LOCAL_KEY_PREFIXES
): number {
  const doomed: string[] = []
  for (let i = 0; i < storage.length; i++) {
    const k = storage.key(i)
    if (k != null && prefixes.some((p) => k.startsWith(p))) doomed.push(k)
  }
  for (const k of doomed) storage.removeItem(k)
  return doomed.length
}
