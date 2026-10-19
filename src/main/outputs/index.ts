// ============================================================================
// outputs/ — the ENGINE that reads EQ `/outputfile` dumps. Public surface.
// ============================================================================
//
// Five pieces, deliberately separable:
//   shared/outputs/kinds.ts  the FACTS: which kinds exist, the command, the why-clause, the
//                            filename pattern, and which ones we may parse (the no-guessing law).
//   kinds.ts                 the PARSE half of that registry (parsers are main's).
//   discovery.ts             finding a kind's file under `effectiveEqRoot()`.
//   watch.ts                 the shared "a dump was rewritten"/"a dump appeared" watchers.
//   registry.ts              the RUNTIME registry: status (path + the player's own mtime) and
//                            the one watch entry point every consumer uses.
//   inventoryParse.ts        the one graduated kind's pure parser (model: shared/outputs/inventory.ts).
//
// NOTHING IS PERSISTED FROM HERE. Dumps are parsed on demand and held in memory by their caller.
// The only persisted artifact remains the flat `HeldCounts` map the reconcile surfaces already
// store (`store.ts setInventory`, `ProgressState.inventory`) — see the note on
// `loadInventoryDump` below.

import { readFileSync } from 'fs'
import type { InventoryDump } from '../../shared/outputs/inventory'
import {
  classUnlockClaims,
  confirmedDeity,
  raceUnlockClaims,
  type AchievementsSource,
  type ClassUnlockClaim,
  type RaceUnlockClaim
} from '../../shared/outputs/achievements'
import type { FactionStanding, FactionsSource } from '../../shared/outputs/factions'
import { isOwnOutputFile } from '../../shared/outputs/kinds'
import type { OutputKindId } from '../../shared/outputs/kinds'
import { logWarn } from '../errorLog'
import { outputKind, ownsOutputFile, parseOutput, type OutputParseResult } from './kinds'
import { outputStatus, type OutputCharacter } from './registry'

export { findOutputFile } from './discovery'
export { watchForOutputFile, watchOutputFile, type OutputWatchHandlers } from './watch'
export { inventoryHeldCounts, parseInventoryDump } from './inventoryParse'
export {
  outputStatus,
  outputStatuses,
  watchOutputKind,
  type OutputCharacter,
  type OutputKindWatch,
  type OutputWatchOptions
} from './registry'
export {
  isOutputFileName,
  outputFileNames,
  OUTPUT_KINDS,
  outputKind,
  parseOutput,
  preferredOutputFile,
  type AchievementsOutput,
  type FactionsOutput,
  type InventoryOutput,
  type OutputData,
  type OutputFileStatus,
  type OutputKindDef,
  type OutputKindId,
  type OutputParseResult
} from './kinds'

/** A dump that was found on disk, with whatever the registry made of it. */
export interface LoadedOutput {
  kind: OutputKindId
  path: string
  /** The file's mtime — when the PLAYER produced the dump, not when we read it. */
  loadedAt: string
  result: OutputParseResult
}

/**
 * Find + read + parse a kind's dump for a character. Null when there is no such file.
 *
 * The find + the mtime both come from `outputStatus`, so "where is it" and "how old is it" have
 * exactly ONE answer in this process — the same one the UI's freshness line is rendering.
 */
export function loadOutput(
  id: OutputKindId,
  characterName?: string,
  server?: string
): LoadedOutput | null {
  const character: OutputCharacter = { name: characterName, server }
  const status = outputStatus(id, character)
  if (status.path === null || status.updatedAt === null) return null
  let text: string
  try {
    text = readFileSync(status.path, 'utf8')
  } catch (err) {
    // The dump can vanish between the status check and this read, or be held open by EQ while it
    // writes (EBUSY). Either way it reads as "no dump", the answer the stat above already gives a
    // deleted file. Throwing instead escaped `tailCharacter` at startup, before the engine attach.
    logWarn(`[everquest-companion] Could not read ${id} dump: ${status.path}`, err)
    return null
  }
  return {
    kind: id,
    path: status.path,
    loadedAt: status.updatedAt,
    result: parseOutput(id, text)
  }
}

/** The deep inventory model for a character's newest dump. */
export interface LoadedInventoryDump {
  path: string
  loadedAt: string
  dump: InventoryDump
}

