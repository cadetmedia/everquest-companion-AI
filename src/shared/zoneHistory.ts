// zoneHistory.ts — YOUR OWN RECORD, ZONE BY ZONE, AT A LEVEL. Pure: no Node, no Electron, no React.
//
// THE QUESTION (owner ask, 2026-10-13): where have I levelled, earned AA, made coin or found motes
// fastest, around the level I am now? The Maps tab's "Where to level" answers from the bestiary;
// this answers from the log, so it only knows zones you have spent time in.
//
// AT A LEVEL means WITHIN `LEVEL_SPREAD` of it (owner, 2026-10-13: ±3). The level series is the
// snapshot's own (`levelTs`/`levelValue`: dings and class-swap re-reports), so the log is cut into
// stretches at one level each, the stretches in reach are kept, and `rangeStats` runs over each.
// Time before the first level the log states is at no known level and is left out.
//
// EVERY RATE IS PER ACTIVE HOUR: the time `rangeStats` counts as active (not idle, not logged
// out), which is the honest hour for "how fast did this camp pay". A zone with less active time
// than `MIN_ACTIVE_MS` in reach is listed but not ranked: a ten-minute visit is an anecdote.
//
// AA and motes are filed into the zone the log had you in at the instant they landed; levels,
// kills, coin and deaths come from `rangeStats`' own zone rows, so they agree with the Leveling tab.

import type { ZoneShort } from './maps'
import type { ProgressionSnap } from './progressionTypes'
import { rangeStats } from './progressionStats'
import type { LootEvent } from './types'
import { isMote } from './xpOverlay'
import { zoneIdKey } from './zoneScope'
import { zoneShortName } from './zones'

/** How far either side of the chosen level a stretch may be and still count. */
export const LEVEL_SPREAD = 3
/** Less active time than this in reach, and a zone's rates are not ranked. */
export const MIN_ACTIVE_MS = 15 * 60_000

const HOUR = 3_600_000
const UNKNOWN = 'unknown'

/** One stretch of the log at one stated level. */
export interface LevelSpan {
  t0: number
  t1: number
  level: number
}

/** A class loadout's span as the combo module states it: its start and the lowest level seen in
 *  it (`/who` rows as well as dings; the shown level is the minimum over the loadout). */
export interface LoadoutLevel {
  startTs: number
  /** the latest the swap can have happened; the level is certain only from here */
  startHi?: number
  levelLo: number | null
  levelHi?: number | null
  /** a lower level came AFTER a higher one inside it (a race swap no detector cut) */
  levelRegressed?: boolean
}

/** The level a loadout opened at. Inside one loadout the shown level only rises, so it is the
 *  lowest seen; when it went backwards (owner, 2026-10-13: a race not yet at 50 delevels you),
 *  the low came later and the highest is the opening one. */
function openingLevel(l: LoadoutLevel): number | null {
  return l.levelRegressed === true ? (l.levelHi ?? l.levelLo) : l.levelLo
}

/**
 * The log cut at every stated level: each ding, and each loadout's opening level. DINGS ALONE ARE
 * NOT ENOUGH (owner report, 2026-10-13): a swap back to a level-50 loadout after levelling another
 * class to 40 states 50 only in the `/who` bracket, and the last ding would hold the log at 40.
 * The latest statement wins; the last stretch runs to the snapshot's end.
 */
export function levelSpans(snap: ProgressionSnap, loadouts: readonly LoadoutLevel[] = []): LevelSpan[] {
  const said = snap.levelTs.map((ts, i) => ({ ts, level: snap.levelValue[i] }))
  for (const l of loadouts) {
    const level = openingLevel(l)
    // From the LATEST the swap can have happened (owner report, 2026-10-13: Plane of Hate listed
    // at level 10). The best-estimate start can fall back into the old loadout's time, and a
    // fresh class's low level would then be laid over hours played at 50.
    if (level !== null) said.push({ ts: Math.max(l.startTs, l.startHi ?? l.startTs), level })
  }
  said.sort((a, b) => a.ts - b.ts)
  const out: LevelSpan[] = []
  for (let i = 0; i < said.length; i++) {
    const t0 = said[i].ts
    const t1 = i + 1 < said.length ? said[i + 1].ts : snap.lastTs
    if (t1 > t0) out.push({ t0, t1, level: said[i].level })
  }
  return out
}

/** What one zone added up to over the stretches in reach. */
interface Totals {
  zone: string
  activeMs: number
  levelEquiv: number
  levelsStated: boolean
  kills: number
  coinCopper: number
  deaths: number
  aaPoints: number
  motes: number
  peak: PeakRates
}

