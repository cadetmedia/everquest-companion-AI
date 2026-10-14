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

test('the best stretch: fifteen minutes of hill giants outrank an evening of bandits', async () => {
  const { peakPerHour, PEAK_WINDOW_MS } = await import('../src/shared/zoneHistory')
  // Two hours of 10 pp every ten minutes, then 650 pp inside fifteen minutes.
  const ts: number[] = []
  const v: number[] = []
  for (let t = 0; t < 2 * HOUR; t += 10 * MIN) { ts.push(t); v.push(10_000) }
  for (let k = 0; k < 5; k++) { ts.push(2 * HOUR + k * 3 * MIN); v.push(130_000) }
  // A kill a minute throughout, so every window is a real stretch.
  const kills: number[] = []
  for (let t = 0; t < 2 * HOUR + 15 * MIN; t += MIN) kills.push(t)
  assert.equal(PEAK_WINDOW_MS, 15 * MIN)
  assert.equal(peakPerHour(ts, v, kills) / 1000, 2600, '650 pp in 15 minutes is 2,600 pp/hr')
  assert.equal(peakPerHour([], [], []), 0)
})

test('a stretch needs ten kills and ten minutes; a five-minute gap ends one', async () => {
  const { peakPerHour, MIN_STRETCH_KILLS } = await import('../src/shared/zoneHistory')
  const sale = [HOUR]
  const big = [500_000]
  // Kills every 75 s ending at the sale: ten of them span 11.25 minutes.
  const run = (n: number): number[] => Array.from({ length: n }, (_, k) => HOUR - (n - 1 - k) * 75_000)
  assert.equal(peakPerHour(sale, big, run(MIN_STRETCH_KILLS - 1)), 0, 'nine kills is not a stretch')
  const rate = peakPerHour(sale, big, run(MIN_STRETCH_KILLS))
  assert.ok(Math.abs(rate - 500_000 / (12.25 / 60)) < 1e-6, 'a short stretch is measured over its own length and loot minute')
  // A sale in the loot minute after the last kill: the minute it counts in is in the divisor too.
  const late = peakPerHour([HOUR + 30_000], big, run(MIN_STRETCH_KILLS))
  assert.ok(Math.abs(late - rate) < 1e-6, 'the grace minute is in both the sum and the span')
  const burst = Array.from({ length: 20 }, (_, k) => HOUR - k * 15_000)
  assert.equal(peakPerHour(sale, big, burst), 0, 'twenty kills in five minutes is a burst, not a camp')
  // Two runs of ten with a six-minute gap: the sale sits in the gap, so neither run holds it.
  const before = Array.from({ length: 10 }, (_, k) => HOUR - 6 * MIN - 1 - (9 - k) * 75_000)
  const after = Array.from({ length: 10 }, (_, k) => HOUR + 6 * MIN + 1 + k * 75_000)
  assert.equal(peakPerHour([HOUR + 3 * MIN], big, [...before, ...after]), 0)
})

test('a camp with too few kills per window claims no best stretch', () => {
  const rows = zoneHistory({ snap: snap(), loot: LOOT, level: 25, spread: 10 })
  const f = rows.find((r) => r.zone === 'The Feerrott')
  // A kill every two minutes is eight in any window: short of a stretch, so no best is claimed.
  assert.equal(f?.peak.coin, 0)
  assert.equal(f?.peak.kills, 0)
})

test('a swap back to a higher loadout states its level, which the last ding alone would miss', () => {
  const s = snap()
  // Dings say 20, 21, 30; a loadout opening at the third hour states 50 (its /who bracket).
  const spans = levelSpans(s, [{ startTs: T0 + 2 * HOUR + 30 * MIN, levelLo: 50 }])
  assert.deepEqual(spans.map((x) => x.level), [20, 21, 30, 50])
  const at50 = zoneHistory({ snap: s, loot: LOOT, level: 50, loadouts: [{ startTs: T0 + 2 * HOUR + 30 * MIN, levelLo: 50 }] })
  assert.deepEqual(at50.map((r) => r.zone), ['The Feerrott'], 'the last half hour is at 50')
  assert.equal(zoneHistory({ snap: s, loot: LOOT, level: 50 }).length, 0, 'dings alone never reach 50')
})

test('a loadout whose level went backwards opens at its highest level, not its lowest', () => {
  const s = snap()
  const swap = { startTs: T0 + 2 * HOUR + 30 * MIN, levelLo: 12, levelHi: 50, levelRegressed: true }
  assert.equal(levelSpans(s, [swap]).at(-1)?.level, 50)
  assert.equal(levelSpans(s, [{ ...swap, levelRegressed: undefined }]).at(-1)?.level, 12)
})

test("a loadout's level applies from the latest its swap can have happened, not the guess", () => {
  const s = snap()
  // A fresh class at 12, guessed to start at 2h but certain only from 2h45m.
  const fresh = { startTs: T0 + 2 * HOUR, startHi: T0 + 2 * HOUR + 45 * MIN, levelLo: 12 }
  const spans = levelSpans(s, [fresh])
  // The window itself is at no known level (the old 30 is not held over it), then 12. The ding to
  // 30 at 2h is the old class's: outside the levels the fresh loadout saw.
  const tail = spans.slice(-2)
  assert.ok(Number.isNaN(tail[0].level))
  assert.equal((tail[0].t1 - tail[0].t0) / MIN, 45)
  assert.deepEqual([tail[1].level, (tail[1].t1 - tail[1].t0) / MIN], [12, 15])
  const at30 = zoneHistory({ snap: s, loot: LOOT, level: 30, spread: 0, loadouts: [fresh] })
  assert.equal(at30.length, 0, 'no swap-window time is filed at the old level')
})

test("a ding inside the swap window is the loadout's latest statement, not undone by its lowest level", () => {
  const s = snap()
  // Swap somewhere in [2h, 2h45m]; the loadout saw 41 and 42; a ding to 42 at 2h20m.
  s.levelTs = [...s.levelTs, T0 + 2 * HOUR + 20 * MIN]
  s.levelValue = [...s.levelValue, 42]
  const swap = { startTs: T0 + 2 * HOUR, startHi: T0 + 2 * HOUR + 45 * MIN, levelLo: 41, levelHi: 42 }
  const tail = levelSpans(s, [swap]).slice(-2)
  assert.ok(Number.isNaN(tail[0].level), 'the window is at no known level')
  assert.deepEqual([tail[1].level, (tail[1].t1 - tail[1].t0) / MIN], [42, 15])
})

test('a swap to a loadout whose level the log never stated is at no known level, and left out', () => {
  const s = snap()
  const unstated = { startTs: T0 + 2 * HOUR + 30 * MIN, levelLo: null }
  assert.ok(Number.isNaN(levelSpans(s, [unstated]).at(-1)?.level))
  const at30 = zoneHistory({ snap: s, loot: LOOT, level: 30, spread: 0, loadouts: [unstated] })
  assert.equal(at30[0].activeMs, 30 * MIN, 'only the half hour before the swap counts at 30')
})
