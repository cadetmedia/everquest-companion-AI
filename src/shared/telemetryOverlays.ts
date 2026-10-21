// Which overlay kinds telemetry may name. `TELEMETRY_OVERLAY_KINDS` is a CLOSED enum the ingest
// Lambda validates, and one unknown value fails the whole batch (the deploy order spelled out in
// telemetry.ts). A window added since the server last learned the list is left out of every
// report instead: never counted, never named, so no build can send a value the server refuses.
// Its own file because telemetry.ts is at the 400-code-line ceiling.

import { TELEMETRY_OVERLAY_KINDS, type TelemetryOverlayKind } from './telemetry'

/** Overlay kinds the app has and the schema does not. Pinned by tests/telemetryContract. */
export const UNREPORTED_OVERLAY_KINDS = ['gaps'] as const

export function isTelemetryOverlayKind(kind: string): kind is TelemetryOverlayKind {
  return (TELEMETRY_OVERLAY_KINDS as readonly string[]).includes(kind)
}
