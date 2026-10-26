// shared/buffsMessageOverlay.ts — the observed-message overlay (Task #36), served apart from `buffs`.
//
// WHY APART (perf review 2026-10-20, second pass item 3). The overlay was 1.22 of the `buffs`
// snapshot's 1.29 MB, and only the Buffs tab's diagnostics panel reads it; the buffs overlay window
// and Loadout re-fetched it on every buff change. The engine now serves it as its own module,
// `messageOverlay` (engine buffs_overlay.rs), and:
//
//   * THE PANEL reads that module while it is open (BuffsView.tsx `OverlayDiagnostics`);
//   * WHAT IS KEPT ON DISK keeps its shape: a captured segment gets the overlay put back into its
//     `buffs` state (`buffsWithOverlay`), so files old and new read the same. The archive merge
//     (mergeBuffStats.ts) never brings an archived overlay back: it belongs to the live log.

import type { MessageOverlay } from './buffTypes'

/** The engine module that serves the overlay (engine buffs_overlay.rs). */
export const MESSAGE_OVERLAY_MODULE = 'messageOverlay'

const isRecord = (x: unknown): x is Record<string, unknown> => x !== null && typeof x === 'object' && !Array.isArray(x)

/** The overlay, or null when `x` is not one (an engine from before the module answers nothing). */
export function messageOverlayOf(x: unknown): MessageOverlay | null {
  return isRecord(x) && Array.isArray(x.messages) ? (x as unknown as MessageOverlay) : null
}

/** A buffs state with the overlay put back; one that carries an overlay already keeps it. */
export function withMessageOverlay(buffs: unknown, overlay: unknown): unknown {
  const o = messageOverlayOf(overlay)
  if (!isRecord(buffs) || buffs.overlay !== undefined || o === null) return buffs
  return { ...buffs, overlay: o }
}

/** A buffs state as captured: the overlay put back. `ask` reads the module; a failed read leaves the state as it came. */
export async function buffsWithOverlay(buffs: unknown, ask: () => Promise<unknown>): Promise<unknown> {
  try {
    return withMessageOverlay(buffs, await ask())
  } catch {
    return buffs
  }
}
