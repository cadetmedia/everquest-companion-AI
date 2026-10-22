// main/logArchive/refold.ts — FOLD A SEGMENT'S ARCHIVE AGAIN (steps 5.4 and 5.5).
//
// Decompresses the archive into a temp folder laid out as an install (`<root>/Logs/eqlog_….txt`),
// keeping exactly the bytes the segment's totals were taken from: an archive can be longer than
// its segment (phase 3's capture window), and those extra lines are not in the totals. The bytes
// must hash to the segment's own SHA-256, or nothing is folded.
//
// THE CLIENT'S TABLES ARE COPIED BESIDE IT when the caller names where they are. The engine looks
// for `spells_us.txt` two folders up from the log, so a temp folder without them is an install
// without a client.
//
// The temp folder is removed afterwards, whatever happened. Electron-free: the caller names the
// binary, the tables and the defines.

import { createHash } from 'node:crypto'
import { copyFileSync, createReadStream, createWriteStream, existsSync, mkdirSync, mkdtempSync, rmdirSync, rmSync } from 'node:fs'
import { basename, join } from 'node:path'
import { createGunzip } from 'node:zlib'
import { CAPTURED_MODULES } from '../../shared/logArchive/modules'
import type { Segment } from '../../shared/logArchive/segment'
import { foldWithSecondEngine, type SecondFold, type SecondFoldRequest } from './secondEngine'

/** The client files the engine reads beside an install's `Logs` folder. */
const TABLES = ['spells_us.txt', 'spells_us_str.txt', 'dbstr_us.txt']

/** A full fold of a 250 MB log took 55 s; ten minutes is a hung engine, not a slow one. */
const FOLD_TIMEOUT_MS = 10 * 60_000

export interface RefoldDeps {
  bin: string
  spawn: SecondFoldRequest['spawn']
  /** The EverQuest folder to copy the client's tables from, or null to fold without them. */
  tablesRoot: string | null
  defines: SecondFoldRequest['defines']
  clock: SecondFoldRequest['clock']
  /** Where the temp folder is made. */
  workRoot: string
}

export type RefoldResult =
  | { ok: true; fold: SecondFold; stageMs: number; tables: number }
  | { ok: false; reason: string }

/** The live log's name, read back off the archive's (`backup.ts archiveName`). */
export function liveLogName(segment: Segment): string {
  const name = basename(segment.archivePath ?? '')
  const m = /^(eqlog_.+?)_(?:\d{4}-\d{2}-\d{2}|unknown)_to_/i.exec(name)
  return m !== null ? `${m[1]}.txt` : `eqlog_${segment.character}.txt`
}

/** Write the first `bytes` bytes of the archive to `dest`; answers their SHA-256 and length. */
async function gunzipPrefix(archive: string, dest: string, bytes: number): Promise<{ sha256: string; bytes: number }> {
  const h = createHash('sha256')
  const out = createWriteStream(dest)
  // A write that fails (a full temp drive) never drains; the wait has to end on the error instead.
  const failed = new Promise<never>((_, reject) => out.once('error', reject))
  failed.catch(() => undefined)
  let n = 0
  for await (const chunk of createReadStream(archive).pipe(createGunzip())) {
    const take = (chunk as Buffer).subarray(0, Math.max(0, bytes - n))
    if (take.length === 0) break
    h.update(take)
    n += take.length
    if (!out.write(take)) await Promise.race([new Promise<void>((r) => out.once('drain', () => r())), failed])
  }
  if (out.errored !== null) throw out.errored
  await new Promise<void>((resolve, reject) => out.end((err?: Error | null) => (err ? reject(err) : resolve())))
  return { sha256: h.digest('hex'), bytes: n }
}

function copyTables(from: string | null, root: string): number {
  if (from === null) return 0
  let n = 0
  for (const t of TABLES) {
    if (!existsSync(join(from, t))) continue
    copyFileSync(join(from, t), join(root, t))
    n++
  }
  return n
}

/** Lay the segment's log out in `root` as an install. Answers the log path, or why not. */
export async function stageSegmentLog(segment: Segment, root: string, tablesRoot: string | null): Promise<{ logPath: string; tables: number } | { reason: string }> {
  if (segment.archivePath === null || !existsSync(segment.archivePath)) return { reason: 'its archive is missing' }
  mkdirSync(join(root, 'Logs'), { recursive: true })
  const logPath = join(root, 'Logs', liveLogName(segment))
  const got = await gunzipPrefix(segment.archivePath, logPath, segment.log.bytes)
  if (got.bytes !== segment.log.bytes || got.sha256 !== segment.log.sha256) {
    return { reason: 'its archive does not hold the lines its totals were taken from' }
  }
  return { logPath, tables: copyTables(tablesRoot, root) }
}

/** The shared parent goes too, unless another refold is using it. */
function removeIfEmpty(dir: string): void {
  try {
    rmdirSync(dir)
  } catch {
    // Not empty, or already gone.
  }
}

/** Fold a segment's archived lines in a second engine and read every module back. */
export async function refoldSegment(segment: Segment, deps: RefoldDeps): Promise<RefoldResult> {
  mkdirSync(deps.workRoot, { recursive: true })
  const root = mkdtempSync(join(deps.workRoot, 'refold-'))
  try {
    const began = Date.now()
    const staged = await stageSegmentLog(segment, root, deps.tablesRoot)
    if ('reason' in staged) return { ok: false, reason: staged.reason }
    const stageMs = Date.now() - began
    const fold = await foldWithSecondEngine({
      bin: deps.bin,
      spawn: deps.spawn,
      logPath: staged.logPath,
      bytes: segment.log.bytes,
      modules: CAPTURED_MODULES,
      defines: deps.defines,
      clock: deps.clock,
      timeoutMs: FOLD_TIMEOUT_MS,
      respawnHistory: true,
      fights: true
    })
    return { ok: true, fold, stageMs, tables: staged.tables }
  } catch (err) {
    return { ok: false, reason: (err as Error).message }
  } finally {
    rmSync(root, { recursive: true, force: true, maxRetries: 5, retryDelay: 200 })
    removeIfEmpty(deps.workRoot)
  }
}
