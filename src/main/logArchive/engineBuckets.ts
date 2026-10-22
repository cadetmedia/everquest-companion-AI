// main/logArchive/engineBuckets.ts — RESIST AND LEARNED-MESSAGE HISTORY ACROSS AN ARCHIVE (step 5.2).
//
// The engine keeps `resist-ledger.json` and `message-overlay.json` in the app's data folder, one
// bucket per character. At every attach it empties the attached character's bucket and rebuilds it
// from the log; every other key is seeded and written back unchanged, and every reader pools all
// keys (step 5.1). After an archive the character's bucket shrinks to the fresh log, so this file
// files the archived log's share under a key of its own, `archive:<segment id>`.
//
// WHEN THE BUCKET IS TAKEN, AND WHY NOT AT THE LAUNCH. The copy must hold the archived log's lines
// and nothing else. By the next launch the file no longer does: the engine keeps tailing after the
// move, adds the fresh log's lines to the same bucket and writes it back every minute. Copied then,
// those lines would count twice, once in the copy and once in the next fold of the fresh log. So the
// bucket is READ at the archive, after the capture and before the log is moved, and kept beside the
// segment as `<id>.buckets.json`. It is not written into the engine's files then, because the engine
// rewrites its whole store every minute and drops a key it was not seeded with. The next launch puts
// it in before the engine is told where its files are (`placeArchivedBuckets`), once: a key that is
// already there is left as it is.
//
// THE FILE MUST BE THIS ATTACH'S WRITE. A file written by an earlier attach can still hold an older
// log's lines under this character. `settle` waits, before the capture, for the engine's next write
// of either file, at most 65 s: the engine writes on every 60th beat and the first write of an
// attach always lands, so when neither file changes in that time, a write beat passed with nothing
// new to say and the files already hold this attach's buckets. A second archive of one character in
// one run keeps nothing, because the attach still running holds both logs' lines.
//
// What this misses: what the engine learned after its last write and before the move, under a
// minute. It never counts a line twice.
//
// A RESTORED SEGMENT (step 3.6) is no longer sealed and its lines are back in the live log, so the
// next launch, which the restore itself starts, takes its key out again and deletes its stash.
//
// THE FORMAT IS THE CREATOR'S. Only the two versions below are touched; a file of any other version,
// or one that does not parse, is left alone. Writes are temp + fsync + rename (`writeFileDurable`).

import { existsSync, readdirSync, readFileSync, rmSync, statSync } from 'node:fs'
import { join } from 'node:path'
import type { SegmentState } from '../../shared/logArchive/segment'
import { writeFileDurable } from '../telemetry/durableWrite'
import { segmentPath } from './segmentStore'

/** The two files, the version of each this build knows (`resist/store.ts RESIST_LEDGER_VERSION`,
 *  `data/overlayPersistence.ts OVERLAY_REGISTER_VERSION`), and where a bucket keeps its counts. */
export const ENGINE_FILES = [
  { name: 'resist-ledger.json', version: 3, counts: 'rows' },
  { name: 'message-overlay.json', version: 2, counts: 'messages' }
] as const

const SUFFIX = '.buckets.json'

/** Never `baseline` or `log`, and never a character's (`name_server` has no colon). */
export function archiveKey(segmentId: string): string {
  return `archive:${segmentId}`
}

type Source = Record<string, unknown> & { key: string }

interface EngineFile {
  version: number
  sources: Source[]
}

/** One bucket as it was read at an archive, with the file version it was read under. */
export interface StashedBucket {
  version: number
  source: Source
}

/** `<id>.buckets.json`: the character's bucket from each file, taken at the archive. */
export interface BucketStash {
  v: 1
  segmentId: string
  character: string
  buckets: Record<string, StashedBucket>
}

function stashPath(dir: string, segmentId: string): string {
  return segmentPath(dir, segmentId).replace(/\.segment\.json$/, SUFFIX)
}

function readEngineFile(path: string): EngineFile | null {
  try {
    const f = JSON.parse(readFileSync(path, 'utf8')) as Partial<EngineFile>
    return typeof f.version === 'number' && Array.isArray(f.sources) ? (f as EngineFile) : null
  } catch {
    return null
  }
}

/** The file, only when it parses and is the version this build knows. */
function knownFile(userData: string, f: (typeof ENGINE_FILES)[number]): EngineFile | null {
  const file = readEngineFile(join(userData, f.name))
  return file !== null && file.version === f.version ? file : null
}

/** The character's non-empty bucket from each file this build can read. */
export function takeBuckets(userData: string, character: string): Record<string, StashedBucket> {
  const out: Record<string, StashedBucket> = {}
  for (const f of ENGINE_FILES) {
    const src = knownFile(userData, f)?.sources.find((s) => s.key === character)
    const counts = src?.[f.counts]
    if (src !== undefined && Array.isArray(counts) && counts.length > 0) out[f.name] = { version: f.version, source: src }
  }
  return out
}

export interface WaitDeps {
  now: () => number
  sleep: (ms: number) => Promise<void>
  /** A file's modified time in ms, or null when it is not there. */
  mtime: (path: string) => number | null
}

const WAIT: WaitDeps = {
  now: () => Date.now(),
  sleep: (ms) => new Promise((resolve) => setTimeout(resolve, ms)),
  mtime: (path) => {
    try {
      return statSync(path).mtimeMs
    } catch {
      return null
    }
  }
}

