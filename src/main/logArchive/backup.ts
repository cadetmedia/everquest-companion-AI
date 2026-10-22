// main/logArchive/backup.ts — A VERIFIED COMPRESSED COPY OF A LOG (step 2.2).
//
// The source is opened for reading only. The copy is written under a temporary name, decompressed
// again and hashed, and only a copy whose bytes match is given its final name. A temporary file
// left by a crash is removed by `sweepTemp` and the segment stays `captured`.
//
// THE NAME DOES NOT END IN `.txt`, so log discovery (`eqlog_*.txt`) can never mistake an archive
// for a character, wherever the folder is.
//
// Node's own zlib; no new dependency.

import { createHash } from 'node:crypto'
import { createReadStream, createWriteStream, existsSync, readdirSync, renameSync, rmSync, statfsSync, statSync } from 'node:fs'
import { join } from 'node:path'
import { pipeline } from 'node:stream/promises'
import { createGunzip, createGzip } from 'node:zlib'

const TEMP_SUFFIX = '.partial'

export interface BackupRequest {
  /** The file to copy. */
  source: string
  /** How many bytes from its start to copy. */
  bytes: number
  /** The SHA-256 those bytes must have, or null to take whatever they are (a moved, final file). */
  expectSha256: string | null
  dir: string
  /** The file name, ending `.log.gz`. A number is added when it is taken. */
  name: string
}

export type BackupResult =
  | { ok: true; path: string; bytes: number; sha256: string; gzBytes: number }
  | { ok: false; reason: string }

function freeBytes(dir: string): number | null {
  try {
    const s = statfsSync(dir)
    return s.bavail * s.bsize
  } catch {
    return null
  }
}

function freeName(dir: string, name: string): string {
  if (!existsSync(join(dir, name))) return name
  const stem = name.replace(/\.log\.gz$/, '')
  for (let i = 2; ; i++) {
    const next = `${stem}_${i}.log.gz`
    if (!existsSync(join(dir, next))) return next
  }
}

async function hashGz(path: string): Promise<{ sha256: string; bytes: number }> {
  const h = createHash('sha256')
  let bytes = 0
  for await (const chunk of createReadStream(path).pipe(createGunzip())) {
    h.update(chunk as Buffer)
    bytes += (chunk as Buffer).length
  }
  return { sha256: h.digest('hex'), bytes }
}

async function writeGz(req: BackupRequest, tmp: string): Promise<string> {
  const h = createHash('sha256')
  const src = createReadStream(req.source, { start: 0, end: req.bytes - 1 })
  src.on('data', (chunk) => h.update(chunk as Buffer))
  await pipeline(src, createGzip({ level: 6 }), createWriteStream(tmp))
  return h.digest('hex')
}

/** Copy, verify, then name. Never touches the source beyond reading it. */
export async function backupLog(req: BackupRequest): Promise<BackupResult> {
  if (req.bytes <= 0) return { ok: false, reason: 'there is nothing to back up' }
  const free = freeBytes(req.dir)
  if (free !== null && free < req.bytes) return { ok: false, reason: 'not enough free space for the backup' }
  const tmp = join(req.dir, `${req.name}${TEMP_SUFFIX}`)
  try {
    const read = await writeGz(req, tmp)
    if (req.expectSha256 !== null && read !== req.expectSha256) {
      throw new Error('the log changed while it was being copied')
    }
    const back = await hashGz(tmp)
    if (back.sha256 !== read || back.bytes !== req.bytes) throw new Error('the copy did not read back the same')
    const final = join(req.dir, freeName(req.dir, req.name))
    renameSync(tmp, final)
    return { ok: true, path: final, bytes: back.bytes, sha256: back.sha256, gzBytes: statSync(final).size }
  } catch (err) {
    rmSync(tmp, { force: true })
    return { ok: false, reason: (err as Error).message }
  }
}

/** Remove temporary files a crash left behind. Returns how many. */
export function sweepTemp(dir: string): number {
  if (!existsSync(dir)) return 0
  let n = 0
  for (const f of readdirSync(dir)) {
    if (!f.endsWith(TEMP_SUFFIX)) continue
    rmSync(join(dir, f), { force: true })
    n++
  }
  return n
}

/** `eqlog_<Character>_<server>_<first day>_to_<last day>.log.gz` from a log's own name. */
export function archiveName(logFileName: string, firstStamp: string, lastStamp: string): string {
  const stem = logFileName.replace(/\.txt$/i, '')
  const day = (s: string): string => s.slice(0, 10) || 'unknown'
  return `${stem}_${day(firstStamp)}_to_${day(lastStamp)}.log.gz`
}
