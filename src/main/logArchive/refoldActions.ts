// main/logArchive/refoldActions.ts — THE REFOLD, WIRED TO THE APP (step 5.4).
//
// The developer's trial: fold one segment's archive in a second engine and say, module by module,
// whether the totals match what the segment stored. It changes nothing on disk except its own temp
// folder, which it removes.
//
// DEVELOPER-ONLY. Refused in a packaged build, and nothing in the player's panel calls it; it is
// reached from a dev console or a trial script (`window.eq.logArchiveRefoldTrial`). It still checks
// the switch, because the archive folder is not opened while the switch is off.

import { app } from 'electron'
import { dirname, join } from 'node:path'
import { readDefine } from '../dataServer/appKnowledge'
import { DEFINE_OPS } from '../dataServer/definePush'
import { engineBinaryInUse, spawnEngineProcess } from '../dataServer/engineHost'
import { hostClockHint, resolvedTimeZone } from '../dataServer/hostClock'
import { getActiveCharacter } from '../session'
import { logArchiveOn } from '../storeLogArchive'
import { compareModules, type RefoldTrialReport } from '../../shared/logArchive/refoldCompare'
import type { Segment } from '../../shared/logArchive/segment'
import { logArchiveDir } from './liveHistory'
import { refoldSegment, type RefoldDeps, type RefoldResult } from './refold'
import { listSegments } from './segmentStore'

/** Where refolds stage their temp folders. */
function workRoot(): string {
  return join(app.getPath('temp'), 'eqc-log-archive-refold')
}

/** The live install's folder, where the client's tables are. */
function installRoot(): string | null {
  const c = getActiveCharacter()
  return c === null ? null : dirname(dirname(c.logPath))
}

/** Everything a refold needs from the running app, or why it cannot run. */
export function refoldDeps(withTables: boolean): RefoldDeps | string {
  const bin = engineBinaryInUse()
  if (bin === null) return 'the engine has not started'
  return {
    bin,
    spawn: spawnEngineProcess,
    tablesRoot: withTables ? installRoot() : null,
    defines: DEFINE_OPS.map((op) => ({ op, params: readDefine(op) })),
    clock: hostClockHint(new Date(), resolvedTimeZone),
    workRoot: workRoot()
  }
}

/** Refold a segment with the running app's engine and knowledge. */
export async function refoldWithApp(segment: Segment, withTables: boolean): Promise<RefoldResult> {
  const deps = refoldDeps(withTables)
  return typeof deps === 'string' ? { ok: false, reason: deps } : refoldSegment(segment, deps)
}

function empty(message: string, capturedBy: Segment['producedBy'] | null = null): RefoldTrialReport {
  return { ok: false, message, capturedBy, running: app.getVersion(), bytes: 0, stageMs: 0, foldMs: 0, events: 0, tables: 0, verdicts: [] }
}

let trialRunning = false

/** Step 5.4: does a second fold of this segment's archive give the totals it stored? */
export async function refoldTrial(id: string, withTables: boolean): Promise<RefoldTrialReport> {
  if (app.isPackaged) return empty('The refold trial is a developer tool.')
  if (!logArchiveOn()) return empty('Summarize and archive log is off.')
  if (trialRunning) return empty('A refold trial is already running.')
  const segment = listSegments(logArchiveDir()).segments.find((s) => s.id === id)
  if (segment === undefined) return empty('That segment was not found.')
  trialRunning = true
  try {
    const r = await refoldWithApp(segment, withTables)
    if (!r.ok) return empty(`Not refolded: ${r.reason}.`, segment.producedBy)
    const verdicts = compareModules(segment.modules, r.fold.modules)
    const differ = verdicts.filter((v) => !v.same).length
    return {
      ok: true,
      message: differ === 0 ? 'Every module matches.' : `${String(differ)} of ${String(verdicts.length)} modules differ.`,
      capturedBy: segment.producedBy,
      running: app.getVersion(),
      bytes: segment.log.bytes,
      stageMs: r.stageMs,
      foldMs: r.fold.foldMs,
      events: r.fold.events,
      tables: r.tables,
      verdicts
    }
  } finally {
    trialRunning = false
  }
}
