// shared/logArchive/prefs.ts — THE SWITCH for keeping log history (docs/plans/log-archive, step 1.0).
//
// OFF FOR EVERY PLAYER, and only the player turns it on (owner ruling, 2026-10-03). While it is off
// the app captures nothing, backs up nothing, moves nothing, and never opens the archive folder:
// every tab shows exactly what the engine served. Turning it off again hides archived history; the
// files stay on disk and come back when it is turned on.
//
// ABSENT MEANS OFF, which is the shipped behaviour, so the stored key is additive and optional
// with no schema bump and no migration (the `buffTrust` precedent in storeShape.ts).
//
// ZERO-IMPORT, so the main-side adapter and the node tests read the same normalizer.

/** The persisted log-archive prefs. A blob so the feature can grow without a second shape. */
export interface LogArchivePrefs {
  /** Summarize and archive log: archive on the player's click, and show archived history on the tabs. */
  enabled: boolean
}

/** OFF. Nothing turns it on except the player. */
export const DEFAULT_LOG_ARCHIVE_PREFS: LogArchivePrefs = { enabled: false }

/** Defaulted from `unknown`. Anything but a literal `true` reads as off. */
export function normalizeLogArchivePrefs(raw: unknown): LogArchivePrefs {
  if (raw === null || typeof raw !== 'object') return { ...DEFAULT_LOG_ARCHIVE_PREFS }
  return { enabled: (raw as { enabled?: unknown }).enabled === true }
}
