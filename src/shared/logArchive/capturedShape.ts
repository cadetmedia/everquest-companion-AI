// shared/logArchive/capturedShape.ts — a module's state as a segment keeps it on disk: the parts the
// engine serves apart from it put back, so files old and new keep one shape. `gaps` gets its
// kill-faction proof lines (gapKillFactionSamples.ts), `buffs` its message overlay
// (buffsMessageOverlay.ts). Used by the app's own capture and the second engine's.

import { buffsWithOverlay, MESSAGE_OVERLAY_MODULE } from '../buffsMessageOverlay'
import { gapsWithSamples, KILL_FACTION_SAMPLES_MODULE } from '../gapKillFactionSamples'

/** `read` asks the same engine for another module's state; a failed read leaves the state as it came. */
export function capturedState(module: string, state: unknown, read: (module: string) => Promise<unknown>): Promise<unknown> {
  if (module === 'gaps') return gapsWithSamples(state, () => read(KILL_FACTION_SAMPLES_MODULE))
  if (module === 'buffs') return buffsWithOverlay(state, () => read(MESSAGE_OVERLAY_MODULE))
  return Promise.resolve(state)
}