function totalsFor(map: Map<string, Totals>, zone: string): Totals {
  const key = zoneIdKey(zone)
  let t = map.get(key)
  if (t === undefined) {
    t = {
      zone,
      activeMs: 0,
      levelEquiv: 0,
      levelsStated: false,
      kills: 0,
      coinCopper: 0,
      deaths: 0,
      aaPoints: 0,
      motes: 0,
      peak: { levels: 0, aa: 0, coin: 0, motes: 0, kills: 0 }
    }
    map.set(key, t)
  }
  return t
}

/** First index whose value is at or after `v`, in an ascending array. */
function firstAtOrAfter(arr: readonly number[], v: number): number {
  let lo = 0
  let hi = arr.length
  while (lo < hi) {
    const mid = (lo + hi) >> 1
    if (arr[mid] < v) lo = mid + 1
    else hi = mid
  }
  return lo
}

/** First loot event at or after `t`; the history is oldest first. */
function firstLootAt(loot: readonly LootEvent[], t: number): number {
  let lo = 0
  let hi = loot.length
  while (lo < hi) {
    const mid = (lo + hi) >> 1
    if (loot[mid].ts < t) lo = mid + 1
    else hi = mid
  }
  return lo
}

/** The zone the log had you in at `ts`. */
function zoneAt(snap: ProgressionSnap, ts: number): string {
  const i = firstAtOrAfter(snap.zoneStart, ts + 1) - 1
  return i < 0 ? UNKNOWN : snap.zoneName[i]
}

/** One stretch's zone rows, AA gains and motes, added into `map`. */
function addSpan(map: Map<string, Totals>, snap: ProgressionSnap, loot: readonly LootEvent[], span: LevelSpan): void {
  const stats = rangeStats({ snap, range: { t0: span.t0, t1: span.t1 } })
  for (const row of stats.zones) {
    const t = totalsFor(map, row.zone)
    t.activeMs += row.activeMs
    t.levelEquiv += row.levelEquiv
    t.levelsStated ||= row.expSamples > row.expUnstated
    t.kills += row.kills
    t.coinCopper += row.coinCopper
    t.deaths += row.deaths
  }
  for (const [key, extra] of zoneExtras(snap, loot, span)) {
    const t = map.get(key) ?? totalsFor(map, extra.zone)
    t.aaPoints += extra.aaPoints
    t.motes += extra.motes
    // A window across a ding is cut in two; the best of the stretches stands for the zone.
    for (const g of GOAL_KEYS) t.peak[g] = Math.max(t.peak[g], extra.peak[g])
  }
}

/** The width of a "best stretch" window (owner ask, 2026-10-13: a zone's average hides the camp
 *  that paid; fifteen minutes of hill giants after an evening of bandits). */
export const PEAK_WINDOW_MS = 15 * 60_000

/** Each goal's best stretch, per hour: levels, AA points, copper, motes, kills. */
export type PeakRates = Record<HistoryGoal, number>

/** Fewer kills than this and it is not a stretch of farming (owner, 2026-10-13: one mob is not a
 *  streak). Ten is a kill every ninety seconds over the window. */
export const MIN_STRETCH_KILLS = 10
/** A longer gap between two kills ends a stretch (owner, 2026-10-13); the idle rule's own 5 min. */
export const STRETCH_GAP_MS = 5 * 60_000
/** A stretch shorter than this is a burst, not a camp. */
export const MIN_STRETCH_MS = 10 * 60_000
/** Coin and loot this long after a stretch's last kill still belong to it: looting takes a moment. */
const LOOT_GRACE_MS = 60_000

/** Runs of kills with no gap over `STRETCH_GAP_MS`, as [first kill, last kill]. */
function stretches(kills: readonly number[]): { start: number; end: number }[] {
  const out: { start: number; end: number }[] = []
  let first = 0
  for (let i = 1; i <= kills.length; i++) {
    if (i < kills.length && kills[i] - kills[i - 1] <= STRETCH_GAP_MS) continue
    if (i - first >= MIN_STRETCH_KILLS && kills[i - 1] - kills[first] >= MIN_STRETCH_MS) {
      out.push({ start: kills[first], end: kills[i - 1] })
    }
    first = i
  }
  return out
}

/** How many of `kills` fall in (end - PEAK_WINDOW_MS, end]. */
function killsIn(kills: readonly number[], end: number): number {
  return firstAtOrAfter(kills, end + 1) - firstAtOrAfter(kills, end - PEAK_WINDOW_MS + 1)
}

