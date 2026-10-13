// zoneHistory.test.mts — your own record per zone, at a level (src/shared/zoneHistory.ts).

import { test } from 'node:test'
import assert from 'node:assert/strict'
import type { ProgressionSnap } from '../src/shared/progressionTypes'
import type { LootEvent } from '../src/shared/types'
import {
  MIN_ACTIVE_MS,
  levelSpans,
  rankHistory,
  zoneHistory,
  type ZoneHistoryRow
} from '../src/shared/zoneHistory'

const MIN = 60_000
const HOUR = 60 * MIN
const T0 = Date.parse('Sat Aug 01 12:00:00 2026')

/**
 * Three hours: Befallen at level 20 for an hour, then a ding to 21 and an hour in Befallen, then
 * an hour at 30 in The Feerrott. A kill every two minutes keeps all of it active.
 */
function snap(): ProgressionSnap {
  const killTs: number[] = []
  for (let t = T0; t < T0 + 3 * HOUR; t += 2 * MIN) killTs.push(t)
  return {
    expTs: [T0 + 30 * MIN, T0 + 90 * MIN, T0 + 150 * MIN],
    expPct: [50, 25, 10],
    expFlag: [0, 0, 0],
    killTs,
    killZone: killTs.map((t) => (t < T0 + 2 * HOUR ? 0 : 1)),
    killCredit: killTs.map(() => 0),
    witnessTs: [], recentKills: [], lootTs: [],
    zoneStart: [T0, T0 + 2 * HOUR],
    zoneEnd: [T0 + 2 * HOUR, 0],
    zoneName: ['Befallen', 'The Feerrott'],
    offlineStart: [], offlineEnd: [], offlineCamped: [],
    levelTs: [T0, T0 + HOUR, T0 + 2 * HOUR],
    levelValue: [20, 21, 30],
    aaGainTs: [T0 + 70 * MIN, T0 + 150 * MIN],
    aaGainAmount: [1, 2],
    coinTs: [T0 + 10 * MIN, T0 + 130 * MIN],
    coinCopper: [4000, 9000],
    deathTs: [T0 + 140 * MIN],
    deathKiller: ['a lizardman'],
    lastTs: T0 + 3 * HOUR,
    windowStart: 0,
    dropped: 0
  }
}

const LOOT: LootEvent[] = [
  { ts: T0 + 20 * MIN, item: 'Mote of Lesser Potential', zone: 'Befallen' },
  { ts: T0 + 80 * MIN, item: 'Mote of Lesser Potential', zone: 'Befallen' },
  { ts: T0 + 85 * MIN, item: 'Rusty Dagger', zone: 'Befallen' },
  { ts: T0 + 160 * MIN, item: 'Mote of Potential', zone: 'The Feerrott' }
]

const byZone = (rows: ZoneHistoryRow[]): Record<string, ZoneHistoryRow> =>
  Object.fromEntries(rows.map((r) => [r.zone, r]))

test('the log is cut into one stretch per stated level', () => {
  assert.deepEqual(
    levelSpans(snap()).map((s) => [s.level, (s.t1 - s.t0) / HOUR]),
    [[20, 1], [21, 1], [30, 1]]
  )
})

test('within three levels, only the stretches in reach count, per active hour', () => {
  const rows = byZone(zoneHistory({ snap: snap(), loot: LOOT, level: 21 }))
  assert.deepEqual(Object.keys(rows), ['Befallen'], 'level 30 is out of reach of 21')
  const b = rows.Befallen
  assert.equal(b.activeMs, 2 * HOUR)
  assert.equal(b.levelsPerHour, (0.5 + 0.25) / 2)
  assert.equal(b.aaPerHour, 0.5, 'one AA point in two hours')
  assert.equal(b.coinPerHour, 2000, '4000 copper in two hours')
  assert.equal(b.motesPerHour, 1, 'two motes; the dagger is not one')
  assert.equal(b.killsPerHour, 30)
  assert.equal(b.enough, true)
})

test('the other zone, at its own level', () => {
  const f = byZone(zoneHistory({ snap: snap(), loot: LOOT, level: 30 }))['The Feerrott']
  assert.equal(f.aaPerHour, 2)
  assert.equal(f.coinPerHour, 9000)
  assert.equal(f.motesPerHour, 1)
  assert.equal(f.deaths, 1)
  assert.equal(f.short, 'feerrott')
})

test('ranked by the goal, enough time first, a search narrowing by name', () => {
  const rows = zoneHistory({ snap: snap(), loot: LOOT, level: 25, spread: 10 })
  assert.deepEqual(rankHistory(rows, 'coin').map((r) => r.zone), ['The Feerrott', 'Befallen'])
  assert.deepEqual(rankHistory(rows, 'kills').map((r) => r.zone), ['Befallen', 'The Feerrott'])
  assert.deepEqual(rankHistory(rows, 'coin', 'befal').map((r) => r.zone), ['Befallen'])
  const thin = rows.map((r) => (r.zone === 'The Feerrott' ? { ...r, activeMs: MIN_ACTIVE_MS - 1, enough: false } : r))
  assert.deepEqual(rankHistory(thin, 'coin').map((r) => r.zone), ['Befallen', 'The Feerrott'], 'a short visit ranks last')
})

test('the Leveling zone table gains AA, coin and mote rates, and sorts on any of them', async () => {
  const { rangeStats } = await import('../src/shared/progressionStats')
  const { zoneExtras } = await import('../src/shared/zoneHistory')
  const { zoneStatRows } = await import('../src/renderer/src/features/leveling/rangeStatsRows')
  const s = snap()
  const range = { t0: T0, t1: T0 + 3 * HOUR }
  const zones = rangeStats({ snap: s, range }).zones
  const extras = zoneExtras(s, LOOT, range)
  const rows = zoneStatRows(zones, 'levels', 'active', extras)
  const b = rows.find((r) => r.zone === 'Befallen')
  assert.equal(b?.aaPerHour, '0.50')
  assert.equal(b?.coinPerHour, '2.0')
  assert.equal(b?.motesPerHour, '1.00')
  assert.deepEqual(zoneStatRows(zones, 'coinPerHour', 'active', extras).map((r) => r.zone), ['The Feerrott', 'Befallen'])
  assert.deepEqual(zoneStatRows(zones, 'kills', 'active', extras).map((r) => r.zone), ['Befallen', 'The Feerrott'])
  assert.deepEqual(zoneStatRows(zones, 'deaths', 'active', extras).map((r) => r.zone), ['The Feerrott', 'Befallen'])
})

test('the plain columns sort too: zone by name, time and deaths most first', () => {
  const rows = zoneHistory({ snap: snap(), loot: LOOT, level: 25, spread: 10 })
  assert.deepEqual(rankHistory(rows, 'zone').map((r) => r.zone), ['Befallen', 'The Feerrott'])
  assert.deepEqual(rankHistory(rows, 'time').map((r) => r.zone), ['Befallen', 'The Feerrott'])
  assert.deepEqual(rankHistory(rows, 'deaths').map((r) => r.zone), ['The Feerrott', 'Befallen'])
})
