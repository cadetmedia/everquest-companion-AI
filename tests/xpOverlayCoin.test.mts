// xpOverlayCoin.test.mts — the XP overlay's coin row: platinum per hour received in the slice,
// with the total beside it (owner ask, 2026-10-13).

import { test } from 'node:test'
import assert from 'node:assert/strict'
import type { ProgressionSnap } from '../src/shared/types'
import { resolveSlice } from '../src/shared/timeslice'
import { normalizeXpRows, toggleXpRow } from '../src/shared/xpOverlay'
import { dataBounds } from '../src/renderer/src/features/leveling/zoneBands'
import { xpOverlayView } from '../src/renderer/src/overlay/xpRows'

const MIN = 60_000
const HOUR = 60 * MIN
const T0 = Date.parse('Sat Aug 01 12:00:00 2026')

/** Two hours of kills every two minutes in one zone, and the coin given. */
function snap(coinTs: number[], coinCopper: number[]): ProgressionSnap {
  const killTs: number[] = []
  for (let t = T0; t < T0 + 2 * HOUR; t += 2 * MIN) killTs.push(t)
  return {
    expTs: [], expPct: [], expFlag: [],
    killTs, killZone: killTs.map(() => 0), killCredit: killTs.map(() => 0),
    witnessTs: [], recentKills: [], lootTs: [],
    zoneStart: [T0], zoneEnd: [0], zoneName: ['Befallen'],
    offlineStart: [], offlineEnd: [], offlineCamped: [],
    levelTs: [], levelValue: [], aaGainTs: [], aaGainAmount: [],
    coinTs, coinCopper,
    deathTs: [], deathKiller: [],
    lastTs: T0 + 2 * HOUR, windowStart: 0, dropped: 0
  }
}

function view(s: ProgressionSnap, visible = normalizeXpRows(undefined)): ReturnType<typeof xpOverlayView> {
  return xpOverlayView({
    snap: s,
    loot: [],
    slice: resolveSlice({ snap: s, bounds: dataBounds(s, []), id: 'all' }),
    visible
  })
}

test('the coin row states platinum per hour and the total received', () => {
  const v = view(snap([T0 + 10 * MIN, T0 + 70 * MIN], [3000, 2010]))
  const coin = v.rows.find((r) => r.id === 'coin')
  assert.ok(coin, 'drawn by default')
  assert.equal(coin.label, 'Coin')
  assert.match(`${coin.value} ${coin.unit}`, /pp\/hr$/)
  assert.equal(coin.detail, '5pp 1sp')
})

test('no coin in the slice is a measured zero, and the row can be switched off', () => {
  const s = snap([], [])
  assert.equal(view(s).rows.find((r) => r.id === 'coin')?.detail, '0cp')
  const off = toggleXpRow('coin', undefined)
  assert.deepEqual(off, ['xp', 'eta', 'motes'])
  assert.equal(view(s, off).rows.some((r) => r.row === 'coin'), false)
})
