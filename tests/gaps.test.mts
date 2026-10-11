// The Gaps tab's narrowing and clipboard text, from the engine's rows (src/shared/gaps.ts).

import { test } from 'node:test'
import assert from 'node:assert/strict'
import { gapsAsText, gapsCaption, visibleGaps, type GapRow, type GapsSnap } from '../src/shared/gaps'

const row = (domain: GapRow['domain'], name: string, kinds: GapRow['kinds'], count: number): GapRow => ({
  domain,
  name,
  kinds,
  count,
  first: '2026-10-06 18:12:26',
  last: '2026-10-10 17:48:36'
})

const ROWS: GapRow[] = [
  row('item', 'Wooden Heart', ['looted'], 11),
  row('item', 'Envenomed Bolt', ['crafted'], 2),
  row('mob', 'a fire giant warrior', ['killed', 'dropped-by'], 93),
  row('mob', 'Cazic-Thule', ['considered', 'killed'], 20),
  row('spell', 'Heroic Leap', ['cast'], 958)
]

test('visibleGaps keeps one domain in the served order and matches the query against name and kinds', () => {
  assert.deepEqual(
    visibleGaps(ROWS, 'mob', '').map((r) => r.name),
    ['a fire giant warrior', 'Cazic-Thule']
  )
  assert.deepEqual(
    visibleGaps(ROWS, 'mob', 'CAZIC').map((r) => r.name),
    ['Cazic-Thule']
  )
  assert.deepEqual(
    visibleGaps(ROWS, 'item', ' craft ').map((r) => r.name),
    ['Envenomed Bolt']
  )
  assert.deepEqual(visibleGaps(ROWS, 'spell', 'wooden'), [])
})

test('gapsAsText is tab-separated with a header, one line per row', () => {
  assert.equal(
    gapsAsText(visibleGaps(ROWS, 'mob', '')),
    [
      'Name\tSeen as\tTimes\tFirst\tLast',
      'a fire giant warrior\tkilled, dropped-by\t93\t2026-10-06 18:12:26\t2026-10-10 17:48:36',
      'Cazic-Thule\tconsidered, killed\t20\t2026-10-06 18:12:26\t2026-10-10 17:48:36'
    ].join('\n')
  )
  assert.equal(gapsAsText([]), 'Name\tSeen as\tTimes\tFirst\tLast')
})

test('gapsCaption reads the totals and the denominator, and an absent domain reads as zero', () => {
  const snap: GapsSnap = {
    rows: ROWS,
    totals: { item: 29, mob: 76, spell: 34 },
    seen: { item: 611, mob: 468, spell: 428 }
  }
  assert.equal(gapsCaption(snap, 'mob'), '76 of 468 names')
  const bare = { rows: [], totals: {}, seen: {} } as unknown as GapsSnap
  assert.equal(gapsCaption(bare, 'item'), '0 of 0 names')
})
