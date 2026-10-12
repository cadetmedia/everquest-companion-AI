/**
 * The Achievements list's window over rows of different heights (features/achievements/listWindow.ts).
 *
 * THE INVARIANT: whatever the pixel range, the pinned heading, the two spacers and the rendered
 * rows add up to the whole list, or the scrollbar describes a list of a different length than the
 * one being read. Asserted over a list of headings, closed rows and one opened (taller) row, for
 * ranges at the top, in the middle, past the end and empty.
 */
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { listRows, rowKey, type ListRow } from '../src/shared/achievements/listRows'
import { rowOffsets, windowRange } from '../src/renderer/src/features/achievements/listWindow'
import type { BookAchievement, BookGroup } from '../src/shared/outputs/achievementBook'

const HEADING = 25
const ROW = 55

function group(category: string): BookGroup {
  return { family: 'General', category, achievements: [] } as unknown as BookGroup
}
function achievement(name: string): BookAchievement {
  return { name, done: false, components: [] } as unknown as BookAchievement
}

const ROWS: ListRow[] = listRows([
  { group: group('Slayer'), achievements: [achievement('a'), achievement('b'), achievement('c')] },
  { group: group('Hunter'), achievements: [achievement('d'), achievement('e')] }
])
// Row 2 ('b') is open and 151 px tall.
const HEIGHTS = ROWS.map((r, i) => (r.kind === 'heading' ? HEADING : i === 2 ? 151 : ROW))
const OFFSETS = rowOffsets(HEIGHTS)

function mounted(from: number, to: number): number {
  const w = windowRange(ROWS, OFFSETS, from, to)
  const pinned = w.pinned >= 0 ? HEIGHTS[w.pinned] : 0
  let rows = 0
  for (let i = w.start; i < w.end; i++) rows += HEIGHTS[i]
  return pinned + w.topPad + rows + w.bottomPad
}

test('listRows flattens sections into heading rows and achievement rows, keyed uniquely', () => {
  assert.deepEqual(
    ROWS.map((r) => r.kind),
    ['heading', 'achievement', 'achievement', 'achievement', 'heading', 'achievement', 'achievement']
  )
  assert.equal(new Set(ROWS.map(rowKey)).size, ROWS.length)
  assert.equal(rowKey(ROWS[0]), '#Slayer')
  assert.equal(rowKey(ROWS[1]), 'Slayer/a')
})

test('offsets are the running sum, with the list end last', () => {
  assert.deepEqual(rowOffsets([25, 55, 151]), [0, 25, 80, 231])
  assert.deepEqual(rowOffsets([]), [0])
  assert.equal(OFFSETS[ROWS.length], 25 + 55 + 151 + 55 + 25 + 55 + 55)
})

test('the window covers the rows the range touches, and the sum is always the whole list', () => {
  const total = OFFSETS[ROWS.length]
  // The top: starts at the first heading, nothing pinned.
  const top = windowRange(ROWS, OFFSETS, -400, 100)
  assert.equal(top.start, 0)
  assert.equal(top.pinned, -1)
  assert.equal(top.topPad, 0)
  assert.equal(top.end, 3) // heading, a, b (b starts at 80 < 100)
  // The middle: from inside 'c' (231..286) to inside 'd'.
  const mid = windowRange(ROWS, OFFSETS, 240, 320)
  assert.equal(mid.start, 3)
  assert.equal(mid.pinned, 0)
  assert.equal(mid.topPad, 231 - HEADING)
  assert.equal(mid.end, 6)
  // A start on a heading pins nothing.
  const onHeading = windowRange(ROWS, OFFSETS, 286, 300)
  assert.equal(onHeading.start, 4)
  assert.equal(onHeading.pinned, -1)
  // Past the end: the last row, pads to the end.
  const past = windowRange(ROWS, OFFSETS, total + 500, total + 900)
  assert.equal(past.start, ROWS.length - 1)
  assert.equal(past.end, ROWS.length)
  assert.equal(past.bottomPad, 0)
  for (const [from, to] of [[-400, 100], [240, 320], [286, 300], [0, 0], [total + 500, total + 900], [-1000, total + 1000]]) {
    assert.equal(mounted(from, to), total, `range ${from}..${to}`)
  }
})

test('an empty list windows nothing', () => {
  assert.deepEqual(windowRange([], rowOffsets([]), 0, 800), {
    start: 0,
    end: 0,
    pinned: -1,
    topPad: 0,
    bottomPad: 0,
    total: 0
  })
})
