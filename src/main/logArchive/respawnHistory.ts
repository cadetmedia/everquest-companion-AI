// main/logArchive/respawnHistory.ts — THE LEARNED GAPS OF EVERY MOB, NOT ONLY THE WATCHED ONES
// (step 4.14).
//
// The respawn fold remembers up to 800 mobs, each with the gaps it measured between deaths, but
// publishes a clock row only for a mob the player watches (`respawn.rs collect`). So a segment's
// `respawn` snapshot holds the gaps of the mobs watched when it was captured, and a mob first
// watched after its log was archived started from nothing.
//
// The history can still be read without changing the engine: the watch list is a define, and the
// fold re-cuts its rows from the history it already holds the moment the list changes (no refold).
// So the capture watches the mobs it knows of in batches, keeps each batch's rows, and puts the
// player's own list back, all inside the capture's before/after pair. The same reader runs against
// the throwaway engine of a refresh, where nothing needs putting back.
//
// WHICH MOBS: every mob in the `kills` snapshot, and every recent respawn candidate. A mob the fold
// saw die but the player never killed and that is no longer recent is not asked for.
//
// WHAT IS KEPT: rows that learned something (a gap, a bound or a sample). A row is at most a few
// hundred bytes; the measured log's 800-mob history is well under a megabyte.

import { RESPAWN_MAX_ROWS, type RespawnRow } from '../../shared/respawn'

export interface RespawnHistoryDeps {
  /** Make the respawn module watch exactly these mob keys. */
  watch: (keys: readonly string[]) => Promise<void>
  /** The respawn module's clock rows as they stand, or null when they cannot be read. */
  rows: () => Promise<RespawnRow[] | null>
  /** Put the player's own watch list back. Called whatever happened, retried if it fails. */
  restore: () => Promise<void>
  /** Told when the list could not be put back after every retry, so the caller can re-push it
   *  by its own path and say so. */
  restoreFailed?: (err: unknown) => void
}

const RESTORE_TRIES = 3

/** `restore`, tried a few times; a list left as a batch would stand until something pushed again. */
async function restoreList(deps: RespawnHistoryDeps): Promise<void> {
  let last: unknown
  for (let i = 0; i < RESTORE_TRIES; i++) {
    try {
      await deps.restore()
      return
    } catch (err) {
      last = err
    }
  }
  deps.restoreFailed?.(last)
}

/** Keys per define: under the engine's 200-watch cap, and few enough that most batches stay under
 *  its 60-row page even when a mob died in several zones. A full page is split and asked again. */
const BATCH = 40

function keysOf(map: unknown): string[] {
  return map !== null && typeof map === 'object' && !Array.isArray(map) ? Object.keys(map) : []
}

/** The mob keys to ask about: the kills snapshot's mobs and the respawn candidates, once each. */
export function historyKeys(kills: unknown, respawn: unknown): string[] {
  const mobs = keysOf((kills as { mobs?: unknown } | null)?.mobs)
  const recent: unknown = (respawn as { recent?: unknown } | null)?.recent
  const keyOf = (c: unknown): string[] => {
    const key = (c as { key?: unknown } | null)?.key
    return typeof key === 'string' ? [key] : []
  }
  const candidates = Array.isArray(recent) ? (recent as unknown[]).flatMap(keyOf) : []
  return [...new Set([...mobs, ...candidates].map((k) => k.toLowerCase()))].sort()
}

function learned(r: RespawnRow): boolean {
  return r.samples > 0 || (r.gapsMs?.length ?? 0) > 0 || r.observedMs !== undefined
}

/** One batch into `out`. False when the rows could not be read. */
async function readBatch(keys: readonly string[], deps: RespawnHistoryDeps, out: Map<string, RespawnRow>): Promise<boolean> {
  await deps.watch(keys)
  const rows = await deps.rows()
  if (rows === null) return false
  if (rows.length >= RESPAWN_MAX_ROWS && keys.length > 1) {
    const half = Math.ceil(keys.length / 2)
    return (await readBatch(keys.slice(0, half), deps, out)) && (await readBatch(keys.slice(half), deps, out))
  }
  for (const r of rows) if (learned(r)) out.set(r.id, r)
  return true
}

/** Every learned row for `keys`, or null when the engine could not be read. Always restores. */
export async function readRespawnHistory(keys: readonly string[], deps: RespawnHistoryDeps): Promise<RespawnRow[] | null> {
  if (keys.length === 0) return []
  const out = new Map<string, RespawnRow>()
  try {
    for (let i = 0; i < keys.length; i += BATCH) {
      if (!(await readBatch(keys.slice(i, i + BATCH), deps, out))) return null
    }
    return [...out.values()]
  } catch {
    return null
  } finally {
    await restoreList(deps)
  }
}
