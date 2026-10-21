// unreleasedGaps — the UNRELEASED gate's reach into a component tree, for the Gaps tab.
//
// unreleasedSlayer.tsx's arrangement: `UNRELEASED` is anchored on `import.meta.env.DEV`
// (devFlags.ts), a literal `false` in every `electron-vite build`, so the lazy const below
// compiles to `null` there, the dynamic `import()` is dead code, and `features/gaps/**` leaves no
// trace in `out/renderer`. The view check lives here, not in App.tsx, for the SpellDrill precedent
// that file states.

import { type ComponentType, type JSX, Suspense, lazy, memo } from 'react'
import { CircularProgress } from '@mui/material'
import { UNRELEASED } from './devFlags'
import type { View } from './appViews'
import { useOverlayOpen } from './lib/useOverlayOpen'
import { useGapsTabMounted } from './lib/gapsTabMounted'

const LazyGapsView = UNRELEASED ? lazy(() => import('./features/gaps/GapsView')) : null
const LazyGapsOverlayPublisher = UNRELEASED ? lazy(() => import('./features/gaps/GapsOverlayPublisher')) : null

/** The Gaps tab: nothing at all in a build without the flag, or on any other view. */
export default function UnreleasedGapsView({ view, viewKey }: { view: View; viewKey: string }): JSX.Element | null {
  if (!LazyGapsView || view !== 'gaps') return null
  return (
    <Suspense fallback={<CircularProgress size={20} />}>
      <LazyGapsView key={viewKey} />
    </Suspense>
  )
}

/** The publisher while the Wiki Gaps overlay is open and the tab, which feeds it itself, is not. */
function GapsOverlayFeedGate({ Publisher }: { Publisher: ComponentType }): JSX.Element | null {
  const open = useOverlayOpen('gaps')
  const tabMounted = useGapsTabMounted()
  if (!open || tabMounted) return null
  return (
    <Suspense fallback={null}>
      <Publisher />
    </Suspense>
  )
}

/**
 * The Wiki Gaps overlay's feed with the Gaps tab closed (owner, 2026-10-20). Mounted once, in
 * AppCelebrations, so it runs on every tab; memo'd, so that component's own re-renders (every kill,
 * loot and level push) stop here. Nothing at all in a build without the flag.
 */
export const UnreleasedGapsOverlayFeed = memo(function UnreleasedGapsOverlayFeed(): JSX.Element | null {
  return LazyGapsOverlayPublisher ? <GapsOverlayFeedGate Publisher={LazyGapsOverlayPublisher} /> : null
})
