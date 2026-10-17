// THE XP WINDOW'S PERSISTED KNOBS, moved out of store.ts unchanged when that file reached its
// 400-code-line ceiling (map-waypoints, 2026-10-13).

import type { OverlayConfig, OverlayKind } from '../shared/types'
// The XP overlay's two persisted knobs (JOS-195) — each validated by the module that owns its
// meaning, never by a predicate written here. It was four until JOS-332 moved the denominator and
// the tier membership out of the store entirely (`applyXpOverlayKnobs` says where they went), which
// is why the two normalizers that validated them are no longer imported.
import { normalizeXpRows } from '../shared/xpOverlay'
import { isSliceId } from '../shared/timeslice'

/**
 * THE XP WINDOW'S TWO REMAINING KNOBS (JOS-195 rows + slice), REBUILT RATHER THAN TRUSTED — the
 * same argument as the drill and the toast blob beside them: a renderer patch must not be able to
 * widen what is persisted, and ABSENT is a real answer for both (every row; the current zone this
 * session).
 *
 * IT USED TO BE FOUR. The denominator (`xpBasis`, JOS-288) and the tier membership (`xpZoneScope`,
 * JOS-291) were retired from the store by JOS-332: they are the same two controls the Leveling tab
 * draws, so keeping a per-window copy meant two states behind one label — see the note where they
 * used to be declared in `shared/types.ts`. They are now one EPHEMERAL app-wide selection in
 * `src/main/scopeSelection.ts`, rebuilt at ITS handler by the same not-trusted rule. Both keys are
 * simply no longer preserved here, so an older store sheds them on its first patch, exactly the way
 * `getOverlayConfig` sheds `topN`.
 *
 * Its own function for `applyTimerOverlayKnobs`' reason, one file over: extra knobs are extra
 * branches, and `setOverlayConfig` is at the measured complexity ceiling. Both are deleted on every
 * other kind, so a malformed patch cannot grow an xp knob on a damage meter.
 */
export function applyXpOverlayKnobs(kind: OverlayKind, next: OverlayConfig): void {
  // `normalizeXpRows` drops unknown row ids, so a hand-edited store cannot switch on a row this
  // build does not have.
  const xpRows = normalizeXpRows(next.xpRows)
  if (xpRows && kind === 'xp') next.xpRows = xpRows
  else delete next.xpRows
  // The retired pair, dropped WHATEVER the kind — a store written by an older build carries them
  // and nothing reads them any more, so preserving them would leave a dead choice on disk that
  // silently disagrees with the live one.
  const retired = next as OverlayConfig & { xpBasis?: unknown; xpZoneScope?: unknown }
  delete retired.xpBasis
  delete retired.xpZoneScope
  // The slice id is checked against the closed union, never against what the log can currently
  // define: `resolveSliceId` in the renderer already degrades a pick this record cannot answer, and
  // a store that forgot the user's choice because they happened to relaunch mid-session would be
  // the same bug from the other direction.
  const xpSlice = next.xpSlice
  if (kind === 'xp' && isSliceId(xpSlice)) next.xpSlice = xpSlice
  else delete next.xpSlice
}
