// The client resist table: load it once per app run, cache it by the source file's identity.
//
// TWO LAWS ARE BEING OBEYED HERE AT ONCE.
//
//   JOS-371 — nothing multi-megabyte and synchronous happens on the thread that tails the log.
//     The parse runs on `resistTableWorker.js`, a second rollup input beside index.js, and the
//     caller gets a promise. Until it resolves the app is in a well-defined state that the UI can
//     say out loud ("reading spell data"), never a stall.
//
//   JOS-208 — only redo work when the source changed. The parsed table is written to
//     `<userData>/spell-resist-cache.json` keyed by the SIZE and MTIME of the file it came from.
//     A launch where the player has not patched EverQuest reads a ~1 MB cache instead of a 38 MB
//     original; a launch after a patch finds the key stale, re-parses, and rewrites. The key is
//     deliberately not a hash: hashing 38 MB costs most of what parsing it costs.
//
// AND ONE THING IT REFUSES TO DO: crash when the file is not there. `EQ_LOG_PATH`-style overrides
// let a user point this app at a folder of logs with no EverQuest install behind it, and a Wine
// or trimmed install may lack the file. `spellTable()` then resolves to null, `spellDataAvailable`
// on every profile goes false, and the mob page says so instead of showing an empty card.

import { app } from 'electron'
import { readFileSync, statSync, writeFileSync, renameSync, mkdirSync } from 'node:fs'
import { join } from 'node:path'
import { Worker } from 'node:worker_threads'
import { effectiveEqRoot } from '../log/config'
import { logError } from '../errorLog'
import type { SpellResistTable } from '../../shared/resistTypes'
import type { ResistTableWorkerReply } from '../resistTableWorker'

/**
 * Bump to invalidate every cached table in the field (a parser change, not a game patch).
 *
 *   1  JOS-382, the original table.
 *   2  JOS-396 — every effect-0 slot and the client's duration statement (`hp`, `hpDuration`). A
 *      version-1 cache is not upgradeable in place: the fields were never read out of the file, so
 *      the only way to get them is the re-parse this bump forces. It costs one launch's worth of
 *      worker time per install, once.
 *   3  JOS-444 - the re-use timer (`recastMs`, field 10). The same argument as 2: a version-2
 *      cache was written before anything read that column, so the field can only come from a
 *      re-parse, and a sustained dps with a missing denominator is a wrong number rather than an
 *      absent one.
 *   4  JOS-449 - the AE target cap (`aeMaxTargets`, field 143). MISSED AT MERGE and caught by the
 *      owner in the field the same day: his AOE tab read Supernova at the default four targets
 *      (4,848 at rank VII) instead of the client's eight, because his machine held a version-3
 *      cache written before anything read that column. The parser change shipped without this
 *      bump, which is exactly the staleness this constant exists to make impossible.
 *   5  JOS-451 - the mana column (`mana`, field 14) and TWO MORE HITPOINT EFFECT IDS in `hp` (100
 *      heal-over-time, 334 the bard pulse). Both halves are unreachable from a version-4 cache for
 *      the same reason 2, 3 and 4 were: the fields were never written into it. And the second half
 *      is what the owner's own report turns on - a version-4 cache carries no effect-100 slot for
 *      `Ethereal Cleansing`, so the client curve that fixes his 40-instead-of-400 heal-over-time
 *      would simply not be there to read. Bumped in the SAME commit as the parser change, which is
 *      the whole lesson of 4.
 *   6  2026-09-10 - the EFFECT SLOTS, the good/bad verdict and the buff duration, for the
 *      stacking engine (docs/plans/spell-upgrades-and-loadout.md §3.4). The same argument as every
 *      bump before it: a version-5 cache was written before anything read those columns, so the
 *      only way to get them is the re-parse this forces - one launch's worth of worker time per
 *      install, once. JOS-449's lesson is on the record two entries up and was not repeated.
 *      MEASURED cost on the owner's install: +5.58 MiB of JSON on a 6.13 MiB cache, for ~11.7 MiB.
 *      Slots are written only on rows WITH A DURATION, which is a semantic filter before it is a
 *      size one - see `SpellResistInfo.slots`.
 *   7  2026-09-10 - the spell ID (field 0) and the GEM ICON (field 75). The id is a bug fix and not
 *      a feature: the stacking engine decides "is this the same spell" on it, the table had never
 *      carried one, and `stackView`'s `?? 0` therefore made every spell in the game identical to
 *      every other (see `shared/spellStack.ts sameIdentity`). A version-6 cache cannot answer for
 *      either field, and the owner's Loadout tab is wrong until it is re-parsed, so this is a bump
 *      rather than an in-place upgrade for the same reason versions 3 through 6 were.
 *   8  2026-09-12 - the KEYS. `spellCanonKey` now drops apostrophes (spellKey.ts), so a version-7
 *      cache is keyed `o\`keil's radiation` where every lookup now asks `okeils radiation`: the
 *      rows are all right and none of them can be found. The owner saw it as 26 spells with no
 *      icon after the fix that was meant to give them one. Not upgradeable in place for the
 *      opposite reason to the bumps above - the data is complete, the index is stale - and a
 *      re-key on read would be a second copy of the key rule to keep byte-identical.
 */
