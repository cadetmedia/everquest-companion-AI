// shared/logArchive/mergeProgression.ts — the `progression` module across an archive and the live
// log (step 4.5).
//
// The columns join older first, then the engine's own caps are applied (`progression.rs`), so a
// merged series is never longer than a live one could be. Three things are more than a join:
//
//   * `killZone` indexes `zoneName`, so the live side's indexes move up by the archive's zone count.
//   * The archive's last zone band is still open (it ends at 0). The fold closes an open band at the
//     next zone line, so it is closed at the live log's first zone start.
//   * A live kill before the live log's first zone line has no zone (-1, and '' in the named ring).
//     Read as one log, the fold puts it in the zone the archive ended in, so the merge does the same.
//     Only when the live side has dropped nothing: then -1 can mean nothing else.
//   * A cap that trims here moves `dropped` and `windowStart` as the fold's own trim does, so the
//     charts' existing "this range reaches history that was dropped" wording covers it.
//
// The level and AA columns are uncapped, as in the fold. The named recent-kills ring keeps its last
// `RECENT_KILL_CAP` by count.

import type { ProgressionSnap } from '../types'

/** `progression.rs` TRIM_BATCH: a full column may run this far past its cap before it is trimmed. */
const TRIM_BATCH = 1024
/** `progression.rs` RECENT_KILL_CAP. */
const RECENT_KILL_CAP = 50

/** The snapshot's required keys: an optional column is merged by `OPTIONAL_GROUPS` instead. */
type Required_<T> = { [K in keyof T]-?: undefined extends T[K] ? never : K }[keyof T]
type Column = Exclude<Required_<ProgressionSnap>, 'recentKills' | 'lastTs' | 'windowStart' | 'dropped'>

interface Group {
  /** Index-aligned columns; the first holds the timestamps `windowStart` is read from. */
  cols: readonly Column[]
  /** `progression.rs` cap, or null for an uncapped column. */
  cap: number | null
}

const GROUPS: readonly Group[] = [
  { cols: ['expTs', 'expPct', 'expFlag'], cap: 40_000 },
  { cols: ['killTs', 'killZone', 'killCredit'], cap: 40_000 },
  { cols: ['witnessTs'], cap: 20_000 },
  { cols: ['lootTs'], cap: 20_000 },
  { cols: ['zoneStart', 'zoneEnd', 'zoneName'], cap: 4_000 },
  { cols: ['offlineStart', 'offlineEnd', 'offlineCamped'], cap: 4_000 },
  { cols: ['levelTs', 'levelValue'], cap: null },
  { cols: ['aaGainTs', 'aaGainAmount'], cap: null }
]

type Columns = Record<Column, (number | string)[]>

/** Columns a newer fold adds (coin and deaths, `coin-and-deaths`), merged when either side has them,
 * so this file builds with or without that branch and an archive made before it reads as none. */
const OPTIONAL_GROUPS: readonly { cols: readonly string[]; cap: number }[] = [
  { cols: ['coinTs', 'coinCopper', 'coinSold'], cap: 20_000 },
  { cols: ['deathTs', 'deathKiller'], cap: 4_000 }
]

const arrayOr = (v: unknown): unknown[] => (Array.isArray(v) ? (v as unknown[]) : [])

/** One side's column, or '' for each of its rows when it lacks it (a fold from before `coinSold`). */
const column = (side: Record<string, unknown>, c: string, lead: string): unknown[] =>
  Array.isArray(side[c]) ? (side[c] as unknown[]) : arrayOr(side[lead]).map(() => '')

