// The Gaps tab's narrowing and copy text, from the engine's rows (src/shared/gaps.ts).

import { test } from 'node:test'
import assert from 'node:assert/strict'
import {
  gapDetailsText,
  gapsAsText,
  gapsCaption,
  tallyText,
  visibleGaps,
  type GapDetails,
  type GapRow,
  type GapsSnap
} from '../src/shared/gaps'

type Where = [domain: GapRow['domain'], name: string, kinds: GapRow['kinds'], count: number]
const row = ([domain, name, kinds, count]: Where, details: Partial<GapDetails> = {}): GapRow => ({
  domain,
  name,
  kinds,
  count,
  first: '2026-10-06 18:12:26',
  last: '2026-10-10 17:48:36',
  details: { samples: [], ...details }
})

const ROWS: GapRow[] = [
  row(['item', 'Wooden Heart', ['looted'], 11], {
    zones: { entries: [{ name: 'The Southern Plains of Karana', n: 11 }], distinct: 1 },
    sources: { entries: [{ name: 'a treant', n: 11 }], distinct: 1 },
    dispositions: { entries: [{ name: 'sold', n: 9 }], distinct: 1 },
    samples: ['[Sat Oct 10 17:48:36 2026] You looted a Wooden Heart from a treant\'s corpse and sold it for free.']
  }),
  row(['item', 'Envenomed Bolt', ['crafted'], 2]),
  row(['mob', 'a fire giant warrior', ['killed', 'dropped-by'], 93], {
    drops: {
      entries: [
        { name: 'Throwing Boulder +4', n: 16 },
        { name: 'Fire Giant Toes', n: 9 }
      ],
      distinct: 13
    },
    killers: { entries: [{ name: 'you', n: 9 }], distinct: 1 }
  }),
  row(['mob', 'Cazic-Thule', ['considered', 'killed'], 20]),
  row(['spell', 'Heroic Leap', ['cast'], 958], { casters: { entries: [{ name: 'you', n: 958 }], distinct: 1 } })
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

test('tallyText names the entries with counts and says how many a capped list left out', () => {
  assert.equal(tallyText({ entries: [{ name: 'a treant', n: 11 }], distinct: 1 }), 'a treant (11)')
  assert.equal(
    tallyText({ entries: [{ name: 'Throwing Boulder +4', n: 16 }, { name: 'Fire Giant Toes', n: 9 }], distinct: 13 }),
    'Throwing Boulder +4 (16), Fire Giant Toes (9) +11 more'
  )
})

test('gapDetailsText is the row line, then only the lists it has, then its samples, each indented', () => {
  assert.equal(
    gapDetailsText(ROWS[0]),
    [
      'Wooden Heart\tlooted\t11\t2026-10-06 18:12:26\t2026-10-10 17:48:36',
      '\tzones: The Southern Plains of Karana (11)',
      '\tfrom: a treant (11)',
      '\tdisposed: sold (9)',
      "\tsample: [Sat Oct 10 17:48:36 2026] You looted a Wooden Heart from a treant's corpse and sold it for free."
    ].join('\n')
  )
  assert.equal(
    gapDetailsText(ROWS[2]),
    [
      'a fire giant warrior\tkilled, dropped-by\t93\t2026-10-06 18:12:26\t2026-10-10 17:48:36',
      '\tdropped: Throwing Boulder +4 (16), Fire Giant Toes (9) +11 more',
      '\tkilled by: you (9)'
    ].join('\n')
  )
  assert.equal(gapDetailsText(ROWS[1]), 'Envenomed Bolt\tcrafted\t2\t2026-10-06 18:12:26\t2026-10-10 17:48:36')
})

test('gapsAsText is the header then every row with its details', () => {
  assert.equal(
    gapsAsText(visibleGaps(ROWS, 'spell', '')),
    ['Name\tSeen as\tTimes\tFirst\tLast', 'Heroic Leap\tcast\t958\t2026-10-06 18:12:26\t2026-10-10 17:48:36', '\tcast by: you (958)'].join('\n')
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
