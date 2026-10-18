// durationText.ts — the leveling surfaces' SPAN spelling: `2h 41m` / `38m` / `45s` / `3d 4h`.
//
// ONE implementation for two layers. The renderer's leveling feature formats range spans with it
// (`levelChartGeometry.fmtDuration` re-exports this), and `currentLevel.ts` words a stated level's
// age with it (`… 2h 10m ago`). `src/shared` may not import from `src/renderer`, so it lives here.
//
// Pure and dependency-free, so the node test runner and the XP overlay bundle can both import it.

/**
 * `3d 4h` / `2h 10m` / `14m` / `31s`. Whole seconds, never negative. Days roll over at 48h — a
 * multi-day span would otherwise read `169h 30m`.
 */
export function fmtDuration(ms: number): string {
  const total = Math.max(0, Math.round(ms / 1000))
  const hrs = Math.floor(total / 3600)
  if (hrs >= 48) return `${String(Math.floor(hrs / 24))}d ${String(hrs % 24)}h`
  const mins = Math.floor((total % 3600) / 60)
  if (hrs > 0) return `${String(hrs)}h ${String(mins)}m`
  return mins > 0 ? `${String(mins)}m` : `${String(total % 60)}s`
}
