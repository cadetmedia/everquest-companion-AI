// overlayUnpark — whether an un-park also brings the overlays back on top (owner, 2026-10-20: after
// a screenshot and a paste into Paint "the overlays don't reappear, i have to click that button").
//
// Un-parking is one opacity flip with no z-order change (windows.ts parkOverlays), because a
// re-raise on every refocus is what made alt-tabbing hitch. But a long time away — a screenshot
// tool, Paint, a browser — is when the game comes back above them, and the dev log of the report
// showed exactly that: un-parked, still underneath, fixed by "Bring overlays to front". So only an
// un-park after RAISE_AFTER_AWAY_MS away re-raises: quick alt-tabs (1 to 3 s in that log) stay a
// pure opacity flip, and one raise after a long absence costs nothing a player can feel.

/** How long away from the game before coming back re-raises the overlays. */
export const RAISE_AFTER_AWAY_MS = 5_000

/** Whether an un-park at `now` re-raises, given when the overlays were parked (null: never). */
export function raiseOnUnpark(parkedAt: number | null, now: number): boolean {
  return parkedAt !== null && now - parkedAt >= RAISE_AFTER_AWAY_MS
}
