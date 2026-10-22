// IPC: the Gaps tab asks what the runtime knowledge caches already say about a set of names
// (owner ask, 2026-10-12). READ-ONLY: the caches are read as files, through gapVerdictsRead.ts,
// and nothing here can start a lookup or a fetch. The domain and the names are validated at the
// handler; a request past the cap answers the cap's worth.

import { ipcMain, app } from 'electron'
import { existsSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import { IPC } from '../../shared/ipc'
import type { GapVerdicts } from '../../shared/gaps'
import { itemTierKey } from '../../shared/itemStats'
import { mobKey } from '../../shared/mobKey'
import { verdictsFrom, type KnowledgeCacheFile } from '../gapVerdictsRead'
import { itemPageMobs } from '../gapItemMobs'
import { itemPageForage } from '../gapItemForage'
import { spellFactsFrom } from '../gapSpellFacts'
import type { ClientSpellFacts } from '../../shared/gaps'
import { effectiveEqRoot } from '../log/config'

/** The cache files' versions, as `itemLookup.ts` / `mobLookup.ts` write them — a mismatched file
 *  answers `unchecked` for everything, as their own readers drop it. Audited against those two
 *  sources by tests/gapVerdicts.test.mts. */
export const ITEM_CACHE_VERSION = 4
export const MOB_CACHE_VERSION = 1

const MAX_NAMES = 1000

const SOURCES = {
  item: { file: 'item-knowledge-cache.json', version: ITEM_CACHE_VERSION, keyOf: itemTierKey },
  mob: { file: 'mob-knowledge-cache.json', version: MOB_CACHE_VERSION, keyOf: mobKey }
} as const

function readCache(file: string): KnowledgeCacheFile | null {
  const path = join(app.getPath('userData'), file)
  if (!existsSync(path)) return null
  try {
    return JSON.parse(readFileSync(path, 'utf8')) as KnowledgeCacheFile | null
  } catch {
    return null
  }
}

export function gapVerdicts(domain: unknown, names: unknown): GapVerdicts {
  const source = domain === 'item' || domain === 'mob' ? SOURCES[domain] : null
  if (source === null || !Array.isArray(names)) return {}
  const asked = names.filter((n): n is string => typeof n === 'string').slice(0, MAX_NAMES)
  return verdictsFrom(readCache(source.file), source.version, asked, source.keyOf)
}

/** The install's spell files, read at rest when a spell page is asked for; none when they are missing. */
function clientSpellFacts(names: readonly string[]): Record<string, ClientSpellFacts> {
  try {
    const root = effectiveEqRoot()
    const us = readFileSync(join(root, 'spells_us.txt'), 'latin1')
    const optional = (file: string): string => (existsSync(join(root, file)) ? readFileSync(join(root, file), 'latin1') : '')
    // dbstr_us.txt: the descriptions (phase 4 of screenshot to wiki), read at rest like the others.
    return spellFactsFrom(us, optional('spells_us_str.txt'), names, optional('dbstr_us.txt'))
  } catch {
    return {}
  }
}

export function registerGapVerdictsIpc(): void {
  ipcMain.handle(IPC.gapVerdicts, (_e, domain: unknown, names: unknown) => gapVerdicts(domain, names))
  ipcMain.handle(IPC.gapSpellFacts, (_e, names: unknown) =>
    Array.isArray(names) ? clientSpellFacts(names.filter((n): n is string => typeof n === 'string').slice(0, MAX_NAMES)) : {}
  )
  ipcMain.handle(IPC.gapItemMobs, (_e, names: unknown) =>
    Array.isArray(names) ? itemPageMobs(names.filter((n): n is string => typeof n === 'string').slice(0, MAX_NAMES)) : {}
  )
  ipcMain.handle(IPC.gapItemForage, (_e, names: unknown) =>
    Array.isArray(names) ? itemPageForage(names.filter((n): n is string => typeof n === 'string').slice(0, MAX_NAMES)) : {}
  )
}