/**
 * Load + parse the character's inventory dump into the DEEP model.
 *
 * PERSISTENCE (decided this wave, deliberately): the dump is NOT written to the store. It
 * is ~256 rows of nested objects derived from a file that is already on disk and re-read in
 * milliseconds, it has no consumer that outlives the process, and the store-migration law
 * (`storeMigrations.ts`) means every persisted shape is owed a migration step forever. A
 * key nobody reads is pure migration debt. When a surface finally needs it across restarts,
 * it lands as an ADDITIVE key with a defaulting reader plus its migration step, in the same
 * commit — until then, parse on demand.
 */
export function loadInventoryDump(
  characterName?: string,
  server?: string
): LoadedInventoryDump | null {
  const loaded = loadOutput('inventory', characterName, server)
  // Another character's dump is refused, as the achievements one is: its counts would be saved under
  // this character (2026-10-19: a new character on a new server was shown Drywrought's inventory).
  if (!loaded || !ownsOutputFile(outputKind('inventory'), loaded.path, characterName, server)) return null
  const { result } = loaded
  // The registry types this narrowing honestly: an unsupported kind never yields data.
  if (!result.ok || result.data.kind !== 'inventory') return null
  return { path: loaded.path, loadedAt: loaded.loadedAt, dump: result.data.dump }
}

/** The achievements dump's earned class-unlock rewards, plus the record of where they came from. */
export interface LoadedAchievements {
  path: string
  /** The earned `Obtain <Item>` rows — the flat artifact that gets persisted (JOS-429). */
  unlocks: ClassUnlockClaim[]
  /** The race unlocks and their required factions — the Factions tab's half (2026-09-05). */
  races: RaceUnlockClaim[]
  /** Exactly what gets persisted as `ProgressState.achievementsSource`. */
  source: AchievementsSource
  /** The character's deity, the game's spelling, or null when the file does not say. */
  deity: string | null
}

/**
 * Load + parse the character's achievements dump into the EARNED class-unlock claims (JOS-429).
 *
 * THE FLAT ARTIFACT, not the dump — the `loadInventory` arrangement one file over, and for the
 * identical reason. The parsed dump is 1,857 rows of which this app reads 95, it has no consumer
 * that outlives the process, and the store-migration law makes every persisted shape a debt
 * forever. So the projection is taken HERE, at the one place the file becomes the model, and the
 * rows themselves are dropped.
 *
 * `now` is injected for the same reason `loadInventory`'s is: a test that pins the record should
 * not have to pin a clock.
 */
export function loadAchievements(
  characterName?: string,
  server?: string,
  now: () => number = Date.now
): LoadedAchievements | null {
  const loaded = loadOutput('achievements', characterName, server)
  if (!loaded || !ownsOutputFile(outputKind('achievements'), loaded.path, characterName, server)) return null
  const { result } = loaded
  if (!result.ok || result.data.kind !== 'achievements') return null
  return {
    path: loaded.path,
    unlocks: classUnlockClaims(result.data.dump),
    races: raceUnlockClaims(result.data.dump),
    // R2's fourth condition (owner report 2026-09-11). Taken here with the unlocks because this is
    // the one place the file becomes the model, and for the same reason: the 1,857 parsed rows do
    // not outlive this call.
    deity: confirmedDeity(result.data.dump),
    // `loadedAt` is the FILE's mtime (when the player typed the command) and `readAt` is ours —
    // the JOS-253 pair, kept because a single timestamp cannot answer both questions.
    source: { path: loaded.path, loadedAt: loaded.loadedAt, readAt: now() }
  }
}

/** The factions dump's standings, plus the record of where they came from. */
export interface LoadedFactions {
  path: string
  /** Every faction row the dump states — the flat artifact that gets persisted. */
  standings: FactionStanding[]
  /** Exactly what gets persisted as `ProgressState.factionsSource`. */
  source: FactionsSource
}

/**
 * Load + parse the character's factions dump (the third graduated kind, 2026-09-05).
 *
 * Here the flat artifact IS the parse — 185 rows of four scalars, nothing to project — so unlike
 * the two loads above there is no second step between the file and the model. `now` is injected
 * for `loadAchievements`' reason: a test that pins the record should not have to pin a clock.
 */
export function loadFactions(
  characterName?: string,
  server?: string,
  now: () => number = Date.now
): LoadedFactions | null {
  const loaded = loadOutput('faction', characterName, server)
  if (!loaded) return null
  // Standings are per character: another character's dump is never this one's.
  if (!isOwnOutputFile(loaded.path, 'faction', characterName, server)) return null
  const { result } = loaded
  if (!result.ok || result.data.kind !== 'faction') return null
  return {
    path: loaded.path,
    standings: result.data.standings,
    source: { path: loaded.path, loadedAt: loaded.loadedAt, readAt: now() }
  }
}
