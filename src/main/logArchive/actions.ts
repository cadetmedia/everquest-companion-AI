// main/logArchive/actions.ts — WHAT THE LOG ARCHIVE CARD CAN ASK FOR (steps 2.1 to 2.5, 3.2, 3.5, 3.6, 5.5).
//
// Every action checks the switch first and refuses while it is off; nothing here runs unless the
// player clicked for it. One action at a time. Each returns the outcome in plain words and the
// card's whole state afterwards.
//
// The engine ships with the app, so the app version names the parser that produced a segment.

import { app } from 'electron'
import { existsSync, readdirSync, statfsSync, statSync } from 'node:fs'
import { basename, dirname, join } from 'node:path'
import { engineRequest, engineServeReadiness } from '../dataServer/engineClientHost'
import { characterId } from '../log/config'
import { getActiveCharacter } from '../session'
import { getLogArchivePrefs, logArchiveOn, setLogArchivePrefs } from '../storeLogArchive'
import { HELD_TEXT, type DumpAdvice, type LogArchiveReply, type LogArchiveStatus, type SegmentRow } from '../../shared/logArchive/panel'
import { driveOf, rotateBlockers } from '../../shared/logArchive/preflight'
import { ALL_FIGHTS, capturedFights } from '../../shared/logArchive/mergeFights'
import type { Segment } from '../../shared/logArchive/segment'
import { CAPTURED_MODULES } from '../../shared/logArchive/modules'
import { archiveName, backupLog, sweepTemp } from './backup'
import { captureSegment, type CaptureDeps } from './capture'
import { archiveBuckets, placeArchivedBuckets } from './engineBuckets'
import { liveHistory, logArchiveDir } from './liveHistory'
import { readLogPrefix } from './logPrefix'
import { refoldWithApp } from './refoldActions'
import { historyKeys, readRespawnHistory } from './respawnHistory'
import { writeFactionLedger, type LedgerSource } from './factionLedgerFile'
import { liveLogName } from './refold'
import { ledgerFileName } from '../../shared/factionLedger'
import { logInfo } from '../errorLog'
import { readDefine } from '../dataServer/appKnowledge'
import { pushAppKnowledge } from '../dataServer/definePush'
import type { RespawnRow } from '../../shared/respawn'
import { refreshSegment, sweepRefreshLeftovers } from './refresh'
import { readJournal, recoverRotation, restoreLog, rotateLog, type RotateDeps } from './rotate'
import { listSegments, writeSegment } from './segmentStore'

let busy: string | null = null
/** One archive per app run: see `archivedThisRun` in preflight.ts. */
let archivedThisRun = false
/** The captured modules the running engine serves, learned once it has caught up; null before. */
let engineModules: ReadonlySet<string> | null = null

function attached(): { character: string; logPath: string } | null {
  const c = getActiveCharacter()
  return c === null ? null : { character: characterId(c), logPath: c.logPath }
}

/** Step 4.14: every remembered mob's learned rows, read off the live engine by watching them in
 *  batches; the player's own watch list is pushed back from the store afterwards. */
async function liveRespawnHistory(modules: Parameters<NonNullable<CaptureDeps['respawnHistory']>>[0]): Promise<RespawnRow[] | null> {
  return readRespawnHistory(historyKeys(modules.kills?.state, modules.respawn?.state), {
    watch: async (keys) => {
      await engineRequest('respawn.define', { prefs: { watches: keys.map((key) => ({ key, display: key })) } })
    },
    rows: async () => {
      const r = await engineRequest('module.snapshot', { module: 'respawn' })
      const rows = (r.state as { rows?: unknown } | null)?.rows
      return Array.isArray(rows) ? (rows as RespawnRow[]) : null
    },
    restore: async () => {
      await engineRequest('respawn.define', readDefine('respawn.define'))
    },
    restoreFailed: (err) => {
      logInfo(`[everquest-companion] log archive: the respawn watch list could not be put back directly (${String(err)}); re-pushing it`)
      pushAppKnowledge('respawn.define')
    }
  })
}

