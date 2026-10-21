// GapsOverlayPublisher — the Gaps list with the Gaps tab closed, for the Wiki Gaps overlay (owner,
// 2026-10-20: he plays with the tab closed, and the overlay has to keep up with his zone, his kills
// and his Done marks all the same). It renders nothing: it runs the tab's own pipeline
// (useGapsList) and hands it to the feed. unreleasedGaps.tsx mounts it only while the overlay is
// open and the tab is not, so exactly one copy of the pipeline runs, and none with the overlay shut.

import { useGapsList } from './useGapsList'
import { useGapsOverlayFeed } from './useGapsOverlayFeed'

export default function GapsOverlayPublisher(): null {
  useGapsOverlayFeed(useGapsList())
  return null
}
