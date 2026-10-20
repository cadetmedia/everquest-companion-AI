// main/gapsCharacters.ts — EVERY CHARACTER'S GAPS INPUTS, KEPT APART (owner, 2026-10-19;
// shared/gapsAllCharacters.ts has the why and the join).
//
// SAVE. While a character is attached and the engine is live on its log, its raw `gaps`, `loot` and
// `kills` (the live log only, no archive merged) go to one file of its own in the app's data folder,
// `gaps-characters/<characterId>.json`, with the log's head fingerprint, so the archive's
// eligibility rule can later tell which of its segments that snapshot already holds. Checked every
// two minutes and written only when a module moved. Nothing is read from another character's log
// and no log is copied, joined or touched: the files are each character's results alone.
//
// SERVE. `gaps:allCharacters` answers every OTHER character's inputs (the attached one's the tab
// already has, served live): its saved snapshot with its eligible archive segments folded in when
// Summarize and archive log is on, each cut to the player's day window by whole segments. The
// listing is remembered until a file in either folder changes or the window moves.

import { app, ipcMain } from 'electron'
import { createHash } from 'node:crypto'
import { existsSync, readdirSync, statSync } from 'node:fs'
import { readFile, readdir } from 'node:fs/promises'
import { join } from 'node:path'
import { IPC } from '../shared/ipc'
import {
  GAP_SOURCE_MODULES,
  SAVED_GAPS_VERSION,
  characterGaps,
  otherCharacters,
  parseSavedGaps,
  type CharacterGaps,
  type GapSourceModule,
  type SavedGaps,
  type SavedLog
} from '../shared/gapsAllCharacters'
import { HEAD_BYTES, logStampKey, parseSegment, type Segment } from '../shared/logArchive/segment'
import { characterId } from './log/config'
import { getActiveCharacter } from './session'
import { engineRequest, engineServeReadiness } from './dataServer/engineClientHost'
import { readHeadBytes } from './logArchive/history'
import { logArchiveDir } from './logArchive/liveHistory'
import { logArchiveOn } from './storeLogArchive'
import { loadInventoryDump } from './outputs'
import { ownershipPayload, type OwnershipPayload } from '../shared/planner/ownership'
import { isOwnExport } from '../shared/gapHeld'
import { writeFileDurable } from './telemetry/durableWrite'
import { logInfo } from './errorLog'

const SAVE_EVERY_MS = 2 * 60 * 1000
const SAFE_ID = /^[a-z0-9_.-]+$/

function savedDir(): string {
  return join(app.getPath('userData'), 'gaps-characters')
}

/** The log's identity as the archive's eligibility rule reads it. */
function logIdentity(path: string): SavedLog | null {
  const head = readHeadBytes(path, HEAD_BYTES)
  if (head === null) return null
  let firstStamp: string | null = null
  for (const line of head.toString('latin1').split('\n')) {
    firstStamp = logStampKey(line)
    if (firstStamp !== null) break
  }
  return { headBytes: head.length, headSha256: createHash('sha256').update(head).digest('hex'), firstStamp }
}

/** One module's raw live state, or null when the engine cannot serve it now. */
async function rawModule(module: GapSourceModule): Promise<{ seq: number; state: unknown } | null> {
  try {
    const r = await engineRequest('module.snapshot', { module })
    return r.module === module ? { seq: r.seq, state: r.state } : null
  } catch {
    return null
  }
}

/** The seqs last written per character, so an unmoved snapshot is not written again. */
const lastSeqs = new Map<string, string>()
let saving = false

/** Save the attached character's Gaps inputs when the engine is live on its log and something moved. */
export async function saveAttachedGaps(): Promise<void> {
  if (saving || !engineServeReadiness().ok) return
  const c = getActiveCharacter()
  if (c === null) return
  const id = characterId(c)
  if (!SAFE_ID.test(id)) return
  saving = true
  try {
    const got = await Promise.all(GAP_SOURCE_MODULES.map(rawModule))
    if (got.some((m) => m === null) || getActiveCharacter()?.logPath !== c.logPath) return
    const seqs = got.map((m) => m?.seq).join(',')
    if (lastSeqs.get(id) === seqs) return
    const log = logIdentity(c.logPath)
    if (log === null) return
    const modules = Object.fromEntries(GAP_SOURCE_MODULES.map((m, i) => [m, got[i]])) as SavedGaps['modules']
    const saved: SavedGaps = { v: SAVED_GAPS_VERSION, character: id, name: c.name, server: c.server, savedAt: new Date().toISOString(), log, modules }
    writeFileDurable(savedDir(), join(savedDir(), `${id}.json`), JSON.stringify(saved))
    lastSeqs.set(id, seqs)
  } catch (err) {
    logInfo(`[everquest-companion] gaps characters: save failed: ${(err as Error).message}`)
  } finally {
    saving = false
  }
}

