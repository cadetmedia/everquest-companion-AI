// storeLogArchive.ts — the log-archive switch, wired to the settings store (step 1.0).
//
// Storage and nothing else; the rule and its argument live in shared/logArchive/prefs.ts. Every
// log-archive step asks `logArchiveOn()` before it does anything.

import { settingsStore } from './store'
import { normalizeLogArchivePrefs, type LogArchivePrefs } from '../shared/logArchive/prefs'

/** The stored blob, defaulted. Never throws. */
export function getLogArchivePrefs(): LogArchivePrefs {
  return normalizeLogArchivePrefs(settingsStore.get('logArchive'))
}

/** Merge-patch the blob; returns the stored value. Validated here because a renderer supplies it. */
export function setLogArchivePrefs(patch: Partial<LogArchivePrefs>): LogArchivePrefs {
  const next = normalizeLogArchivePrefs({ ...getLogArchivePrefs(), ...patch })
  settingsStore.set('logArchive', next)
  return next
}

/** Is Summarize and archive log on? Off unless the player turned it on. */
export function logArchiveOn(): boolean {
  return getLogArchivePrefs().enabled
}
