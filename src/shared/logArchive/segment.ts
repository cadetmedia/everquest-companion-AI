// shared/logArchive/segment.ts — ONE ARCHIVED STRETCH OF ONE CHARACTER'S LOG (step 1.1).
//
// A segment holds the identity of the log it was captured from, the module snapshots the engine
// published from it, and where its compressed archive is. The plan's README defines the words.
//
// STATES MOVE ONE WAY: `captured` (totals written, no archive), `backed-up` (a verified archive
// exists), `sealed` (may be shown as history). Only a sealed segment is ever merged.
//
// A FILE THAT DOES NOT PARSE IS SKIPPED AND REPORTED, never repaired in place. A newer version is
// skipped the same way: an older build must not guess at a shape it has not seen.
//
// ZERO-IMPORT: the main-side store and the node tests both read it. (The two imports are types and
// are erased.)

import type { SegmentSummary } from '../combat'
import type { RespawnRow } from '../respawn'

/** Bump when a field changes meaning. A segment from a newer version is skipped, not guessed at.
 *  `fights` (step 4.7) and `respawnHistory` (step 4.14) did not bump it: each field is optional and
 *  adds nothing to what the others mean, so a segment written before it reads as one without it. */
export const SEGMENT_VERSION = 1

/** How many bytes of a log's head identify it: enough to differ between any two real logs. */
export const HEAD_BYTES = 64 * 1024

export type SegmentState = 'captured' | 'backed-up' | 'sealed'

const STATES: readonly SegmentState[] = ['captured', 'backed-up', 'sealed']

/** The log a segment was captured from. */
export interface SegmentLog {
  /** Byte length of the log at capture. */
  bytes: number
  /** SHA-256 (hex) of the whole log at capture. */
  sha256: string
  /** How many bytes `headSha256` covers: `HEAD_BYTES`, or the whole log if it was shorter. */
  headBytes: number
  /** SHA-256 (hex) of the first `headBytes` bytes. A live log that begins with these bytes still
   *  contains this segment. */
  headSha256: string
  /** The first and last line's stamp as a sortable wall-clock key, `logStampKey` below. */
  firstStamp: string
  lastStamp: string
}

/** One module's snapshot as the engine served it. */
export interface SegmentModule {
  seq: number
  state: unknown
}

export interface Segment {
  v: number
  /** Unique per segment; also its file name. */
  id: string
  /** `name_server`, lower case: `main/log/config.ts characterId`. */
  character: string
  state: SegmentState
  log: SegmentLog
  /** Which build produced the totals, so a later parser can re-derive them (phase 5). */
  producedBy: { app: string; engine: string }
  /** The compressed archive, once one exists. */
  archivePath: string | null
  /** What the archive holds once uncompressed. It can be longer than `log` when the game wrote
   *  lines between the capture and a rotation (phase 3); `gapLines` counts them. */
  archiveSource?: { bytes: number; sha256: string }
  /** The archive's size on disk. */
  archiveGzBytes?: number
  /** Lines in the archive that the totals do not include (a live archive's capture window). */
  gapLines?: number
  /** Every module the engine published, keyed by module id. */
  modules: Record<string, SegmentModule>
  /** Every fight's summary (ruling 0.4: summaries only; the breakdown stays in the archive).
   *  Absent on a segment captured before step 4.7, or when the engine had no fight list to give. */
  fights?: SegmentSummary[]
  /** The learned respawn rows of every mob the fold remembered, watched or not (step 4.14). Absent
   *  on a segment captured before that step, or when the engine could not be read. */
  respawnHistory?: RespawnRow[]
  /** The app version whose refresh last tried to fill the extras (fights, respawn history, the
   *  faction ledger). A refresh at launch is not tried again by the same version. */
  extrasTriedBy?: string
}

export type ParsedSegment = { ok: true; segment: Segment } | { ok: false; reason: string }

function isObject(x: unknown): x is Record<string, unknown> {
  return x !== null && typeof x === 'object' && !Array.isArray(x)
}

function isCount(x: unknown): x is number {
  return typeof x === 'number' && Number.isInteger(x) && x >= 0
}

const HEX64 = /^[0-9a-f]{64}$/

