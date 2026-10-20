// ============================================================================
// mergeGaps.test.mts — the `gaps` module across an archive and the live log (owner, 2026-10-11:
// the Gaps tab counts the archived history too).
// ============================================================================
//
// Hand-built snapshots in the shape gaps.rs serves: rows most mentioned first, capped per domain,
// each with its tallies (eight entries plus the distinct count), copper sums and last three lines.

import { test } from 'node:test'
import assert from 'node:assert/strict'
import { mergeGaps } from '../src/shared/logArchive/mergeGaps'
import { hasMergeRule, mergeModule } from '../src/shared/logArchive/mergeRules'
import { CAPTURED_MODULES } from '../src/shared/logArchive/modules'

interface Tally {
  entries: { name: string; n: number }[]
  distinct: number
  all?: string[]
}
type Details = Record<string, Tally | number | string[] | undefined> & { samples: string[] }
interface Row {
  domain: string
  name: string
  kinds: string[]
  count: number
  first: string
  last: string
  details: Details
}
interface Snap {
  rows: Row[]
  totals: Record<string, number>
  seen: Record<string, number>
}

const tally = (...pairs: [string, number][]): Tally => ({ entries: pairs.map(([name, n]) => ({ name, n })), distinct: pairs.length })

function row(domain: string, name: string, count: number, extra: Partial<Row> = {}): Row {
  return { domain, name, kinds: ['looted'], count, first: '2026-09-01 10:00:00', last: '2026-09-01 10:00:00', details: { samples: [] }, ...extra }
}

/** A snapshot whose totals and seen are its own row counts, like a fold with nothing capped. */
function snap(rows: Row[], seen: Record<string, number> = {}): Snap {
  const totals: Record<string, number> = { item: 0, mob: 0, spell: 0 }
  for (const r of rows) totals[r.domain] = (totals[r.domain] ?? 0) + 1
  return { rows, totals, seen: { item: 0, mob: 0, spell: 0, ...seen } }
}

test('gaps: the rule is in the lookup and the module is captured', () => {
  assert.ok(hasMergeRule('gaps'))
  assert.ok(CAPTURED_MODULES.includes('gaps'))
})

test('gaps: a name on both sides adds up, its details merged', () => {
  const older = snap([
    row('item', 'Copper Ring', 12, {
      kinds: ['looted', 'received'],
      first: '2026-08-12 09:00:00',
      last: '2026-10-06 20:00:00',
      details: {
        zones: tally(['Blackburrow', 8], ['Qeynos Hills', 4]),
        sources: tally(['a gnoll pup', 12]),
        sales: tally(['1 gold 2 silver', 10], ['free', 2]),
        salesCopper: 1200,
        samples: ['[1] a', '[2] b', '[3] c']
      }
    })
  ])
  const newer = snap([
    row('item', 'Copper Ring', 2, {
      kinds: ['bought', 'looted'],
      first: '2026-10-07 08:00:00',
      last: '2026-10-08 08:00:00',
      details: {
        zones: tally(['Qeynos Hills', 2]),
        sources: tally(['Merchant Bob', 2]),
        paid: tally(['5 gold', 2]),
        paidCopper: 1000,
        samples: ['[4] d']
      }
    })
  ])
  const m = mergeGaps(older, newer) as Snap
  assert.equal(m.rows.length, 1)
  const r = m.rows[0]
  assert.equal(r.count, 14)
  assert.deepEqual(r.kinds, ['looted', 'received', 'bought'], "older's order, then the newer side's new kinds")
  assert.equal(r.first, '2026-08-12 09:00:00')
  assert.equal(r.last, '2026-10-08 08:00:00')
  assert.deepEqual(r.details.zones, { entries: [{ name: 'Blackburrow', n: 8 }, { name: 'Qeynos Hills', n: 6 }], distinct: 2 })
  assert.deepEqual(r.details.sources, { entries: [{ name: 'a gnoll pup', n: 12 }, { name: 'Merchant Bob', n: 2 }], distinct: 2 })
  assert.deepEqual(r.details.sales, tally(['1 gold 2 silver', 10], ['free', 2]), 'a list on one side only is kept as it was')
  assert.deepEqual(r.details.paid, tally(['5 gold', 2]))
  assert.equal(r.details.salesCopper, 1200)
  assert.equal(r.details.paidCopper, 1000)
  assert.deepEqual(r.details.samples, ['[2] b', '[3] c', '[4] d'], 'the last three lines, oldest first')
  assert.deepEqual(m.totals, { item: 1, mob: 0, spell: 0 }, 'a name on both sides is one name')
})

