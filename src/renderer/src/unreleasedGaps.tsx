// unreleasedGaps — the UNRELEASED gate's reach into a component tree, for the Gaps tab.
//
// unreleasedSlayer.tsx's arrangement: `UNRELEASED` is anchored on `import.meta.env.DEV`
// (devFlags.ts), a literal `false` in every `electron-vite build`, so the lazy const below
// compiles to `null` there, the dynamic `import()` is dead code, and `features/gaps/**` leaves no
// trace in `out/renderer`. The view check lives here, not in App.tsx, for the SpellDrill precedent
// that file states.

import { type JSX, Suspense, lazy } from 'react'
import { CircularProgress } from '@mui/material'
import { UNRELEASED } from './devFlags'
import type { View } from './appViews'

const LazyGapsView = UNRELEASED ? lazy(() => import('./features/gaps/GapsView')) : null

/** The Gaps tab: nothing at all in a build without the flag, or on any other view. */
export default function UnreleasedGapsView({ view, viewKey }: { view: View; viewKey: string }): JSX.Element | null {
  if (!LazyGapsView || view !== 'gaps') return null
  return (
    <Suspense fallback={<CircularProgress size={20} />}>
      <LazyGapsView key={viewKey} />
    </Suspense>
  )
}