const captureDeps: CaptureDeps = {
  on: () => logArchiveOn(),
  attached,
  health: async () => engineRequest('session.health', {}),
  snapshot: async (module) => {
    try {
      const r = await engineRequest('module.snapshot', { module })
      return r.module === module ? { seq: r.seq, state: r.state } : null
    } catch {
      return null
    }
  },
  fights: async () => {
    try {
      const r = await engineRequest('combat.snapshot', { opts: { maxSegments: ALL_FIGHTS } })
      return capturedFights((r.snapshot as { segments?: unknown }).segments)
    } catch {
      return null
    }
  },
  respawnHistory: liveRespawnHistory,
  readPrefix: readLogPrefix,
  producedBy: () => ({ app: app.getVersion(), engine: app.getVersion() })
}

/** Step 4.16: write a ledger; a failure is noted and costs only that stretch's faction lines. */
async function keepFactionLedger(dir: string, segmentId: string, source: LedgerSource): Promise<void> {
  try {
    const n = await writeFactionLedger(dir, segmentId, source)
    logInfo(`[everquest-companion] log archive: kept ${n} faction line(s) of ${segmentId}`)
  } catch (err) {
    logInfo(`[everquest-companion] log archive: the faction lines of ${segmentId} were not kept: ${(err as Error).message}`)
  }
}

const rotateDeps: RotateDeps = {
  backup: backupLog,
  readPrefix: readLogPrefix,
  factionLedger: keepFactionLedger,
  writeSegment,
  readSegment: (dir, id) => listSegments(dir).segments.find((s) => s.id === id) ?? null
}

function freeBytes(dir: string): number | null {
  try {
    const s = statfsSync(existsSync(dir) ? dir : dirname(dir))
    return s.bavail * s.bsize
  } catch {
    return null
  }
}

function row(s: Segment): SegmentRow {
  return {
    id: s.id,
    state: s.state,
    firstStamp: s.log.firstStamp,
    lastStamp: s.log.lastStamp,
    logBytes: s.log.bytes,
    gzBytes: s.archiveGzBytes ?? null,
    archivePath: s.archivePath,
    gapLines: s.gapLines ?? 0,
    app: s.producedBy.app,
    olderEngine: s.producedBy.engine !== app.getVersion() || lacksModules(s)
  }
}

/** The segment was captured before this engine had one of its modules (a new tab's data), or lacks
 *  one of the extras (fights, step 4.7; respawn history, 4.14; the faction ledger, 4.16). */
function lacksModules(s: Segment): boolean {
  if (engineModules === null) return false
  if (lacksExtras(s)) return true
  return [...engineModules].some((m) => !Object.prototype.hasOwnProperty.call(s.modules, m))
}

/**
 * An extra is missing AND no refresh by this version has tried yet. A refresh whose read of an
 * extra failed keeps it missing and stamps `extrasTriedBy`, so a failing read costs one refold per
 * version, not one per launch; an archive made by this version that dropped its respawn history
 * (capture.ts) is still refreshed once.
 */
function lacksExtras(s: Segment): boolean {
  if (s.extrasTriedBy === app.getVersion()) return false
  const ledger = existsSync(join(logArchiveDir(), ledgerFileName(s.id)))
  return s.fights === undefined || s.respawnHistory === undefined || !ledger
}

/** Ask the engine which captured modules it serves. Once per run, after it has caught up. */
export async function learnEngineModules(): Promise<void> {
  const served = await Promise.all(CAPTURED_MODULES.map(async (m) => ((await captureDeps.snapshot(m)) !== null ? m : null)))
  engineModules = new Set(served.filter((m): m is string => m !== null))
}

/**
 * Refresh every kept history that lacks a module this engine serves, or was recorded by an older
 * version, oldest first, so a new tab's data and every later fix reach logs archived before them
 * without the player coming back to the card (owner, 2026-10-06; 2026-10-18 for older versions: an
 * archive read by test.19 still listed pets and AA casts as unknown on the Gaps tab under test.26).
 * A refresh stamps the archive with this version, so it runs once per update, not once per launch.
 */
