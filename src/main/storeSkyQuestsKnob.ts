// The Sky quest overlay's one persisted knob (sky-quest-overlay): whether it draws item icons.
// Rebuilt rather than trusted, like the XP window's knobs beside it: only that kind keeps it, and
// only as a real boolean. Absent means on.

import type { OverlayConfig, OverlayKind } from '../shared/types'

export function applySkyQuestsKnob(kind: OverlayKind, next: OverlayConfig): void {
  if (kind === 'skyQuests' && typeof next.skyIcons === 'boolean') return
  delete next.skyIcons
}