export const SPELL_RESIST_CACHE_VERSION = 9

interface CacheFile {
  version: number
  size: number
  mtimeMs: number
  table: SpellResistTable
}

/** The client file, as it sits in the install this app resolved. */
export function spellsUsPath(): string {
  return join(effectiveEqRoot(), 'spells_us.txt')
}

function cachePath(): string {
  return join(app.getPath('userData'), 'spell-resist-cache.json')
}

function sourceStamp(path: string): { size: number; mtimeMs: number } | null {
  try {
    const st = statSync(path)
    return { size: st.size, mtimeMs: Math.round(st.mtimeMs) }
  } catch {
    return null
  }
}

function readCache(stamp: { size: number; mtimeMs: number }): SpellResistTable | null {
  try {
    const file = JSON.parse(readFileSync(cachePath(), 'utf8')) as CacheFile
    if (file.version !== SPELL_RESIST_CACHE_VERSION) return null
    if (file.size !== stamp.size || file.mtimeMs !== stamp.mtimeMs) return null
    return file.table
  } catch {
    return null
  }
}

function writeCache(stamp: { size: number; mtimeMs: number }, table: SpellResistTable): void {
  const path = cachePath()
  const tmp = `${path}.tmp`
  const file: CacheFile = { version: SPELL_RESIST_CACHE_VERSION, ...stamp, table }
  try {
    mkdirSync(app.getPath('userData'), { recursive: true })
    writeFileSync(tmp, JSON.stringify(file), 'utf8')
    renameSync(tmp, path)
  } catch (err) {
    // Best-effort: a failed cache write costs one re-parse next launch, nothing else.
    logError('main:resistTable', { message: 'spell-resist-cache write failed', err })
  }
}

function parseOnWorker(path: string): Promise<SpellResistTable | null> {
  return new Promise((resolve) => {
    let worker: Worker
    try {
      worker = new Worker(join(__dirname, 'resistTableWorker.js'), { workerData: { path } })
    } catch (err) {
      logError('main:resistTable', { message: 'resist table worker failed to start', err })
      resolve(null)
      return
    }
    let settled = false
    const finish = (table: SpellResistTable | null): void => {
      if (settled) return
      settled = true
      resolve(table)
      void worker.terminate()
    }
    worker.on('message', (reply: ResistTableWorkerReply) => {
      if (!reply.ok) logError('main:resistTable', { message: reply.error ?? 'parse failed' })
      finish(reply.table ?? null)
    })
    worker.on('error', (err) => {
      logError('main:resistTable', { message: 'resist table worker error', err })
      finish(null)
    })
    worker.on('exit', () => {
      finish(null)
    })
  })
}

/**
 * WHY THE FAILURE HAS TWO NAMES (JOS-385). "Spell data unavailable — this needs your EverQuest
 * install's spells_us.txt" was one sentence for two unrelated problems, and it blamed the install
 * for both. The owner hit the SECOND one after a dev restart (the file was right where it always
 * is; the worker had not come back) and was told to go find his EverQuest folder.
 *
 *   'missing'    — nothing at the resolved path. The user's problem, and the path is the fix, so
 *                  the message says which folder was looked in.
 *   'unloadable' — the file is there and the parse did not produce a table (a worker that failed
 *                  to start, a parse error, a cache write that came back malformed). OUR problem,
 *                  and the error log is where it is written down.
 */
export type SpellTableState = 'loading' | 'ok' | 'missing' | 'unloadable'

let pending: Promise<SpellResistTable | null> | null = null
let loaded: SpellResistTable | null = null
let sourceMtime: number | null = null
let state: SpellTableState = 'loading'

/**
 * The table, loaded at most once per app run. Null means the client file is unreadable — a
 * SUPPORTED state (see the header), never an error the caller has to handle.
 */
export function spellTable(): Promise<SpellResistTable | null> {
  const existing = pending
  if (existing) return existing
  const created = load()
  pending = created
  return created
}

async function load(): Promise<SpellResistTable | null> {
  const path = spellsUsPath()
  const stamp = sourceStamp(path)
  if (!stamp) {
    state = 'missing'
    return null
  }
  sourceMtime = stamp.mtimeMs
  const cached = readCache(stamp)
  if (cached) {
    loaded = cached
    state = 'ok'
    return cached
  }
  const parsed = await parseOnWorker(path)
  if (parsed) {
    loaded = parsed
    writeCache(stamp, parsed)
  }
  state = parsed ? 'ok' : 'unloadable'
  return parsed
}

/** Where the table stands right now, and the path it was looked for at. See `SpellTableState`. */
export function spellTableStatus(): { state: SpellTableState; path: string } {
  return { state, path: spellsUsPath() }
}

/** The table if it is already resolved, else null. For synchronous readers (the fold). */
export function spellTableNow(): SpellResistTable | null {
  return loaded
}

/** The `spells_us.txt` mtime this run's table was read from — stamped into a generated baseline. */
export function spellsUsMtime(): number | null {
  return sourceMtime
}

/** Test seam: install a table without touching the filesystem. */
export function installSpellTable(table: SpellResistTable | null, why: SpellTableState = 'unloadable'): void {
  loaded = table
  pending = Promise.resolve(table)
  state = table ? 'ok' : why
}
