// main/logArchive/rotate.ts — MOVE THE LIVE LOG INTO THE ARCHIVE, AND PUT ONE BACK (steps 3.3, 3.4, 3.6).
//
// Every path is an argument, so the whole sequence runs on temp folders in tests. The order is the
// safety design (phase-3-rotation.md):
//
//   1. the captured segment is written (the log is untouched so far);
//   2. a journal entry names the log, the moved file and the segment;
//   3. the live log is renamed into the archive folder, a single operation on one drive;
//   4. an empty live log is created if the game has not already made one (never truncating);
//   5. the moved file is checked to begin with exactly the captured bytes, and any lines the game
//      wrote between the capture and the rename are counted (`gapLines`);
//   6. the moved file is compressed and verified, the segment sealed, its faction lines kept as a
//      ledger beside it (step 4.16, while the moved file still exists), the moved file deleted, and
//      the journal cleared.
//
// Before step 3 nothing in the game's folder has changed. After it, the moved file stays in the
// archive folder until a verified compressed copy exists. `recoverRotation` finishes an
// interrupted run from wherever it stopped, at the next launch.
//
// The game may be running throughout: it opens the log by name for every line (ruling 0.5).

import { closeSync, existsSync, linkSync, openSync, readFileSync, readSync, renameSync, rmSync, statSync, writeFileSync } from 'node:fs'
import { createReadStream, createWriteStream } from 'node:fs'
import { join } from 'node:path'
import { pipeline } from 'node:stream/promises'
import { createGunzip } from 'node:zlib'
import { createHash } from 'node:crypto'
import type { Segment, SegmentLog } from '../../shared/logArchive/segment'
import type { BackupRequest, BackupResult } from './backup'
import { archiveName } from './backup'
import { logNameOf, type LedgerSource } from './factionLedgerFile'

export const JOURNAL = 'rotation-journal.json'

export type JournalStep = 'moving' | 'moved'

export interface Journal {
  v: 1
  logPath: string
  movedPath: string
  segmentId: string
  step: JournalStep
}

export interface RotateDeps {
  backup: (req: BackupRequest) => Promise<BackupResult>
  readPrefix: (path: string, bytes: number) => Promise<SegmentLog>
  writeSegment: (dir: string, s: Segment) => void
  readSegment: (dir: string, id: string) => Segment | null
  /** Step 4.16: keep the moved log's faction lines beside the segment. A failure is the caller's to
   *  note; it never stops the archive. */
  factionLedger?: (dir: string, segmentId: string, source: LedgerSource) => Promise<void>
  /** Test seam: throw here to simulate a crash after the named step. */
  crashAfter?: (step: string) => void
}

export type RotateResult = { ok: true; segment: Segment } | { ok: false; reason: string; logTouched: boolean }

function writeJournal(dir: string, j: Journal): void {
  writeFileSync(join(dir, JOURNAL), JSON.stringify(j))
}

export function readJournal(dir: string): Journal | null {
  try {
    const j = JSON.parse(readFileSync(join(dir, JOURNAL), 'utf8')) as Journal
    return j.v === 1 && typeof j.movedPath === 'string' ? j : null
  } catch {
    return null
  }
}

function clearJournal(dir: string): void {
  rmSync(join(dir, JOURNAL), { force: true })
}

/** Create an empty file at `path` unless one is there. Never truncates what the game made. */
export function ensureFile(path: string): void {
  try {
    closeSync(openSync(path, 'wx'))
  } catch (err) {
    if ((err as NodeJS.ErrnoException).code !== 'EEXIST') throw err
  }
}

/** Newlines in bytes [from, to) of a file: the lines written after the capture point. */
function countLines(path: string, from: number, to: number): number {
  if (to <= from) return 0
  const fd = openSync(path, 'r')
  try {
    const buf = Buffer.alloc(to - from)
    readSync(fd, buf, 0, buf.length, from)
    let n = 0
    for (const b of buf) if (b === 0x0a) n++
    return n
  } finally {
    closeSync(fd)
  }
}

/** Steps 5 and 6, from a moved file onwards. Safe to run again after a crash at any point. */
async function finishFromMoved(dir: string, j: Journal, deps: RotateDeps): Promise<Segment> {
  ensureFile(j.logPath)
  let seg = deps.readSegment(dir, j.segmentId)
  if (seg === null) throw new Error(`the archive record ${j.segmentId} is missing; the old log is kept at ${j.movedPath}`)
  if (seg.state === 'captured') {
    if (!existsSync(j.movedPath)) throw new Error(`the moved log is missing: ${j.movedPath}`)
    const moved = statSync(j.movedPath).size
    const prefix = await deps.readPrefix(j.movedPath, seg.log.bytes)
    if (prefix.sha256 !== seg.log.sha256) {
      throw new Error(`the moved log does not begin with the captured bytes; it is kept at ${j.movedPath}`)
    }
    const name = archiveName(j.logPath.split(/[\\/]/).pop() ?? 'eqlog', seg.log.firstStamp, seg.log.lastStamp)
    const b = await deps.backup({ source: j.movedPath, bytes: moved, expectSha256: null, dir, name })
    if (!b.ok) throw new Error(`the archive could not be written (${b.reason}); the old log is kept at ${j.movedPath}`)
    seg = {
      ...seg,
      state: 'backed-up',
      archivePath: b.path,
      archiveSource: { bytes: b.bytes, sha256: b.sha256 },
      archiveGzBytes: b.gzBytes,
      gapLines: countLines(j.movedPath, seg.log.bytes, moved)
    }
    deps.writeSegment(dir, seg)
    deps.crashAfter?.('backed-up')
  }
  if (seg.state === 'backed-up') {
    seg = { ...seg, state: 'sealed' }
    deps.writeSegment(dir, seg)
    deps.crashAfter?.('sealed')
  }
  if (deps.factionLedger !== undefined && existsSync(j.movedPath)) {
    await deps.factionLedger(dir, seg.id, { path: j.movedPath, gz: false, logName: logNameOf(j.logPath) }).catch(() => undefined)
  }
  rmSync(j.movedPath, { force: true })
  clearJournal(dir)
  return seg
}

