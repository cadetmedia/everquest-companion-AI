// shared/logArchive/mergeRespawn.ts — the `respawn` module across an archive and the live log
// (step 4.4).
//
// WHAT THE SNAPSHOT HOLDS. The fold (`respawn.rs`) keeps a history of up to 800 mobs, but publishes
// only two views of it: a clock row for each WATCHED mob (at most `RESPAWN_MAX_ROWS`), carrying its
// learned gaps, and the `RESPAWN_MAX_RECENT` most recently killed mobs as watch candidates. A
// segment holds those views, so the learned gaps an archive can give back are the gaps of mobs that
// were watched when it was captured. The 800 cap cannot bind on what is published.
//
// WHAT IS LEARNED, AND JOINED: per mob and zone, kills and samples add, the observed bound takes the
// smaller, and the gaps join newest first under the engine's own cap of six. The estimate is then
// re-read through the same ladder (`resolveRespawn`). A candidate's kills add and its last kill
// takes the later.
//
// WHAT BELONGS TO THE PRESENT, AND IS NOT: the zone, the watch list and every custom number come
// from the live state only. An archived clock row is shown only for a mob the live watch list still
// watches, numbered with today's custom value. A gap that spans the cut (the last death in the
// archive to the first in the live log) is not recovered: neither side measured it.
//
// UNWATCHED MOBS (step 4.14). A segment captured since step 4.14 also keeps `respawnHistory`, the
// learned rows of every mob the fold remembered, read by watching them in batches
// (`main/logArchive/respawnHistory.ts`). `withHistoryRows` puts the rows of the mobs the live list
// watches today into an archived state, and gives it today's watch list, before the fold: so a mob
// first watched after its log was archived still gets the gaps learned there, and a fold over
// several archives filters by today's list rather than by each archive's own.
//
// THE ZONE ACROSS THE CUT (step 3.8). Before its first zone line the fold stands in zone '', so a
// fresh log's header is blank and its deaths are filed under ''. Read as one log, it stood in the
// zone the archive ended in, so the merge files those rows and candidates there (joining one the
// live side already holds for that zone), and a blank live header shows the archive's zone. Only ''
// moves: the fold never files a death under '' once it has read a zone line.

import {
  RESPAWN_MAX_GAPS,
  RESPAWN_MAX_RECENT,
  RESPAWN_MAX_ROWS,
  resolveRespawn,
  respawnZoneKey,
  type RespawnCandidate,
  type RespawnRow,
  type RespawnSnap
} from '../respawn'

function isRespawnSnap(x: unknown): x is RespawnSnap {
  if (x === null || typeof x !== 'object') return false
  const s = x as Record<string, unknown>
  return typeof s.v === 'number' && Array.isArray(s.rows) && Array.isArray(s.recent)
}

function watchesOf(snap: RespawnSnap): Map<string, number | undefined> {
  const out = new Map<string, number | undefined>()
  const watches = Array.isArray(snap.prefs?.watches) ? snap.prefs.watches : []
  for (const w of watches) out.set(w.key, typeof w.customSec === 'number' ? w.customSec * 1000 : undefined)
  return out
}

/** The estimate ladder over a row's (re)joined evidence. */
function withEstimate(row: RespawnRow): RespawnRow {
  const { estimateMs, source } = resolveRespawn(row)
  const out: RespawnRow = { ...row, source }
  if (estimateMs === undefined) delete out.estimateMs
  else out.estimateMs = estimateMs
  return out
}

function joinRow(older: RespawnRow, newer: RespawnRow): RespawnRow {
  const out: RespawnRow = { ...newer, kills: older.kills + newer.kills, samples: older.samples + newer.samples }
  const bounds = [older.observedMs, newer.observedMs].filter((n): n is number => typeof n === 'number')
  if (bounds.length > 0) out.observedMs = Math.min(...bounds)
  const gaps = [...(newer.gapsMs ?? []), ...(older.gapsMs ?? [])].slice(0, RESPAWN_MAX_GAPS)
  if (gaps.length > 0) out.gapsMs = gaps
  return withEstimate(out)
}

