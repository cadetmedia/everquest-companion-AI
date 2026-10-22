// main/logArchive/capture.ts — RECORD A SEGMENT FROM THE RUNNING ENGINE (step 2.1).
//
// Reads only. Asks the engine where it has read to (`session.health`), takes every module's
// snapshot, and asks again. If the read position moved in between, a line landed mid-capture and
// the snapshots may straddle it, so the capture is thrown away and taken again (a few times, then
// it gives up and says so). The segment then describes exactly bytes [0, offset) of the log, which
// the game never changes because it only appends.
//
// REFUSES, WITH THE REASON, when the switch is off, no character is attached, or the engine is not
// live on this log.
//
// FIGHTS (step 4.7, ruling 0.4): every fight's summary is taken inside the same before/after pair
// as the modules, so it describes the same bytes. The breakdown is not kept; the archive holds it.
// An engine that cannot give the list leaves the segment without `fights`, as before step 4.7.
//
// RESPAWN HISTORY (step 4.14, `respawnHistory.ts`) is read AFTER the pair has held, never inside
// it: it is a couple of dozen engine round trips, and inside the pair any line the game writes
// meanwhile would throw the whole capture away, so an archive during busy play would keep failing.
// Read after, it is kept only if the log still has not moved; otherwise the segment goes without
// it, and the refresh at the next launch takes it from the archive instead. Taken after the
// modules, the `respawn` snapshot shows the player's own watch list, not a batch of the reader's.

import { CAPTURED_MODULES } from '../../shared/logArchive/modules'
import type { SegmentSummary } from '../../shared/combat'
import type { RespawnRow } from '../../shared/respawn'
import { SEGMENT_VERSION, type Segment, type SegmentLog, type SegmentModule } from '../../shared/logArchive/segment'

export interface EngineHealth {
  status: string
  mark?: { log: string; offset: number }
  events?: number
}

export interface CaptureDeps {
  on: () => boolean
  attached: () => { character: string; logPath: string } | null
  health: () => Promise<EngineHealth>
  /** One module's served snapshot, or null when the engine has no such module. */
  snapshot: (module: string) => Promise<SegmentModule | null>
  /** Every fight's summary, uncapped (`capturedFights`), or null when the engine has none to give. */
  fights: () => Promise<SegmentSummary[] | null>
  /** Every remembered mob's learned respawn rows, given the modules just taken; null when unread. */
  respawnHistory?: (modules: Record<string, SegmentModule>) => Promise<RespawnRow[] | null>
  readPrefix: (path: string, bytes: number) => Promise<SegmentLog>
  producedBy: () => { app: string; engine: string }
}

export type CaptureResult = { ok: true; segment: Segment } | { ok: false; reason: string }

const TRIES = 4

function samePath(a: string, b: string): boolean {
  return a.replace(/\\/g, '/').toLowerCase() === b.replace(/\\/g, '/').toLowerCase()
}

/** Why the engine's answer cannot be captured from, or null when it can. */
function healthProblem(h: EngineHealth, logPath: string): string | null {
  if (h.status !== 'live') return `the engine is still ${h.status === 'folding' ? 'reading the log' : h.status}; try again in a minute`
  if (h.mark === undefined || !samePath(h.mark.log, logPath)) return 'the engine is not reading this character’s log'
  if (h.mark.offset <= 0) return 'the log is empty; there is nothing to keep yet'
  return null
}

async function snapshotAll(deps: CaptureDeps): Promise<Record<string, SegmentModule>> {
  const modules: Record<string, SegmentModule> = {}
  for (const id of CAPTURED_MODULES) {
    const snap = await deps.snapshot(id)
    if (snap !== null) modules[id] = snap
  }
  return modules
}

/** The segment's id and file name: character, first line, and length, all safe file-name text. */
export function segmentId(character: string, log: SegmentLog): string {
  const when = log.firstStamp.replace(/[-: ]/g, '') || 'nostamp'
  return `${character.replace(/[^a-z0-9_]/gi, '')}-${when}-${log.bytes}`
}

interface Taken {
  modules: Record<string, SegmentModule>
  fights: SegmentSummary[] | null
  respawnHistory: RespawnRow[] | null
}

/** The modules and the fights, inside the before/after pair. */
async function takeAll(deps: CaptureDeps): Promise<Taken> {
  const modules = await snapshotAll(deps)
  const fights = await deps.fights()
  return { modules, fights, respawnHistory: null }
}

/** The respawn history, after the pair; null unless the log is still where the pair saw it. */
async function historyIfStill(deps: CaptureDeps, before: EngineHealth, modules: Record<string, SegmentModule>): Promise<RespawnRow[] | null> {
  if (deps.respawnHistory === undefined) return null
  const rows = await deps.respawnHistory(modules)
  const now = await deps.health()
  return now.mark?.offset === before.mark?.offset && now.events === before.events ? rows : null
}

function toSegment(deps: CaptureDeps, character: string, log: SegmentLog, t: Taken): Segment {
  return {
    v: SEGMENT_VERSION,
    id: segmentId(character, log),
    character,
    state: 'captured',
    log,
    producedBy: deps.producedBy(),
    archivePath: null,
    modules: t.modules,
    ...(t.fights === null ? {} : { fights: t.fights }),
    ...(t.respawnHistory === null ? {} : { respawnHistory: t.respawnHistory })
  }
}

/** Take one consistent capture, in state `captured`. Nothing is written here. */
export async function captureSegment(deps: CaptureDeps): Promise<CaptureResult> {
  if (!deps.on()) return { ok: false, reason: 'Summarize and archive log is off' }
  const a = deps.attached()
  if (a === null) return { ok: false, reason: 'no character is attached' }
  for (let i = 0; i < TRIES; i++) {
    const before = await deps.health()
    const problem = healthProblem(before, a.logPath)
    if (problem !== null) return { ok: false, reason: problem }
    const taken = await takeAll(deps)
    const after = await deps.health()
    if (after.mark?.offset !== before.mark?.offset || after.events !== before.events) continue
    const log = await deps.readPrefix(a.logPath, before.mark?.offset ?? 0)
    const respawnHistory = await historyIfStill(deps, before, taken.modules)
    return { ok: true, segment: toSegment(deps, a.character, log, { ...taken, respawnHistory }) }
  }
  return { ok: false, reason: 'the log kept growing while it was being read; try again in a quiet moment' }
}