/** The most `values` in any window of one stretch that holds enough kills, per hour. */
function stretchPeak(
  stretch: { start: number; end: number },
  data: { ts: readonly number[]; values: readonly number[]; kills: readonly number[] }
): number {
  const { ts, values, kills } = data
  const window = Math.min(PEAK_WINDOW_MS, stretch.end - stretch.start)
  const lastTs = stretch.end + LOOT_GRACE_MS
  let best = 0
  let sum = 0
  let lo = firstAtOrAfter(ts, stretch.start)
  for (let hi = lo; hi < ts.length && ts[hi] <= lastTs; hi++) {
    sum += values[hi]
    while (ts[hi] - ts[lo] >= PEAK_WINDOW_MS) sum -= values[lo++]
    const enough = window < PEAK_WINDOW_MS || killsIn(kills, Math.min(ts[hi], stretch.end)) >= MIN_STRETCH_KILLS
    if (sum > best && enough) best = sum
  }
  return (best * HOUR) / window
}

/**
 * A goal's best stretch, per hour. A STRETCH is a run of kills with no gap over
 * `STRETCH_GAP_MS`, at least `MIN_STRETCH_KILLS` kills and `MIN_STRETCH_MS` long; inside one, the
 * best `PEAK_WINDOW_MS` holding enough kills is taken (the whole stretch when it is shorter). So
 * neither one mob nor one lucky sale reads as a camp, and an evening at one camp that ends on a
 * better one still finds the better one. Arrays ascending.
 */
export function peakPerHour(ts: readonly number[], values: readonly number[], kills: readonly number[]): number {
  let best = 0
  for (const stretch of stretches(kills)) best = Math.max(best, stretchPeak(stretch, { ts, values, kills }))
  return best
}

/** AA points and motes per zone, by `zoneIdKey`, and every goal's best stretch there. */
export interface ZoneExtra {
  zone: string
  aaPoints: number
  motes: number
  peak: PeakRates
}

const GOAL_KEYS: readonly HistoryGoal[] = ['levels', 'aa', 'coin', 'motes', 'kills']

/** One zone's dated amounts per goal, ascending, which the peaks are slid over. */
type Series = Record<HistoryGoal, { ts: number[]; v: number[] }>

const emptySeries = (): Series =>
  Object.fromEntries(GOAL_KEYS.map((g) => [g, { ts: [], v: [] }])) as unknown as Series

/** Every dated amount of [t0, t1), per zone and goal. */
function zoneSeries(
  snap: ProgressionSnap,
  loot: readonly LootEvent[],
  range: { t0: number; t1: number }
): Map<string, { zone: string; series: Series }> {
  const out = new Map<string, { zone: string; series: Series }>()
  const add = (goal: HistoryGoal, ts: number, v: number, zone = zoneAt(snap, ts)): void => {
    if (ts < range.t0 || ts >= range.t1) return
    const key = zoneIdKey(zone)
    let z = out.get(key)
    if (z === undefined) {
      z = { zone, series: emptySeries() }
      out.set(key, z)
    }
    z.series[goal].ts.push(ts)
    z.series[goal].v.push(v)
  }
  // Every column is time-ordered, so each walk starts at the range and stops at its end.
  const walk = (ts: readonly number[], fn: (i: number) => void): void => {
    for (let i = firstAtOrAfter(ts, range.t0); i < ts.length && ts[i] < range.t1; i++) fn(i)
  }
  walk(snap.aaGainTs, (i) => { add('aa', snap.aaGainTs[i], snap.aaGainAmount[i]) })
  walk(snap.expTs, (i) => { add('levels', snap.expTs[i], Math.max(0, snap.expPct[i]) / 100) })
  walk(snap.killTs, (i) => { add('kills', snap.killTs[i], 1) })
  const coinTs = snap.coinTs ?? []
  walk(coinTs, (i) => { add('coin', coinTs[i], snap.coinCopper?.[i] ?? 0) })
  for (let i = firstLootAt(loot, range.t0); i < loot.length && loot[i].ts < range.t1; i++) {
    const ev = loot[i]
    if (isMote(ev.item)) add('motes', ev.ts, 1, ev.zone ?? zoneAt(snap, ev.ts))
  }
  return out
}

const total = (v: readonly number[]): number => v.reduce((a, b) => a + b, 0)

/**
 * The AA points and motes that landed in [t0, t1), and each goal's best stretch, filed by
 * `zoneIdKey` into the zone the log had you in: the same key `rangeStats` rows are grouped by,
 * so the Leveling table joins them exactly.
 */
export function zoneExtras(
  snap: ProgressionSnap,
  loot: readonly LootEvent[],
  range: { t0: number; t1: number }
): Map<string, ZoneExtra> {
  const out = new Map<string, ZoneExtra>()
  for (const [key, { zone, series }] of zoneSeries(snap, loot, range)) {
    const peak = Object.fromEntries(
      GOAL_KEYS.map((g) => [g, peakPerHour(series[g].ts, series[g].v, series.kills.ts)])
    ) as unknown as PeakRates
    out.set(key, { zone, aaPoints: total(series.aa.v), motes: series.motes.v.length, peak })
  }
  return out
}