/** Wait for the engine's next write of either file, up to `limitMs`. True when one was seen. */
export async function waitForEngineWrite(userData: string, deps: WaitDeps = WAIT, limitMs = 65_000): Promise<boolean> {
  const start = deps.now()
  for (;;) {
    if (ENGINE_FILES.some((f) => (deps.mtime(join(userData, f.name)) ?? -Infinity) > start)) {
      // The two files are written one after the other on the same beat.
      await deps.sleep(500)
      return true
    }
    if (deps.now() - start >= limitMs) return false
    await deps.sleep(1000)
  }
}

/** Characters whose log was moved during this run: their attach holds the archived lines too. */
const movedThisRun = new Set<string>()

/** Test seam: a fresh run. */
export function resetArchiveBucketsForTests(): void {
  movedThisRun.clear()
}

/**
 * The rotation's three moments, in order: `settle` before the capture, `take` after it and before
 * the move, `keep` once the move has happened (or was interrupted after it, which recovery finishes).
 */
export interface ArchiveBuckets {
  settle: () => Promise<void>
  take: () => void
  keep: (dir: string, segmentId: string, moved: boolean) => void
}

export function archiveBuckets(userData: string, character: string, wait: WaitDeps = WAIT): ArchiveBuckets {
  const skip = movedThisRun.has(character)
  let taken: Record<string, StashedBucket> = {}
  return {
    settle: async () => {
      if (!skip) await waitForEngineWrite(userData, wait)
    },
    take: () => {
      if (!skip) taken = takeBuckets(userData, character)
    },
    keep: (dir, segmentId, moved) => {
      if (!moved) return
      movedThisRun.add(character)
      if (Object.keys(taken).length === 0) return
      const stash: BucketStash = { v: 1, segmentId, character, buckets: taken }
      try {
        writeFileDurable(dir, stashPath(dir, segmentId), JSON.stringify(stash))
      } catch {
        // The archive itself is done; only this history is not carried over.
      }
    }
  }
}

function readStashes(dir: string): BucketStash[] {
  const out: BucketStash[] = []
  for (const name of readdirSync(dir)) {
    if (!name.endsWith(SUFFIX)) continue
    try {
      const s = JSON.parse(readFileSync(join(dir, name), 'utf8')) as BucketStash
      if (s.v === 1 && typeof s.segmentId === 'string' && typeof s.buckets === 'object') out.push(s)
    } catch {
      // Not ours to repair; it is left where it is.
    }
  }
  return out
}

/** Change one engine file through `edit`, which returns false for "leave it". Known version only. */
function editFile(userData: string, f: (typeof ENGINE_FILES)[number], edit: (file: EngineFile) => boolean): boolean {
  const file = knownFile(userData, f)
  if (file === null || !edit(file)) return false
  writeFileDurable(userData, join(userData, f.name), JSON.stringify(file))
  return true
}

/** Put a sealed segment's buckets in, under its own key. A key already there is not copied again. */
function place(userData: string, stash: BucketStash): number {
  const key = archiveKey(stash.segmentId)
  let n = 0
  for (const f of ENGINE_FILES) {
    const b = stash.buckets[f.name]
    if (b?.version !== f.version) continue
    const placed = editFile(userData, f, (file) => {
      if (file.sources.some((s) => s.key === key)) return false
      file.sources.push({ ...b.source, key })
      return true
    })
    if (placed) n++
  }
  return n
}

/** Take every key `drop` names out of both files. How many files changed. */
function removeKeys(userData: string, drop: (key: string) => boolean): number {
  let n = 0
  for (const f of ENGINE_FILES) {
    const changed = editFile(userData, f, (file) => {
      const before = file.sources.length
      file.sources = file.sources.filter((s) => !drop(s.key))
      return file.sources.length !== before
    })
    if (changed) n++
  }
  return n
}

/** A restored segment: take its key out of both files and forget the stash. */
function withdraw(userData: string, dir: string, stash: BucketStash): void {
  const key = archiveKey(stash.segmentId)
  removeKeys(userData, (k) => k === key)
  rmSync(stashPath(dir, stash.segmentId), { force: true })
}

export interface PlaceDeps {
  on: () => boolean
  /** The folder the engine's two files are in (`userData`). */
  userData: string
  /** The archive folder. */
  dir: string
  /** A segment's state; null when there is no such segment, or when an interrupted archive of it
   *  is still to be finished (its stash is then left for the launch that seals it). */
  stateOf: (segmentId: string) => SegmentState | null
  note: (line: string) => void
}

/**
 * At launch, before the engine is told where its files are.
 *
 * WITH THE SWITCH OFF every carried key is taken out of both files, so the tabs show what the live
 * log alone gives (the README's switch rule). The archive folder is not opened and the stashes stay,
 * so turning the switch back on adds them again at the next launch through the ordinary copy.
 */
export function placeArchivedBuckets(deps: PlaceDeps): void {
  if (!deps.on()) {
    if (removeKeys(deps.userData, (k) => k.startsWith(archiveKey(''))) > 0) {
      deps.note('log archive: Summarize and archive log is off, so carried resist and message history was taken out')
    }
    return
  }
  if (!existsSync(deps.dir)) return
  for (const stash of readStashes(deps.dir)) {
    const state = deps.stateOf(stash.segmentId)
    if (state === 'sealed') {
      const n = place(deps.userData, stash)
      if (n > 0) deps.note(`log archive: kept resist and message history from ${stash.segmentId} (${n} file(s))`)
    } else if (state !== null) {
      withdraw(deps.userData, deps.dir, stash)
      deps.note(`log archive: ${stash.segmentId} was put back, so its resist and message history was taken out again`)
    }
  }
}
