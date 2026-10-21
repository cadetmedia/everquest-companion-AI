// resistTableWorker.ts — read and parse the client's `spells_us.txt` OFF the main thread
// (JOS-382). Keep it this small.
//
// WHY A WHOLE THREAD. The file is 38 MB and 73,963 rows; reading and splitting it is a few
// hundred milliseconds of pure CPU with no await inside it, and the thread that would otherwise
// spend them is the one tailing the log (JOS-371: no synchronous multi-MB reads on main). It runs
// ONCE per app launch, and only when the cache says the file changed — see `resist/spellTable.ts`
// for the size+mtime key, which is JOS-208's rule applied to somebody else's file: only redo work
// when the source moved.
//
// It speaks exactly once and exits. `latin1` rather than `utf8` because the file is a fixed-width
// legacy dump with high bytes in a handful of names; latin1 never throws and never replaces a
// byte, and every field this parser reads is ASCII.
//
// IT ALSO WRITES THE CACHE, before it speaks (perf audit, 2026-10-20). Main used to do that once the
// table arrived — a `JSON.stringify` of the whole table plus a synchronous write, measured at 65 ms
// of main-thread time — and the moment it ran was whatever moment the parse happened to finish,
// which on a fresh install was the first Maps visit. Here it costs the main thread nothing. The write
// is the app's one durable whole-file write (`writeFileDurable`: temp, fsync, rename), so a crash
// mid-write leaves the previous cache or none, never a torn one; and it stays best-effort — a failure
// is reported back for main's error log and costs one re-parse next launch, nothing else.

import { readFileSync } from 'node:fs'
import { dirname } from 'node:path'
import { parentPort, workerData } from 'node:worker_threads'
import { parseSpellsUs } from './resist/spellsUsParse'
import { writeFileDurable } from './telemetry/durableWrite'
import type { SpellResistTable } from '../shared/resistTypes'

/** Where to cache the parsed table, and the key it is cached under (`resist/spellTable.ts`). */
export interface ResistTableCacheTarget {
  path: string
  version: number
  size: number
  mtimeMs: number
}

export interface ResistTableWorkerInit {
  path: string
  /** Absent: parse only, write nothing. */
  cache?: ResistTableCacheTarget
}

export interface ResistTableWorkerReply {
  ok: boolean
  table?: SpellResistTable
  error?: string
  /** The cache write failed; the table is still good. */
  cacheError?: string
}

const init = workerData as ResistTableWorkerInit
const port = parentPort

const message = (err: unknown): string => (err instanceof Error ? err.message : String(err))

/** The cache file, in exactly the shape `readCache` reads back. Null when it was written. */
function writeCache(target: ResistTableCacheTarget, table: SpellResistTable): string | null {
  const { path, version, size, mtimeMs } = target
  try {
    writeFileDurable(dirname(path), path, JSON.stringify({ version, size, mtimeMs, table }))
    return null
  } catch (err) {
    return message(err)
  }
}

let reply: ResistTableWorkerReply
try {
  const table = parseSpellsUs(readFileSync(init.path, 'latin1'))
  reply = { ok: true, table }
  const cacheError = init.cache === undefined ? null : writeCache(init.cache, table)
  if (cacheError !== null) reply.cacheError = cacheError
} catch (err) {
  reply = { ok: false, error: message(err) }
}
port?.postMessage(reply)
