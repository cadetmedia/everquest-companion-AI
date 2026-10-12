// achievements/listWindow.ts — the list's window over rows of DIFFERENT heights.
//
// lib/useWindowedRows windows rows of one height, and this list has three kinds: a heading, a
// closed achievement, and an achievement opened into its lines, which is as tall as its lines make
// it and is measured (AchievementRow reports its height while it is open). So the hook is asked for
// a window in PIXELS, one "row" per pixel of the whole list, and the pixel range it hands back is
// mapped onto rows through their offsets here: a row is in the window when any of it is in the
// range. The two spacers reserve what is above and below exactly as the hook's do, so the scrollbar
// describes the whole list and a scroll lands where it points.
//
// THE HEADING ABOVE THE WINDOW IS PINNED: the headings are sticky, and the one a reader is under is
// usually above the first row in the window. It is mounted first, before the top spacer, which is
// shorter by its height, so the sum of everything mounted is still the whole list.

import { useMemo, type RefObject } from 'react'
import type { ListRow } from '@shared/achievements/listRows'
import { useWindowedRows } from '../../lib/useWindowedRows'

/** Pixels rendered above and below the viewport, so a scroll finds its rows already mounted. */
const OVERSCAN_PX = 400

export interface ListWindow {
  /** First row to render (inclusive). */
  start: number
  /** One past the last row to render (exclusive). */
  end: number
  /** The heading above `start` to keep on screen, or -1 when `start` is a heading or none is above it. */
  pinned: number
  /** Height (px) of the spacer before the rendered rows, after the pinned heading. */
  topPad: number
  /** Height (px) of the spacer after the rendered rows. */
  bottomPad: number
  /** The whole list's height (px). */
  total: number
}

/** Each row's top edge, and one more: the end of the list. */
export function rowOffsets(heights: readonly number[]): number[] {
  const offsets = new Array<number>(heights.length + 1)
  let at = 0
  for (let i = 0; i < heights.length; i++) {
    offsets[i] = at
    at += Math.max(0, heights[i])
  }
  offsets[heights.length] = at
  return offsets
}

/** The last row whose top edge is at or above `px`: the row `px` falls in. 0 before the list. */
function rowAt(offsets: readonly number[], px: number): number {
  let lo = 0
  let hi = Math.max(0, offsets.length - 2)
  while (lo < hi) {
    const mid = (lo + hi + 1) >> 1
    if (offsets[mid] <= px) lo = mid
    else hi = mid - 1
  }
  return lo
}

function headingAbove(rows: readonly ListRow[], start: number): number {
  if (rows[start]?.kind === 'heading') return -1
  for (let i = start - 1; i >= 0; i--) if (rows[i].kind === 'heading') return i
  return -1
}

/**
 * The rows that overlap the pixel range [from, to), the heading pinned above them, and the spacers.
 * Total: pinned heading's height + topPad + the rendered rows' heights + bottomPad === total.
 */
export function windowRange(
  rows: readonly ListRow[],
  offsets: readonly number[],
  from: number,
  to: number
): ListWindow {
  const n = rows.length
  const total = offsets[n] ?? 0
  if (n === 0) return { start: 0, end: 0, pinned: -1, topPad: 0, bottomPad: 0, total }
  const start = rowAt(offsets, from)
  const end = Math.max(start, Math.min(n, rowAt(offsets, Math.max(from, to - 1)) + 1))
  const pinned = headingAbove(rows, start)
  const pinnedHeight = pinned >= 0 ? offsets[pinned + 1] - offsets[pinned] : 0
  return {
    start,
    end,
    pinned,
    topPad: offsets[start] - pinnedHeight,
    bottomPad: total - offsets[end],
    total
  }
}

/** The window over `rows`, each `heights[i]` tall, inside the scroll box `scrollRef` names. */
export function useListWindow(
  rows: readonly ListRow[],
  heights: readonly number[],
  scrollRef: RefObject<HTMLElement | null>
): ListWindow {
  const offsets = useMemo(() => rowOffsets(heights), [heights])
  const total = offsets[offsets.length - 1] ?? 0
  // One hook "row" per pixel: its slice is the pixel range, its pads are not used.
  const px = useWindowedRows({ count: total, rowHeight: 1, scrollRef, overscan: OVERSCAN_PX })
  return useMemo(() => windowRange(rows, offsets, px.start, px.end), [rows, offsets, px.start, px.end])
}