function logProblem(log: unknown): string | null {
  if (!isObject(log)) return 'no log identity'
  if (!isCount(log.bytes) || !isCount(log.headBytes)) return 'log sizes are not counts'
  if (typeof log.sha256 !== 'string' || !HEX64.test(log.sha256)) return 'log hash is not SHA-256'
  if (typeof log.headSha256 !== 'string' || !HEX64.test(log.headSha256)) {
    return 'head hash is not SHA-256'
  }
  if (typeof log.firstStamp !== 'string' || typeof log.lastStamp !== 'string') {
    return 'log stamps missing'
  }
  return null
}

function modulesProblem(modules: unknown): string | null {
  if (!isObject(modules)) return 'no modules'
  for (const [id, m] of Object.entries(modules)) {
    if (!isObject(m) || typeof m.seq !== 'number' || !('state' in m)) return `module ${id} malformed`
  }
  return null
}

function fightsProblem(fights: unknown): string | null {
  if (fights === undefined) return null
  if (!Array.isArray(fights)) return 'fights is not a list'
  const bad = fights.some((f) => !isObject(f) || typeof f.id !== 'string' || typeof f.name !== 'string' || typeof f.startTs !== 'number')
  return bad ? 'a fight summary is malformed' : null
}

function respawnHistoryProblem(rows: unknown): string | null {
  if (rows === undefined) return null
  if (!Array.isArray(rows)) return 'respawn history is not a list'
  const bad = rows.some((r) => !isObject(r) || typeof r.id !== 'string' || typeof r.key !== 'string')
  return bad ? 'a respawn history row is malformed' : null
}

function versionProblem(v: unknown): string | null {
  if (typeof v !== 'number') return 'no version'
  if (v > SEGMENT_VERSION) return `version ${v} is newer than this build reads`
  return v === SEGMENT_VERSION ? null : `unknown version ${v}`
}

/** Why `raw` is not a segment this build can read, or null when it is one. */
function segmentProblem(raw: unknown): string | null {
  if (!isObject(raw)) return 'not an object'
  const version = versionProblem(raw.v)
  if (version !== null) return version
  if (typeof raw.id !== 'string' || raw.id === '') return 'no id'
  if (typeof raw.character !== 'string' || raw.character === '') return 'no character'
  if (!STATES.includes(raw.state as SegmentState)) return 'unknown state'
  if (raw.archivePath !== null && typeof raw.archivePath !== 'string') return 'bad archive path'
  if (!isObject(raw.producedBy)) return 'no producer'
  return contentProblem(raw)
}

/** The log identity, the modules, the fights and the respawn history: what a segment holds rather than names. */
function contentProblem(raw: Record<string, unknown>): string | null {
  return logProblem(raw.log) ?? modulesProblem(raw.modules) ?? fightsProblem(raw.fights) ?? respawnHistoryProblem(raw.respawnHistory)
}

/** Read a segment from parsed JSON. Never throws. */
export function parseSegment(raw: unknown): ParsedSegment {
  const problem = segmentProblem(raw)
  return problem === null ? { ok: true, segment: raw as Segment } : { ok: false, reason: problem }
}

const MONTHS: Record<string, string> = {
  Jan: '01', Feb: '02', Mar: '03', Apr: '04', May: '05', Jun: '06',
  Jul: '07', Aug: '08', Sep: '09', Oct: '10', Nov: '11', Dec: '12'
}

const STAMP = /^\[\w{3} (\w{3}) (\d{2}) (\d{2}:\d{2}:\d{2}) (\d{4})\]/

/**
 * A log line's stamp as `YYYY-MM-DD HH:MM:SS`, which sorts as text, or null for a line without one.
 *
 * WALL CLOCK ON PURPOSE. The overlap check compares the game's own printed times, so no time zone
 * enters it. In the hour the clocks go back, a later line can print an earlier time; the check then
 * holds a segment back, which is the safe direction (step 1.2).
 */
export function logStampKey(line: string): string | null {
  const m = STAMP.exec(line)
  if (!m) return null
  const month = MONTHS[m[1]]
  if (month === undefined) return null
  return `${m[4]}-${month}-${m[2]} ${m[3]}`
}