test('gaps: tallies re-rank by count then name, keep eight, and distinct never shrinks below a side', () => {
  const eight: [string, number][] = [['a', 9], ['b', 8], ['c', 7], ['d', 6], ['e', 5], ['f', 4], ['g', 3], ['h', 2]]
  const older = snap([row('mob', 'a gorgon', 1, { details: { zones: { ...tally(...eight), distinct: 20 }, samples: [] } })])
  const newer = snap([row('mob', 'a gorgon', 1, { details: { zones: tally(['h', 10], ['z', 9]), samples: [] } })])
  const zones = (mergeGaps(older, newer) as Snap).rows[0].details.zones as Tally
  assert.deepEqual(
    zones.entries.map((e) => `${e.name}:${e.n}`),
    ['h:12', 'a:9', 'z:9', 'b:8', 'c:7', 'd:6', 'e:5', 'f:4']
  )
  assert.equal(zones.distinct, 20, "the older side's capped list said 20; the union of what was served is 9")
})

test('gaps: a name on one side is kept, mobs join case-folded with the lowercase spelling winning', () => {
  const older = snap([row('mob', 'A gorgon', 3, { kinds: ['considered'] }), row('spell', 'Minor Shielding', 1, { kinds: ['cast'] })], { mob: 5, spell: 2 })
  const newer = snap([row('mob', 'a gorgon', 2, { kinds: ['killed'] }), row('item', 'Rusty Dagger', 1)], { mob: 4, spell: 7 })
  const m = mergeGaps(older, newer) as Snap
  assert.deepEqual(
    m.rows.map((r) => [r.domain, r.name, r.count, r.kinds]),
    [
      ['item', 'Rusty Dagger', 1, ['looted']],
      ['mob', 'a gorgon', 5, ['considered', 'killed']],
      ['spell', 'Minor Shielding', 1, ['cast']]
    ],
    'the domains in the fold’s order'
  )
  assert.deepEqual(m.totals, { item: 1, mob: 1, spell: 1 })
  assert.deepEqual(m.seen, { item: 0, mob: 5, spell: 7 }, 'the larger side’s; the union of two counts is unknowable')
})

test('gaps: rows re-sort by count then name and re-cap at 500 a domain; totals keep a side’s own larger count', () => {
  const many = (from: number, n: number): Row[] => Array.from({ length: n }, (_, i) => row('item', `Item ${String(from + i).padStart(4, '0')}`, 1))
  const older = { ...snap(many(0, 500)), totals: { item: 650, mob: 0, spell: 0 } }
  const newer = snap([row('item', 'Item 0001', 5), row('item', 'Item 0000', 5), row('item', 'Item 9999', 1)])
  const m = mergeGaps(older, newer) as Snap
  assert.equal(m.rows.length, 500)
  assert.deepEqual(m.rows.slice(0, 2).map((r) => [r.name, r.count]), [['Item 0000', 6], ['Item 0001', 6]])
  assert.ok(!m.rows.some((r) => r.name === 'Item 9999'), 'the rows past the cap are counted, not served')
  assert.equal(m.totals.item, 650, '501 names joined, but the older side already said 650')
})

test('gaps: a state that is not a gaps snapshot yields null, and the lookup folds an archive under the live state', () => {
  const live = snap([row('item', 'Copper Ring', 2)], { item: 300 })
  assert.equal(mergeGaps({ rows: 'x', totals: {}, seen: {} }, live), null)
  assert.equal(mergeGaps({ rows: [] }, live), null)
  assert.equal(mergeGaps(live, []), null)
  const archived = snap([row('item', 'Copper Ring', 12)], { item: 250 })
  const merged = mergeModule('gaps', [archived], live)
  assert.equal(merged.used, 1)
  assert.deepEqual((merged.state as Snap).rows.map((r) => [r.name, r.count]), [['Copper Ring', 14]])
  assert.equal((merged.state as Snap).seen.item, 300)
})

test('gaps: the zones list keeps every name across both sides, for the "this zone" filter', () => {
  const older = snap([row('item', 'Bone Chips', 1, { details: { zones: { ...tally(['Befallen', 3]), all: ['Befallen'] }, samples: [] } })])
  const newer = snap([row('item', 'Bone Chips', 1, { details: { zones: tally(['Befallen 4 (Refined)', 2]), samples: [] } })])
  const zones = (mergeGaps(older, newer) as Snap).rows[0].details.zones as Tally
  assert.deepEqual(zones.all, ['Befallen', 'Befallen 4 (Refined)'], 'a side without `all` gives its served names')
  const bare = (mergeGaps(newer, newer) as Snap).rows[0].details.zones as Tally
  assert.equal(bare.all, undefined, 'neither side had one, so none is made up')
})