/** An archived row for a mob the live list still watches, numbered with today's custom value. */
function archivedRow(row: RespawnRow, customMs: number | undefined): RespawnRow {
  const out: RespawnRow = { ...row }
  if (customMs === undefined) delete out.customMs
  else out.customMs = customMs
  return withEstimate(out)
}

function mergeRows(older: RespawnSnap, newer: RespawnSnap): RespawnRow[] {
  const olderById = new Map(older.rows.map((r) => [r.id, r]))
  const newerIds = new Set(newer.rows.map((r) => r.id))
  const watches = watchesOf(newer)
  const rows = newer.rows.map((r) => {
    const prev = olderById.get(r.id)
    return prev === undefined ? { ...r } : joinRow(prev, r)
  })
  const archivedOnly = older.rows
    .filter((r) => !newerIds.has(r.id) && watches.has(r.key))
    .sort((a, b) => b.baseTs - a.baseTs)
    .map((r) => archivedRow(r, watches.get(r.key)))
  return [...rows, ...archivedOnly].slice(0, RESPAWN_MAX_ROWS)
}

const candidateId = (c: RespawnCandidate): string => `${respawnZoneKey(c.zone)}::${c.key}`

function mergeRecent(older: RespawnSnap, newer: RespawnSnap): RespawnCandidate[] {
  const watches = watchesOf(newer)
  const byId = new Map<string, RespawnCandidate>()
  for (const c of newer.recent) byId.set(candidateId(c), { ...c })
  for (const c of older.recent) {
    const prev = byId.get(candidateId(c))
    if (prev === undefined) {
      byId.set(candidateId(c), { ...c, watched: watches.has(c.key) })
      continue
    }
    prev.kills += c.kills
    prev.lastTs = Math.max(prev.lastTs, c.lastTs)
  }
  // Stable, so ties keep the fold's own order: the live log's first, then the archive's.
  return [...byId.values()].sort((a, b) => b.lastTs - a.lastTs).slice(0, RESPAWN_MAX_RECENT)
}

/** `newer` with what it filed under zone '' moved to `zone`, the zone the older side ended in. */
function carryZone(newer: RespawnSnap, zone: string): RespawnSnap {
  if (zone === '') return newer
  const rows = new Map<string, RespawnRow>()
  for (const r of newer.rows) {
    const before = r.zone === ''
    const row = before ? { ...r, zone, id: `${respawnZoneKey(zone)}::${r.key}` } : r
    const prev = rows.get(row.id)
    rows.set(row.id, prev === undefined ? row : before ? joinRow(row, prev) : joinRow(prev, row))
  }
  const recent = new Map<string, RespawnCandidate>()
  for (const c of newer.recent) {
    const cand = c.zone === '' ? { ...c, zone } : c
    const prev = recent.get(candidateId(cand))
    const joined = prev === undefined ? cand : { ...prev, kills: prev.kills + cand.kills, lastTs: Math.max(prev.lastTs, cand.lastTs) }
    recent.set(candidateId(cand), joined)
  }
  return { ...newer, zone: newer.zone === '' ? zone : newer.zone, rows: [...rows.values()], recent: [...recent.values()] }
}

/** `older` then `newer`, or null when either is not a respawn snapshot of the same shape version. */
export function mergeRespawn(older: unknown, newer: unknown): RespawnSnap | null {
  if (!isRespawnSnap(older) || !isRespawnSnap(newer) || older.v !== newer.v) return null
  const live = carryZone(newer, older.zone)
  return { ...live, rows: mergeRows(older, live), recent: mergeRecent(older, live) }
}

/**
 * An archived state with its history rows for every mob `live` watches, and `live`'s watch list.
 * A row the archived state already has is left as captured. Anything else comes back as is.
 */
export function withHistoryRows(archived: unknown, history: readonly RespawnRow[], live: unknown): unknown {
  if (!isRespawnSnap(archived) || !isRespawnSnap(live)) return archived
  const watches = watchesOf(live)
  const have = new Set(archived.rows.map((r) => r.id))
  const extra = history.filter((r) => watches.has(r.key) && !have.has(r.id))
  return { ...archived, prefs: live.prefs, rows: [...archived.rows, ...extra] }
}
