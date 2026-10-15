// overlayReset.ts — the resets in the title bar's Overlay menu: one per overlay row, and one for
// all of them (owner asks, 2026-10-14, after a tester's overlay had gone where it could not be
// seen or reached).
//
// A reset puts each overlay back where a first open puts it: the default place and size, the
// kind's default lock, its own transparency and text size, no drill-down. Whether a window is
// open, and what each one is set to show (rows, sounds, a card's hold), are kept: those are
// choices, not a lost window.

import { OVERLAY_KINDS, type OverlayConfig, type OverlayKind } from './types'
import { TEXT_SCALE_DEFAULT } from './overlayTextScale'

/** The merge-patch that resets one kind, from that kind's defaults. `bounds: undefined` is what
 *  drops the stored rectangle, so the next open is placed by overlayLayout.ts. */
export function overlayResetPatch(def: OverlayConfig): Partial<OverlayConfig> {
  return { bounds: undefined, locked: def.locked, bgAlpha: def.bgAlpha, textScale: TEXT_SCALE_DEFAULT, drill: null }
}

/**
 * localStorage keys an overlay window keeps for itself (overlay windows share the main window's
 * origin), by kind. Every key starting with one of a kind's prefixes is removed when that kind is
 * reset. An overlay that stores a setting there adds its prefix here.
 */
export const OVERLAY_LOCAL_KEY_PREFIXES: Partial<Record<OverlayKind, readonly string[]>> = {}

/** The kinds a reset names, keeping only real ones; none named means every kind. */
export function resetKinds(kinds: unknown): OverlayKind[] {
  if (!Array.isArray(kinds)) return [...OVERLAY_KINDS]
  return OVERLAY_KINDS.filter((k) => kinds.includes(k))
}

/** The localStorage prefixes of the given kinds. */
export function localPrefixesOf(kinds: readonly OverlayKind[]): string[] {
  return kinds.flatMap((k) => OVERLAY_LOCAL_KEY_PREFIXES[k] ?? [])
}

/** Remove every key under the prefixes. Returns how many went. */
export function clearOverlayLocalKeys(
  storage: Pick<Storage, 'length' | 'key' | 'removeItem'>,
  prefixes: readonly string[]
): number {
  const doomed: string[] = []
  for (let i = 0; i < storage.length; i++) {
    const k = storage.key(i)
    if (k != null && prefixes.some((p) => k.startsWith(p))) doomed.push(k)
  }
  for (const k of doomed) storage.removeItem(k)
  return doomed.length
}