export async function refreshLackingHistories(note: (line: string) => void): Promise<void> {
  const a = attached()
  if (!logArchiveOn() || a === null || engineModules === null) return
  const lacking = listSegments(logArchiveDir(), a.character).segments.filter(
    (s) => s.state === 'sealed' && s.archivePath !== null && (s.producedBy.engine !== app.getVersion() || lacksModules(s))
  )
  for (const s of lacking.sort((x, y) => x.log.lastStamp.localeCompare(y.log.lastStamp))) {
    const r = await refreshHistory(s.id)
    note(`log archive (automatic refresh of ${s.id}): ${r.message}`)
  }
}

/** Step 2.5: when were the inventory and faction dumps last written, beside the log's last write. */
function dumpAdvice(logPath: string, logModified: number): DumpAdvice {
  const stem = basename(logPath).replace(/^eqlog_/i, '').replace(/\.txt$/i, '').toLowerCase()
  const root = dirname(dirname(logPath))
  let files: string[] = []
  try {
    files = readdirSync(root)
  } catch {
    // No folder to read: both dumps read as never written.
  }
  // The newest of this character's dumps of a kind. The factions dump carries a class token
  // (`Drywrought_oggok-WAR-Factions.txt`), so anything between the stem and the suffix is allowed,
  // as shared/outputs/kinds.ts preferredOutputFile allows it.
  const mtime = (kind: string): number | null => {
    const own = files.filter((f) => f.toLowerCase().startsWith(`${stem}-`) && f.toLowerCase().endsWith(`-${kind.toLowerCase()}.txt`))
    // A dump can be replaced between the listing and the stat; a vanished one reads as absent.
    const times = own.map((f) => statSync(join(root, f), { throwIfNoEntry: false })?.mtimeMs ?? 0)
    return times.length > 0 ? Math.max(...times) : null
  }
  const inventoryMs = mtime('Inventory')
  const factionsMs = mtime('Factions') ?? mtime('Faction')
  const stale = [inventoryMs, factionsMs].some((t) => t === null || t < logModified - 24 * 3600_000)
  return { inventoryMs, factionsMs, stale }
}

function liveLog(a: { logPath: string } | null): LogArchiveStatus['live'] {
  const st = a === null ? undefined : statSync(a.logPath, { throwIfNoEntry: false })
  if (a === null || st === undefined) return null
  return { path: a.logPath, bytes: st.size, modifiedMs: st.mtimeMs }
}

function newestSealed(rows: SegmentRow[]): string | null {
  const sealed = rows.filter((r) => r.state === 'sealed').sort((x, y) => x.lastStamp.localeCompare(y.lastStamp))
  return sealed.length > 0 ? sealed[sealed.length - 1].id : null
}

/** The card's whole state. Reads the folder only while the switch is on. */
export function logArchiveStatus(): LogArchiveStatus {
  const dir = logArchiveDir()
  const on = getLogArchivePrefs().enabled
  const a = attached()
  const base: LogArchiveStatus = {
    enabled: on,
    dir,
    live: liveLog(a),
    segments: [],
    archived: [],
    newestSealedId: null,
    held: [],
    skipped: [],
    dumps: null,
    rotateBlockers: [],
    busy
  }
  return on ? fillOn(base, dir, a) : base
}

function fillOn(base: LogArchiveStatus, dir: string, a: { character: string; logPath: string } | null): LogArchiveStatus {
  const listing = listSegments(dir, a?.character)
  const ctx = liveHistory.status()
  base.segments = listing.segments.map(row).sort((x, y) => x.firstStamp.localeCompare(y.firstStamp))
  base.archived = base.segments.filter((s) => s.state === 'sealed')
  base.newestSealedId = newestSealed(base.segments)
  base.held = (ctx?.held ?? []).map((h) => ({ id: h.id, text: HELD_TEXT[h.reason] }))
  base.skipped = listing.skipped
  base.dumps = base.live !== null ? dumpAdvice(base.live.path, base.live.modifiedMs) : null
  base.rotateBlockers = rotateBlockers({
    on: true,
    hasLog: base.live !== null,
    engineLive: engineServeReadiness().ok,
    sameDrive: a === null || driveOf(a.logPath) === driveOf(dir),
    freeBytes: freeBytes(dir),
    logBytes: base.live?.bytes ?? 0,
    interrupted: readJournal(dir) !== null,
    busy: busy !== null,
    archivedThisRun
  })
  return base
}