/** The optional columns joined older first and trimmed to their caps, as `trim` does the rest. */
function optional(older: ProgressionSnap, newer: ProgressionSnap): { cols: Record<string, unknown[]>; dropped: number; window: number } {
  const o = older as unknown as Record<string, unknown>
  const n = newer as unknown as Record<string, unknown>
  const cols: Record<string, unknown[]> = {}
  let dropped = 0
  let window = 0
  for (const g of OPTIONAL_GROUPS) {
    if (!g.cols.some((c) => Array.isArray(o[c]) || Array.isArray(n[c]))) continue
    for (const c of g.cols) cols[c] = [...column(o, c, g.cols[0]), ...column(n, c, g.cols[0])]
    const len = cols[g.cols[0]].length
    if (len < g.cap + TRIM_BATCH) continue
    const cut = len - g.cap
    for (const c of g.cols) cols[c].splice(0, cut)
    dropped += cut
    window = Math.max(window, Number(cols[g.cols[0]][0]))
  }
  return { cols, dropped, window }
}

export function isProgressionSnap(x: unknown): x is ProgressionSnap {
  if (x === null || typeof x !== 'object') return false
  const s = x as Record<string, unknown>
  if (!Array.isArray(s.recentKills)) return false
  if (![s.lastTs, s.windowStart, s.dropped].every((n) => typeof n === 'number')) return false
  return GROUPS.every((g) => {
    const lens = g.cols.map((c) => (Array.isArray(s[c]) ? (s[c] as unknown[]).length : -1))
    return lens[0] >= 0 && lens.every((n) => n === lens[0])
  })
}

/** Every column joined, older first, with the live side's zone indexes moved past the archive's. */
function joined(older: ProgressionSnap, newer: ProgressionSnap, carried: number): Columns {
  const out = {} as Columns
  for (const g of GROUPS) for (const c of g.cols) out[c] = [...older[c], ...newer[c]]
  const shift = older.zoneStart.length
  out.killZone = [...older.killZone, ...newer.killZone.map((z) => (z >= 0 ? z + shift : carried))]
  const last = older.zoneEnd.length - 1
  if (last >= 0 && older.zoneEnd[last] === 0 && newer.zoneStart.length > 0) out.zoneEnd[last] = newer.zoneStart[0]
  return out
}

/** The fold's trim over joined columns: how many entries went, and the window it leaves. */
function trim(cols: Columns): { dropped: number; window: number } {
  let dropped = 0
  let window = 0
  for (const g of GROUPS) {
    const len = cols[g.cols[0]].length
    if (g.cap === null || len < g.cap + TRIM_BATCH) continue
    const n = len - g.cap
    for (const c of g.cols) cols[c].splice(0, n)
    // `killZone` indexes `zoneName`: a zone that ages out becomes -1 (unknown), never a wrong zone.
    if (g.cols[0] === 'zoneStart') cols.killZone = cols.killZone.map((z) => Math.max(Number(z) - n, -1))
    dropped += n
    window = Math.max(window, Number(cols[g.cols[0]][0]))
  }
  return { dropped, window }
}

/** `older` then `newer`, or null when either is not a progression snapshot. */
export function mergeProgression(older: unknown, newer: unknown): ProgressionSnap | null {
  if (!isProgressionSnap(older) || !isProgressionSnap(newer)) return null
  // The zone the archive ended in, for live kills before the live log's first zone line.
  const carried = newer.windowStart === 0 ? older.zoneStart.length - 1 : -1
  const carriedName = carried >= 0 ? older.zoneName[carried] : ''
  const cols = joined(older, newer, carried)
  const cut = trim(cols)
  const extra = optional(older, newer)
  const live = newer.recentKills.map((k) => (k.zone === '' ? { ...k, zone: carriedName } : { ...k }))
  return {
    ...(cols as unknown as Omit<ProgressionSnap, 'recentKills' | 'lastTs' | 'windowStart' | 'dropped'>),
    ...extra.cols,
    recentKills: [...older.recentKills.map((k) => ({ ...k })), ...live].slice(-RECENT_KILL_CAP),
    lastTs: Math.max(older.lastTs, newer.lastTs),
    windowStart: Math.max(older.windowStart, newer.windowStart, cut.window, extra.window),
    dropped: older.dropped + newer.dropped + cut.dropped + extra.dropped
  }
}