test('mob points from both sides join per mob, each point once', () => {
  const older = { ...snap([]), mobLocs: [{ mob: 'a scout', zone: 'The Feerrott', points: [[-791, 173, -12]] }] }
  const newer = { ...snap([]), mobLocs: [{ mob: 'A scout', zone: 'The Feerrott', points: [[-791, 173, -12], [10, -21, 1]] }] }
  const m = mergeGaps(older, newer) as Snap & { mobLocs: { mob: string; points: number[][] }[] }
  assert.deepEqual(m.mobLocs, [{ mob: 'a scout', zone: 'The Feerrott', points: [[-791, 173, -12], [10, -21, 1]] }])
})

test('kill-faction pairs from both sides join case-folded, counts added, the newer zone kept', () => {
  const older = { ...snap([]), killFactions: [{ mob: 'a gnoll', faction: 'Sabertooths of Blackburrow', n: 3, zone: 'Blackburrow' }] }
  const newer = {
    ...snap([]),
    killFactions: [
      { mob: 'A gnoll', faction: 'sabertooths of blackburrow', n: 2, zone: 'Qeynos Hills' },
      { mob: 'a rat', faction: 'Pests', n: 1, zone: '' }
    ]
  }
  const m = mergeGaps(older, newer) as Snap & { killFactions: { mob: string; n: number; zone: string }[] }
  assert.deepEqual(
    m.killFactions.map((p) => [p.mob, p.n, p.zone]),
    [
      ['a gnoll', 5, 'Qeynos Hills'],
      ['a rat', 1, '']
    ]
  )
})

test('the proof lines of a kill-faction pair join across the archive and the live log, newer last, the last three kills kept (owner, 2026-10-20)', () => {
  const kill = (stamp: string, by: number): string[] => [
    `[${stamp}] Your faction standing with Grobb Merchants has been adjusted by ${String(by)}.`,
    `[${stamp}] You have slain a troll slayer!`
  ]
  const pair = { mob: 'a troll slayer', faction: 'Grobb Merchants', zone: 'Grobb' }
  const older = { ...snap([]), killFactions: [{ ...pair, n: 2, samples: [...kill('Sat Oct 17 20:00:00 2026', 1), ...kill('Sat Oct 17 21:00:00 2026', 2)] }] }
  const newer = { ...snap([]), killFactions: [{ ...pair, n: 2, samples: [...kill('Mon Oct 19 23:56:00 2026', 3), ...kill('Mon Oct 19 23:56:47 2026', 4)] }] }
  const m = mergeGaps(older, newer) as Snap & { killFactions: { n: number; samples?: string[] }[] }
  assert.equal(m.killFactions[0].n, 4)
  assert.deepEqual(m.killFactions[0].samples, [...kill('Sat Oct 17 21:00:00 2026', 2), ...kill('Mon Oct 19 23:56:00 2026', 3), ...kill('Mon Oct 19 23:56:47 2026', 4)])
  const bare = mergeGaps({ ...snap([]), killFactions: [{ ...pair, n: 1 }] }, { ...snap([]), killFactions: [{ ...pair, n: 1 }] }) as Snap & {
    killFactions: { samples?: string[] }[]
  }
  assert.equal(bare.killFactions[0].samples, undefined, 'an older engine serves none, and none is made up')
})

test('mob specials join per mob across the archive and the live log, each once (2026-10-19)', () => {
  const older = { ...snap([]), mobSpecials: [{ mob: 'Lord of Ire', specials: ['Flurries'] }] }
  const newer = { ...snap([]), mobSpecials: [{ mob: 'lord of ire', specials: ['Flurries', 'Rampages'] }] }
  const m = mergeGaps(older, newer) as Snap & { mobSpecials: { mob: string; specials: string[] }[] }
  assert.deepEqual(m.mobSpecials, [{ mob: 'Lord of Ire', specials: ['Flurries', 'Rampages'] }])
})

test('gaps: corpse coin joins per mob, the paying kills added and each coin widened', () => {
  const older = { ...snap([]), mobCoin: [{ mob: 'a hill giant', n: 3, min: [5, 0, 0, 0], max: [40, 9, 9, 9] }] }
  const newer = { ...snap([]), mobCoin: [{ mob: 'A hill giant', n: 2, min: [2, 1, 0, 0], max: [51, 8, 9, 9] }, { mob: 'a bat', n: 1, min: [0, 0, 1, 2], max: [0, 0, 1, 2] }] }
  const m = mergeGaps(older, newer) as Snap & { mobCoin: { mob: string; n: number; min: number[]; max: number[] }[] }
  assert.deepEqual(m.mobCoin, [
    { mob: 'a hill giant', n: 5, min: [2, 0, 0, 0], max: [51, 9, 9, 9] },
    { mob: 'a bat', n: 1, min: [0, 0, 1, 2], max: [0, 0, 1, 2] }
  ])
})