function reply(ok: boolean, message: string): LogArchiveReply {
  return { ok, message, status: logArchiveStatus() }
}

/** Run one action at a time, behind the switch. */
async function exclusive(label: string, fn: () => LogArchiveReply | Promise<LogArchiveReply>): Promise<LogArchiveReply> {
  if (!logArchiveOn()) return reply(false, 'Summarize and archive log is off.')
  if (busy !== null) return reply(false, `Busy: ${busy}.`)
  busy = label
  let r: LogArchiveReply
  try {
    r = await fn()
  } catch (err) {
    r = reply(false, (err as Error).message)
  } finally {
    busy = null
  }
  // The status in `r` was read while this action still held `busy`; read it again so the card
  // does not keep showing the action as running.
  return { ...r, status: logArchiveStatus() }
}

/** The switch. Turning it on or off changes what the tabs show, so the merge context is reset. */
export function setLogArchiveEnabled(enabled: boolean): LogArchiveReply {
  setLogArchivePrefs({ enabled })
  liveHistory.forgetHistoryContext()
  return reply(true, enabled ? 'Summarize and archive log is on.' : 'Summarize and archive log is off. Your archives stay where they are.')
}

/** Steps 2.1 and 2.2: capture, then a verified compressed copy. The live log is only read. */
export function backupNow(): Promise<LogArchiveReply> {
  return exclusive('backing up the log', async () => {
    const dir = logArchiveDir()
    sweepTemp(dir)
    const cap = await captureSegment(captureDeps)
    if (!cap.ok) return reply(false, `Not backed up: ${cap.reason}.`)
    const s = cap.segment
    // The same bytes captured again carry the same id; writing over a backup or a kept history
    // would take it off the tabs until it was kept a second time.
    const had = rotateDeps.readSegment(dir, s.id)
    if (had !== null && had.state !== 'captured') return reply(true, `Already backed up: ${had.archivePath ?? dir}.`)
    writeSegment(dir, s)
    const logPath = attached()?.logPath ?? ''
    const name = archiveName(basename(logPath), s.log.firstStamp, s.log.lastStamp)
    const b = await backupLog({ source: logPath, bytes: s.log.bytes, expectSha256: s.log.sha256, dir, name })
    if (!b.ok) return reply(false, `Not backed up: ${b.reason}. The capture is kept and can be backed up again.`)
    writeSegment(dir, {
      ...s,
      state: 'backed-up',
      archivePath: b.path,
      archiveSource: { bytes: b.bytes, sha256: b.sha256 },
      archiveGzBytes: b.gzBytes
    })
    return reply(true, `Backed up ${b.bytes.toLocaleString()} bytes to ${b.path}.`)
  })
}

/** Step 2.3: seal a backed-up segment so its history may be shown. */
export function keepHistory(id: string): Promise<LogArchiveReply> {
  return exclusive('keeping history', () => {
    const dir = logArchiveDir()
    const s = rotateDeps.readSegment(dir, id)
    if (s === null) return reply(false, 'That backup was not found.')
    if (s.state !== 'backed-up') return reply(false, s.state === 'sealed' ? 'That history is already kept.' : 'Back it up first.')
    writeSegment(dir, { ...s, state: 'sealed' })
    liveHistory.noteSealedThisAttach(id)
    return reply(true, 'Kept. It shows on the tabs once your current log no longer contains it.')
  })
}