/**
 * Every JSON file in `dir` that `parse` accepts, read without blocking: an archive can hold many
 * large segments, and a synchronous read here froze the window behind the tab's spinner. An
 * unreadable or foreign file is skipped, never repaired.
 */
async function readJsonFiles<T>(dir: string, suffix: string, parse: (raw: unknown, file: string) => T | null): Promise<T[]> {
  if (!existsSync(dir)) return []
  const files = (await readdir(dir)).filter((f) => f.endsWith(suffix))
  const read = await Promise.all(
    files.map(async (file) => {
      try {
        return parse(JSON.parse(await readFile(join(dir, file), 'utf8')), file)
      } catch {
        return null
      }
    })
  )
  return read.filter((x): x is Awaited<T> & NonNullable<T> => x !== null)
}

const readSaved = (): Promise<SavedGaps[]> =>
  readJsonFiles(savedDir(), '.json', (raw, file) => {
    const s = parseSavedGaps(raw)
    return s !== null && `${s.character}.json` === file ? s : null
  })

/** The archive's segments, read as `segmentStore.listSegments` reads them (same parser, same name check). */
const readSegments = (): Promise<Segment[]> =>
  readJsonFiles(logArchiveDir(), '.segment.json', (raw, file) => {
    const p = parseSegment(raw)
    return p.ok && `${p.segment.id}.segment.json` === file ? p.segment : null
  })

/** What the listing depends on: each file's name, size and time in both folders. */
function folderMark(dir: string): string {
  if (!existsSync(dir)) return ''
  return readdirSync(dir)
    .map((f) => {
      try {
        const s = statSync(join(dir, f))
        return `${f}:${s.size}:${s.mtimeMs}`
      } catch {
        return f
      }
    })
    .join('|')
}

let cache: { key: string; value: CharacterGaps[] } | null = null

/**
 * The character's OWN inventory export folded as the Gear tab folds it, for "held by" (owner,
 * 2026-10-19). The loader falls back to another character's newest export; that one is refused.
 * Read on every ask: a file the player rewrites is picked up, and it is one small text file each.
 */
function ownInventory(c: CharacterGaps): OwnershipPayload | null {
  try {
    const payload = ownershipPayload(loadInventoryDump(c.name, c.server))
    return isOwnExport(payload.path, c.name, c.server) ? payload : null
  } catch {
    return null
  }
}

/** Every other character's Gaps inputs, archives folded in when the archive is on, cut at `sinceStamp`. */
export async function allCharacterGaps(sinceStamp: string | null): Promise<CharacterGaps[]> {
  const active = getActiveCharacter()
  const except = active === null ? null : characterId(active)
  const archiveOn = logArchiveOn()
  const key = [sinceStamp, except, archiveOn, folderMark(savedDir()), archiveOn ? folderMark(logArchiveDir()) : ''].join('\n')
  if (cache?.key === key) return cache.value.map((c) => ({ ...c, inventory: ownInventory(c) }))
  const [saved, segments] = await Promise.all([readSaved(), archiveOn ? readSegments() : Promise.resolve([])])
  const value: CharacterGaps[] = []
  for (const id of otherCharacters(saved, segments, except)) {
    const one = characterGaps(id, saved.find((s) => s.character === id) ?? null, segments, sinceStamp)
    if (one !== null) value.push(one)
  }
  cache = { key, value }
  return value.map((c) => ({ ...c, inventory: ownInventory(c) }))
}

/** Called once at launch, after the session has started tailing. */
export function startGapsCharacterSaves(): void {
  setInterval(() => void saveAttachedGaps(), SAVE_EVERY_MS).unref()
}

export function registerGapsCharactersIpc(): void {
  ipcMain.handle(IPC.gapsAllCharacters, (_e, sinceStamp: unknown) =>
    allCharacterGaps(typeof sinceStamp === 'string' && sinceStamp.length <= 19 ? sinceStamp : null)
  )
}
