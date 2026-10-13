// Coin and deaths in the Leveling range stats: `rangeStats` slicing the two columns by the selected
// range and zone, and the strings the panel prints for them (rangeStatsRows.ts).
//
// Imported RELATIVELY: node tests run through tsx with no `@shared` alias.

import { test } from 'node:test'
import assert from 'node:assert/strict'
import { IDLE_GAP_MS, rangeStats, type RangeStats } from '../src/shared/progressionStats'
import type { ProgressionSnap } from '../src/shared/progressionTypes'
import {
  coinChipText,
  coinText,
  coinTitle,
  deathsText,
  deathsTitle,
  platText,
  zoneStatRows
} from '../src/renderer/src/features/leveling/rangeStatsRows'

const MIN = 60_000
const HOUR = 60 * MIN
const T0 = Date.parse('Sat Aug 01 12:00:00 2026')

/** Two zones (Befallen for the first hour, then The Feerrott), kills every 2 min so all is active. */
function snap(): ProgressionSnap {
  const killTs: number[] = []
  for (let t = T0; t < T0 + 2 * HOUR; t += 2 * MIN) killTs.push(t)
  return {
    expTs: [], expPct: [], expFlag: [],
    killTs, killZone: killTs.map((t) => (t < T0 + HOUR ? 0 : 1)), killCredit: killTs.map(() => 0),
    witnessTs: [], recentKills: [], lootTs: [],
    zoneStart: [T0, T0 + HOUR], zoneEnd: [T0 + HOUR, 0], zoneName: ['Befallen', 'The Feerrott'],
    offlineStart: [], offlineEnd: [], offlineCamped: [],
    levelTs: [], levelValue: [], aaGainTs: [], aaGainAmount: [],
    coinTs: [T0 + MIN, T0 + 30 * MIN, T0 + 90 * MIN, T0 + 3 * HOUR],
    coinCopper: [41, 179, 1143, 5000],
    deathTs: [T0 + 10 * MIN, T0 + 70 * MIN, T0 + 80 * MIN, T0 + 85 * MIN],
    deathKiller: ['Trooper Axyl', 'a shiverback', 'a shiverback', ''],
    lastTs: T0 + 3 * HOUR, windowStart: 0, dropped: 0
  }
}

test('coin and deaths are summed over the range only, and filed into their zone rows', () => {
  const r = rangeStats({ snap: snap(), range: { t0: T0, t1: T0 + 2 * HOUR } })
  assert.equal(r.coinCopper, 41 + 179 + 1143, 'the sample at 3h is outside the range')
  assert.equal(r.coinPerHourWall, (41 + 179 + 1143) / 2)
  assert.equal(r.deaths, 4)
  assert.deepEqual(r.deathKillers, [
    { killer: 'a shiverback', count: 2 },
    { killer: 'Trooper Axyl', count: 1 },
    { killer: 'unknown', count: 1 }
  ])
  const byZone = Object.fromEntries(r.zones.map((z) => [z.zone, [z.coinCopper, z.deaths]]))
  assert.deepEqual(byZone, { Befallen: [220, 1], 'The Feerrott': [1143, 3] })
})

test('a narrower range and a zone filter both slice the two columns', () => {
  const late = rangeStats({ snap: snap(), range: { t0: T0 + HOUR, t1: T0 + 2 * HOUR } })
  assert.equal(late.coinCopper, 1143)
  assert.equal(late.deaths, 3)
  const befallen = rangeStats({ snap: snap(), range: { t0: T0, t1: T0 + 2 * HOUR }, zoneKey: 'befallen' })
  assert.equal(befallen.coinCopper, 220)
  assert.deepEqual(befallen.deathKillers, [{ killer: 'Trooper Axyl', count: 1 }])
})

test('a snapshot without the columns reads as no coin and no deaths', () => {
  const s = snap()
  delete s.coinTs
  delete s.coinCopper
  delete s.deathTs
  delete s.deathKiller
  const r = rangeStats({ snap: s, range: { t0: T0, t1: T0 + 2 * HOUR } })
  assert.equal(r.coinCopper, 0)
  assert.equal(r.deaths, 0)
  assert.deepEqual(r.deathKillers, [])
})

test('coin reads as the game counts it, and as platinum in the zone column', () => {
  assert.equal(coinText(41), '4sp 1cp')
  assert.equal(coinText(179), '1gp 7sp 9cp')
  assert.equal(coinText(1_234_567), '1,234pp 5gp 6sp 7cp')
  assert.equal(coinText(0), '0cp')
  assert.equal(platText(1143), '1.14pp')
  const rows = zoneStatRows(rangeStats({ snap: snap(), range: { t0: T0, t1: T0 + 2 * HOUR } }).zones, 'time')
  assert.deepEqual(rows.map((z) => [z.zone, z.coin, z.deaths]), [
    ['Befallen', '0.22pp', 1],
    ['The Feerrott', '1.14pp', 3]
  ])
})

/** A range with only what these strings read. */
function stats(over: Partial<RangeStats>): RangeStats {
  const r = rangeStats({ snap: snap(), range: { t0: T0, t1: T0 + 2 * HOUR } })
  return { ...r, ...over }
}

test('the coin chip carries the rate on the basis in force, and drops it when the hour is too short', () => {
  const r = stats({})
  assert.equal(coinChipText(r, 'elapsed'), '1pp 3gp 6sp 3cp coin · 0.68 pp/hr')
  assert.equal(coinChipText(r, 'active'), `1pp 3gp 6sp 3cp coin · ${((r.coinPerHourActive ?? 0) / 1000).toFixed(2)} pp/hr`)
  const brief = stats({ durationMs: IDLE_GAP_MS - 1, activeMs: IDLE_GAP_MS - 1 })
  assert.equal(coinChipText(brief, 'elapsed'), '1pp 3gp 6sp 3cp coin')
  assert.equal(coinChipText(stats({ coinCopper: 0 })), null)
  assert.match(coinTitle(r, 'active'), /auto-sold loot.*per hour of active time/)
})

test('deaths are always stated, and the hover names who killed you, most first', () => {
  assert.equal(deathsText(stats({ deaths: 0, deathKillers: [] })), '0 deaths')
  assert.equal(deathsText(stats({ deaths: 1 })), '1 death')
  assert.equal(deathsTitle(stats({ deaths: 0, deathKillers: [] })), null)
  assert.equal(deathsTitle(stats({})), 'Killed by a shiverback (2), Trooper Axyl (1), unknown (1)')
})