/** Step 3.5: archive the live log and start a fresh one. The card has confirmed with the player. */
export function rotateNow(): Promise<LogArchiveReply> {
  return exclusive('archiving the log', async () => {
    const blockers = logArchiveStatus().rotateBlockers.filter((b) => !b.startsWith('Another'))
    if (blockers.length > 0) return reply(false, blockers.join(' '))
    const a = attached()
    if (a === null) return reply(false, 'No character log is attached.')
    // Step 5.2: resist and message history is read between the capture and the move (engineBuckets.ts).
    const buckets = archiveBuckets(app.getPath('userData'), a.character)
    await buckets.settle()
    const cap = await captureSegment(captureDeps)
    if (!cap.ok) return reply(false, `Not archived: ${cap.reason}. Nothing has changed.`)
    const dir = logArchiveDir()
    buckets.take()
    const r = await rotateLog(a.logPath, dir, cap.segment, rotateDeps)
    buckets.keep(dir, cap.segment.id, r.ok || r.logTouched)
    if (!r.ok) return reply(false, r.logTouched ? `Interrupted: ${r.reason}` : `Not archived: ${r.reason}`)
    liveHistory.noteSealedThisAttach(r.segment.id)
    archivedThisRun = true
    const gap = r.segment.gapLines ?? 0
    const extra = gap > 0 ? ` ${gap} line(s) written during the move are in the archive but not in the totals.` : ''
    return reply(true, `Archived to ${r.segment.archivePath ?? dir}. Your history is kept.${extra}`)
  })
}

/** Step 3.6: put the newest archived log back in front of the live one, then restart the app. */
export function restoreNow(id: string): Promise<LogArchiveReply> {
  return exclusive('putting a log back', async () => {
    const dir = logArchiveDir()
    const a = attached()
    if (a === null) return reply(false, 'No character log is attached.')
    const mine = listSegments(dir, a.character).segments.filter((s) => s.state === 'sealed')
    const newest = mine.sort((x, y) => y.log.lastStamp.localeCompare(x.log.lastStamp))[0]
    if (newest?.id !== id) return reply(false, 'Only the newest archived log can be put back.')
    const r = await restoreLog(a.logPath, dir, newest)
    if (!r.ok) return reply(false, `Not put back: ${r.reason}`)
    writeSegment(dir, { ...newest, state: 'backed-up' })
    // The engine is following a short log that just became a long one; only a fresh launch folds
    // it from the start. The card told the player the app restarts.
    setTimeout(() => {
      app.relaunch()
      app.exit(0)
    }, 1500).unref()
    return reply(true, 'Your log is back in one piece. The app restarts now to read it.')
  })
}

/** Step 5.5: refold an older segment's archive with this build and swap the new totals in. */
export function refreshHistory(id: string): Promise<LogArchiveReply> {
  return exclusive('refreshing a history', async () => {
    const r = await refreshSegment(logArchiveDir(), id, {
      refold: (s) => refoldWithApp(s, true),
      producedBy: captureDeps.producedBy
    })
    if (!r.ok) return reply(false, `Not refreshed: ${r.reason}.`)
    // Step 4.16: the faction ledger is written again from the archive, which holds the same bytes.
    if (r.segment.archivePath !== null) {
      await keepFactionLedger(logArchiveDir(), r.segment.id, { path: r.segment.archivePath, gz: true, logName: liveLogName(r.segment) })
    }
    liveHistory.forgetHistoryContext()
    const what = r.changed.length === 0 ? 'Nothing in it changed.' : `Updated: ${r.changed.join(', ')}.`
    return reply(true, `Refreshed with this version. ${what}`)
  })
}

/** Steps 3.4 and 5.2, at launch before the engine attaches. Never throws. */
export async function recoverLogArchiveAtLaunch(note: (line: string) => void): Promise<void> {
  try {
    const dir = logArchiveDir()
    if (!existsSync(dir)) return
    sweepTemp(dir)
    sweepRefreshLeftovers(dir)
    const done = await recoverRotation(dir, rotateDeps)
    if (done !== null) note(`log archive: ${done}`)
    // Step 5.2, after any interrupted archive is sealed and before the engine is told where its files are.
    placeArchivedBuckets({
      on: logArchiveOn,
      userData: app.getPath('userData'),
      dir,
      stateOf: (id) => (readJournal(dir)?.segmentId === id ? null : (rotateDeps.readSegment(dir, id)?.state ?? null)),
      note
    })
  } catch (err) {
    note(`log archive: launch check failed: ${(err as Error).message}`)
  }
}