/** One zone of your history, with its rates per active hour. */
export interface ZoneHistoryRow {
  key: string
  /** the zone as the log first named it */
  zone: string
  /** the map stem, when the zone table knows the zone */
  short: ZoneShort | null
  activeMs: number
  /** enough active time in reach for the rates to be ranked */
  enough: boolean
  /** null when the log stated no level-bar percentage here (at the cap) */
  levelsPerHour: number | null
  aaPerHour: number
  /** copper per hour */
  coinPerHour: number
  motesPerHour: number
  killsPerHour: number
  motes: number
  deaths: number
  /** each goal's best `PEAK_WINDOW_MS` stretch, per hour (copper for coin) */
  peak: PeakRates
}

function toRow(key: string, t: Totals): ZoneHistoryRow {
  const hours = t.activeMs / HOUR
  const per = (n: number): number => (hours > 0 ? n / hours : 0)
  return {
    key,
    zone: t.zone,
    short: zoneShortName(t.zone),
    activeMs: t.activeMs,
    enough: t.activeMs >= MIN_ACTIVE_MS,
    levelsPerHour: t.levelsStated ? per(t.levelEquiv) : null,
    aaPerHour: per(t.aaPoints),
    coinPerHour: per(t.coinCopper),
    motesPerHour: per(t.motes),
    killsPerHour: per(t.kills),
    motes: t.motes,
    deaths: t.deaths,
    peak: t.peak
  }
}

export interface ZoneHistoryArgs {
  snap: ProgressionSnap
  loot: readonly LootEvent[]
  level: number
  spread?: number
  /** the class loadouts, whose levels the dings alone miss (see `levelSpans`) */
  loadouts?: readonly LoadoutLevel[]
}

/** Every zone you spent active time in within `spread` levels of `level`, unranked. */
export function zoneHistory(args: ZoneHistoryArgs): ZoneHistoryRow[] {
  const spread = args.spread ?? LEVEL_SPREAD
  const map = new Map<string, Totals>()
  for (const span of levelSpans(args.snap, args.loadouts)) {
    if (Math.abs(span.level - args.level) > spread) continue
    addSpan(map, args.snap, args.loot, span)
  }
  map.delete(zoneIdKey(UNKNOWN))
  return [...map.entries()].filter(([, t]) => t.activeMs > 0).map(([key, t]) => toRow(key, t))
}

/** What the ranking is for. */
export type HistoryGoal = 'levels' | 'aa' | 'coin' | 'motes' | 'kills'

/** The rate a goal ranks on, the average or the best stretch; null sorts last. */
export function goalRate(row: ZoneHistoryRow, goal: HistoryGoal, best = false): number | null {
  if (best) return row.peak[goal]
  switch (goal) {
    case 'levels':
      return row.levelsPerHour
    case 'aa':
      return row.aaPerHour
    case 'coin':
      return row.coinPerHour
    case 'motes':
      return row.motesPerHour
    case 'kills':
      return row.killsPerHour
  }
}

/** What the table is ordered by: a goal's rate, or one of the plain columns. */
export type HistorySort = HistoryGoal | 'zone' | 'time' | 'deaths'

const isGoal = (s: HistorySort): s is HistoryGoal => s !== 'zone' && s !== 'time' && s !== 'deaths'

function plainOrder(sort: Exclude<HistorySort, HistoryGoal>): (a: ZoneHistoryRow, b: ZoneHistoryRow) => number {
  if (sort === 'zone') return (a, b) => a.zone.localeCompare(b.zone)
  if (sort === 'time') return (a, b) => b.activeMs - a.activeMs
  return (a, b) => b.deaths - a.deaths || b.activeMs - a.activeMs
}

/**
 * The zones in order, a search narrowing by name. By a goal: the ranked ones (enough time) by the
 * goal's rate, then the rest by time spent. By a plain column: that column alone.
 */
export function rankHistory(
  rows: readonly ZoneHistoryRow[],
  sort: HistorySort,
  search = '',
  best = false
): ZoneHistoryRow[] {
  const words = search.trim().toLowerCase().split(/\s+/).filter(Boolean)
  const kept = rows.filter((r) => words.every((w) => r.zone.toLowerCase().includes(w)))
  if (!isGoal(sort)) return kept.sort(plainOrder(sort))
  const rate = (r: ZoneHistoryRow): number => (r.enough ? (goalRate(r, sort, best) ?? -1) : -1)
  return kept.sort(
    (a, b) => Number(b.enough) - Number(a.enough) || rate(b) - rate(a) || b.activeMs - a.activeMs
  )
}
