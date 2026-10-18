// knowledgeCache.ts — the persistent, versioned userData cache behind the two live knowledge
// services' WIKI FALLBACK (itemLookup.ts → `item-knowledge-cache.json`, mobLookup.ts →
// `mob-knowledge-cache.json`).
//
// ONE SPELLING, SEPARATE STATE — the wikiClient.ts argument again. Both services used to carry
// this half as a hand copy that differed only by record type, file name and log tag. Each still
// owns its own instance: its own file, its own CACHE_VERSION (whose bump history lives beside it in
// the service), its own in-memory map and its own save latch.
//
// What a cache holds: positive results forever (wiki item lore and mob drop tables are static
// content), real negatives (no page) for 7 days, offline misses for 30 minutes so they are retried
// soon. A version mismatch drops the whole file; a hit never touches the network.

import { app } from 'electron'
import { existsSync, readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { logError } from './errorLog'
// THE ATOMIC WRITE, REUSED RATHER THAN RE-SPELLED (the storeFile.ts precedent, JOS-272): this app
// has ONE answer to writing a whole file, and since JOS-371 it has an asynchronous one.
import { writeFileDurableAsync } from './telemetry/durableWrite'

const NEG_TTL_MS = 7 * 24 * 60 * 60 * 1000 // negative results: retry after 7 days
const OFFLINE_TTL_MS = 30 * 60 * 1000 // offline misses: retry after 30 min
const SAVE_DEBOUNCE_MS = 1500

export interface CacheEntry<T> {
  at: number
  data: T
}
interface CacheFile<T> {
  version: number
  entries: Record<string, CacheEntry<T>>
}

/** The two flags a cached record carries when it is not a positive result. */
interface Negatable {
  offline?: boolean
  notFound?: boolean
}

export interface KnowledgeCacheSpec {
  /** The file's stem: `item-knowledge` names `item-knowledge-cache.json` in userData, and the log
   *  lines say `failed reading item-knowledge cache`. */
  name: string
  /** The service's CACHE_VERSION. A file written under any other version is dropped whole. */
  version: number
  /** The `logError` source, e.g. `main:itemLookup`. */
  tag: string
}

export interface KnowledgeCache<T> {
  /** The in-memory map, read from disk on first use. */
  load(): Map<string, CacheEntry<T>>
  /** Persist the whole map, debounced (see `scheduleSave` below). */
  scheduleSave(): void
  /** A cache entry is usable when it's a positive result, or a still-fresh negative/offline. */
  hit(entry: CacheEntry<T>): boolean
}

/** One service's cache. Nothing is read or written until the first `load`/`scheduleSave`. */
export function createKnowledgeCache<T extends Negatable>({ name, version, tag }: KnowledgeCacheSpec): KnowledgeCache<T> {
  let mem: Map<string, CacheEntry<T>> | null = null

  function cacheFilePath(): string {
    return join(app.getPath('userData'), `${name}-cache.json`)
  }

  /** The cache file's entries, or null when it is absent, empty, or written by another
   *  CACHE_VERSION (a version mismatch drops the whole file). */
  function readCacheEntries(path: string): Record<string, CacheEntry<T>> | null {
    if (!existsSync(path)) return null
    const parsed = JSON.parse(readFileSync(path, 'utf8')) as CacheFile<T> | null
    if (parsed === null) return null
    if (parsed.version !== version) return null
    if (!parsed.entries) return null
    return parsed.entries
  }

  function load(): Map<string, CacheEntry<T>> {
    if (mem) return mem
    mem = new Map()
    try {
      const entries = readCacheEntries(cacheFilePath())
      if (entries) {
        for (const [k, v] of Object.entries(entries)) mem.set(k, v)
      }
    } catch (err) {
      logError(tag, { message: `failed reading ${name} cache`, err })
    }
    return mem
  }

  /**
   * Persist the cache, 1.5 s after the write that dirtied it — off the main thread since JOS-371
   * (itemLookup) and JOS-460 (mobLookup, which was written field for field against itemLookup and
   * inherited the same spelling).
   *
   * WHY IT WAS SYNCHRONOUS: for no reason beyond being the shortest way to write a file. The
   * debounce was already doing the load-bearing work (a burst of loot or `/con`s, one write), but
   * the write itself still stopped the main process — on a LIVE path, once per burst, for as long
   * as the app is open, and while an overlay holds the mouse a main-thread stall is a system-wide
   * one.
   *
   * WHAT GUARANTEES THE SAME THING NOW: `writeFileDurableAsync` — this app's ONE answer to writing
   * a whole file (temp + fsync + rename, JOS-265), through libuv's threadpool. It is strictly
   * stronger than what was here: the old `writeFileSync` truncated the live cache FIRST, so a
   * process killed mid-write left a torn file, and `load` reads a file that will not parse as an
   * EMPTY one — every key this install had ever resolved, silently gone. The atomic write cannot
   * produce that.
   *
   * The debounce latch is what serialises it: `saveTimer` is cleared when the write is SCHEDULED
   * and `saving` holds until it settles, so a second write can never be started into the first
   * one's scratch file. A save asked for during a write simply re-arms the timer.
   */
  let saveTimer: ReturnType<typeof setTimeout> | null = null
  let saving = false
  function scheduleSave(): void {
    if (saveTimer) return
    saveTimer = setTimeout(() => {
      saveTimer = null
      if (saving) {
        // A write is still in the threadpool. Re-arm rather than race its temp file; every write
        // serialises the whole live map, so the re-armed one states everything the skipped one
        // would have — including mobLookup's alias repair deletions (`repairAliasCache`).
        scheduleSave()
        return
      }
      saving = true
      const entries: Record<string, CacheEntry<T>> = {}
      for (const [k, v] of (mem ?? new Map<string, CacheEntry<T>>()).entries()) entries[k] = v
      const path = cacheFilePath()
      void writeFileDurableAsync(dirname(path), path, JSON.stringify({ version, entries } satisfies CacheFile<T>))
        .catch((err: unknown) => {
          logError(tag, { message: `failed writing ${name} cache`, err })
        })
        .finally(() => {
          saving = false
        })
    }, SAVE_DEBOUNCE_MS)
  }

  function hit(entry: CacheEntry<T>): boolean {
    const age = Date.now() - entry.at
    if (entry.data.offline) return age < OFFLINE_TTL_MS
    if (entry.data.notFound) return age < NEG_TTL_MS
    return true // positive results don't expire (wiki item and mob data is static)
  }

  return { load, scheduleSave, hit }
}
