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

/** The log cut at every stated level. The last stretch runs to the snapshot's end. */
export function levelSpans(snap: ProgressionSnap): LevelSpan[] {
  const out: LevelSpan[] = []
  const n = snap.levelTs.length
  for (let i = 0; i < n; i++) {
    const t0 = snap.levelTs[i]
    const t1 = i + 1 < n ? snap.levelTs[i + 1] : snap.lastTs
    if (t1 > t0) out.push({ t0, t1, level: snap.levelValue[i] })
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
}

function totalsFor(map: Map<string, Totals>, zone: string): Totals {
  const key = zoneIdKey(zone)
  let t = map.get(key)
  if (t === undefined) {
    t = { zone, activeMs: 0, levelEquiv: 0, levelsStated: false, kills: 0, coinCopper: 0, deaths: 0, aaPoints: 0, motes: 0 }
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
  }
}

/** AA points and motes per zone, by `zoneIdKey`. */
export interface ZoneExtra {
  zone: string
  aaPoints: number
  motes: number
}

/**
 * The AA points and motes that landed in [t0, t1), filed by `zoneIdKey` into the zone the log had
 * you in: the same key `rangeStats` rows are grouped by, so the Leveling table joins them exactly.
 */
export function zoneExtras(
  snap: ProgressionSnap,
  loot: readonly LootEvent[],
  range: { t0: number; t1: number }
): Map<string, ZoneExtra> {
  const out = new Map<string, ZoneExtra>()
  const at = (zone: string): ZoneExtra => {
    const key = zoneIdKey(zone)
    let e = out.get(key)
    if (e === undefined) {
      e = { zone, aaPoints: 0, motes: 0 }
      out.set(key, e)
    }
    return e
  }
  for (let i = firstAtOrAfter(snap.aaGainTs, range.t0); i < snap.aaGainTs.length && snap.aaGainTs[i] < range.t1; i++) {
    at(zoneAt(snap, snap.aaGainTs[i])).aaPoints += snap.aaGainAmount[i]
  }
  for (const ev of loot) {
    if (ev.ts < range.t0 || ev.ts >= range.t1 || !isMote(ev.item)) continue
    at(ev.zone ?? zoneAt(snap, ev.ts)).motes += 1
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
    deaths: t.deaths
  }
}

export interface ZoneHistoryArgs {
  snap: ProgressionSnap
  loot: readonly LootEvent[]
  level: number
  spread?: number
}

/** Every zone you spent active time in within `spread` levels of `level`, unranked. */
export function zoneHistory(args: ZoneHistoryArgs): ZoneHistoryRow[] {
  const spread = args.spread ?? LEVEL_SPREAD
  const map = new Map<string, Totals>()
  for (const span of levelSpans(args.snap)) {
    if (Math.abs(span.level - args.level) > spread) continue
    addSpan(map, args.snap, args.loot, span)
  }
  map.delete(zoneIdKey(UNKNOWN))
  return [...map.entries()].filter(([, t]) => t.activeMs > 0).map(([key, t]) => toRow(key, t))
}

/** What the ranking is for. */
export type HistoryGoal = 'levels' | 'aa' | 'coin' | 'motes' | 'kills'

/** The rate a goal ranks on; null sorts last. */
export function goalRate(row: ZoneHistoryRow, goal: HistoryGoal): number | null {
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
export function rankHistory(rows: readonly ZoneHistoryRow[], sort: HistorySort, search = ''): ZoneHistoryRow[] {
  const words = search.trim().toLowerCase().split(/\s+/).filter(Boolean)
  const kept = rows.filter((r) => words.every((w) => r.zone.toLowerCase().includes(w)))
  if (!isGoal(sort)) return kept.sort(plainOrder(sort))
  const rate = (r: ZoneHistoryRow): number => (r.enough ? (goalRate(r, sort) ?? -1) : -1)
  return kept.sort(
    (a, b) => Number(b.enough) - Number(a.enough) || rate(b) - rate(a) || b.activeMs - a.activeMs
  )
}
