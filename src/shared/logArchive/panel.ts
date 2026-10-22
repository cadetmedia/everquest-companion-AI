// shared/logArchive/panel.ts — what the Log archive card draws, and the words it uses.
//
// Main assembles a `LogArchiveStatus` after every action and hands it back with the outcome, so
// the card never has to piece state together from separate calls.

import type { HeldReason } from './eligible'
import type { SegmentState } from './segment'

export interface SegmentRow {
  id: string
  state: SegmentState
  firstStamp: string
  lastStamp: string
  logBytes: number
  /** Archive size on disk, once backed up. */
  gzBytes: number | null
  archivePath: string | null
  /** Lines in the archive that the stored totals do not count (phase 3's capture window). */
  gapLines: number
  /** The app version that captured it (step 5.3). */
  app: string
  /** True when a different engine build than the running one produced its totals. */
  olderEngine: boolean
}

export interface DumpAdvice {
  inventoryMs: number | null
  factionsMs: number | null
  /** True when either dump is missing or older than the log's last write. */
  stale: boolean
}

export interface LogArchiveStatus {
  enabled: boolean
  /** Where segments and archives are kept. */
  dir: string
  live: { path: string; bytes: number; modifiedMs: number } | null
  segments: SegmentRow[]
  /** The kept ones among `segments`: the archived logs the card lists. `segments` keeps every
   *  state, because the trial scripts read a fresh backup's id from it. */
  archived: SegmentRow[]
  /** The newest kept segment: the only one that can be put back. */
  newestSealedId: string | null
  /** Sealed segments not being shown, with the reason in plain words. */
  held: { id: string; text: string }[]
  /** Files in the folder that could not be read. */
  skipped: { file: string; reason: string }[]
  dumps: DumpAdvice | null
  /** Why archiving the log is not possible right now; empty when it is. */
  rotateBlockers: string[]
  /** An action in progress, if any. */
  busy: string | null
}

export interface LogArchiveReply {
  ok: boolean
  /** What happened, or why not, in plain words. */
  message: string
  status: LogArchiveStatus
}

/** The held reasons in the player's words. */
export const HELD_TEXT: Readonly<Record<HeldReason, string>> = {
  'live-log-contains-it': 'Your current log still contains this stretch, so it is already counted.',
  'overlaps-live-log':
    'Your current log starts before this stretch ends, so the two may overlap. It is held back so nothing is counted twice.',
  'sealed-this-attach': 'Kept during this session. It is shown from the next launch.',
  'contained-in-a-later-archive': 'A later backup of the same log covers this one.',
  'overlaps-another-archive': 'Overlaps another archive in time, so it is held back so nothing is counted twice.'
}
