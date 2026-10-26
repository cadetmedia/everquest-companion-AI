// main/logArchive/liveHistory.ts — the production instance of history.ts, wired to the real
// switch, the archive folder beside the game's logs (ruling 0.2) and the attached character.
//
// Kept apart from history.ts so that file stays free of Electron and node-tested end to end.

import { join } from 'node:path'
import { logInfo } from '../errorLog'
import { characterId, eqLogsDir } from '../log/config'
import { activeCharId, getActiveCharacter } from '../session'
import { getComboCorrections } from '../store'
import { logArchiveOn } from '../storeLogArchive'
import { createHistoryMerge, readHeadBytes } from './history'
import type { WikiRespawnData } from '../../shared/respawnWiki'
import respawnsJson from '../data/respawns.json'

/** The pages' respawn statements by mob key: the same committed file the engine embeds. */
const RESPAWN_WIKI = new Map((respawnsJson as WikiRespawnData).rows.map((r) => [r.key, r]))

/**
 * Where segments and archives live: a subfolder of the game's Logs folder (ruling 0.2, owner
 * 2026-10-07). Every install on the machine reads the same log, so the history the log was moved
 * into has to be where all of them look, not in one install's data folder. Log discovery does not
 * read subfolders, so nothing here is mistaken for a character.
 */
export function logArchiveDir(): string {
  return join(eqLogsDir(), 'companion-archive')
}

export const liveHistory = createHistoryMerge({
  // Arrows, not bare references: this module sits on the read path's import graph, and a cycle
  // must find no binding read at evaluation time.
  on: () => logArchiveOn(),
  dir: () => logArchiveDir(),
  attached: () => {
    const c = getActiveCharacter()
    return c === null ? null : { character: characterId(c), logPath: c.logPath }
  },
  readHead: (path, n) => readHeadBytes(path, n),
  comboCorrections: () => getComboCorrections(activeCharId()),
  respawnWiki: (key) => RESPAWN_WIKI.get(key),
  note: (line) => {
    logInfo(`[everquest-companion] ${line}`)
  }
})