/** Archive the live log behind a captured segment. The caller has run the preflight. */
export async function rotateLog(logPath: string, dir: string, captured: Segment, deps: RotateDeps): Promise<RotateResult> {
  const j: Journal = { v: 1, logPath, movedPath: join(dir, `${captured.id}.moving`), segmentId: captured.id, step: 'moving' }
  // A log captured again at the same length has the same id as the history kept from it (Back up,
  // then Keep, then Archive with nothing played): a move that fails must leave that record as it was.
  const prior = deps.readSegment(dir, captured.id)
  try {
    deps.writeSegment(dir, captured)
    writeJournal(dir, j)
    deps.crashAfter?.('journal')
    renameSync(logPath, j.movedPath)
  } catch (err) {
    clearJournal(dir)
    if (prior !== null) deps.writeSegment(dir, prior)
    const busy = (err as NodeJS.ErrnoException).code === 'EBUSY' || (err as NodeJS.ErrnoException).code === 'EPERM'
    const reason = busy
      ? 'another program is holding the log open, so it was not moved. Nothing has changed.'
      : `the log was not moved (${(err as Error).message}). Nothing has changed.`
    return { ok: false, reason, logTouched: false }
  }
  writeJournal(dir, { ...j, step: 'moved' })
  try {
    deps.crashAfter?.('moved')
    return { ok: true, segment: await finishFromMoved(dir, { ...j, step: 'moved' }, deps) }
  } catch (err) {
    return { ok: false, reason: (err as Error).message, logTouched: true }
  }
}

/**
 * Step 3.4: finish or clear an interrupted rotation. Run at launch before the engine attaches.
 * Returns what it did, or null when there was no journal.
 */
export async function recoverRotation(dir: string, deps: RotateDeps): Promise<string | null> {
  const j = readJournal(dir)
  if (j === null) return null
  if (j.step === 'moving' && !existsSync(j.movedPath)) {
    clearJournal(dir)
    return 'an archive was interrupted before the log was moved; nothing had changed'
  }
  try {
    const seg = await finishFromMoved(dir, { ...j, step: 'moved' }, deps)
    return `finished an interrupted archive: ${seg.id}`
  } catch (err) {
    return `an interrupted archive could not be finished: ${(err as Error).message}`
  }
}

/** Move the live log aside and add its bytes to the end of `joined`. Nothing when there is none. */
function absorbLive(logPath: string, part: string, joined: string): void {
  if (!existsSync(logPath)) return
  renameSync(logPath, part)
  writeFileSync(joined, readFileSync(part), { flag: 'a' })
  rmSync(part)
}

/** Link `from` to the name `to`; false when the name is taken (the game recreated it). */
function linkIfFree(from: string, to: string): boolean {
  try {
    linkSync(from, to)
    return true
  } catch (err) {
    if ((err as NodeJS.ErrnoException).code === 'EEXIST') return false
    throw err
  }
}

async function unpack(archive: string, to: string): Promise<string> {
  const h = createHash('sha256')
  const gun = createReadStream(archive).pipe(createGunzip())
  gun.on('data', (c) => h.update(c as Buffer))
  await pipeline(gun, createWriteStream(to))
  return h.digest('hex')
}

/**
 * Step 3.6: put an archived log back in front of the live one. The archive is unpacked and
 * verified, then joined with the live log the way ruling 0.5's test did by hand: move the live log
 * aside, add its bytes to the end, and link the result to the live name, which fails if the game
 * recreated the name meanwhile, in which case it goes round again. No line is removed or changed.
 */
export async function restoreLog(logPath: string, dir: string, seg: Segment): Promise<{ ok: boolean; reason: string }> {
  if (seg.archivePath === null || seg.archiveSource === undefined) return { ok: false, reason: 'this history has no archive' }
  const joined = join(dir, `${seg.id}.restoring`)
  try {
    const sha = await unpack(seg.archivePath, joined)
    if (sha !== seg.archiveSource.sha256) throw new Error('the archive did not unpack to the bytes it was made from')
    for (let round = 0; round < 50; round++) {
      absorbLive(logPath, join(dir, `${seg.id}.part`), joined)
      if (linkIfFree(joined, logPath)) {
        rmSync(joined)
        return { ok: true, reason: 'restored' }
      }
    }
    throw new Error('the game kept recreating the log; try again in a quiet moment')
  } catch (err) {
    return { ok: false, reason: `${(err as Error).message}. The unpacked log, if any, is at ${joined}` }
  }
}
