/**
 * log-archive-refold-trial.mts — STEP 5.4, RUN FOR REAL (docs/plans/log-archive).
 *
 * NOT PART OF THE SUITE: the name does not end `.e2e.mts`. It runs on a COPY of a log in a temp
 * install with its own settings folder, so no player's files are touched:
 *
 *   LOG_ARCHIVE_TRIAL_LOG=<a log, or a copy of one; the name must start eqlog_<Char>_<server>> \
 *   LOG_ARCHIVE_TRIAL_TABLES=<EverQuest folder, for spells_us*.txt and dbstr_us.txt; optional> \
 *   EQ_ENGINE_BIN=<engined.exe; optional> node --import tsx tests/e2e/log-archive-refold-trial.mts
 *
 * One app run: fold the log, turn Summarize and archive log on, back it up (a segment with an archive), then
 * ask the developer's refold trial to fold the archive in a second engine and compare every module.
 * With tables named, it folds twice: without the client's tables beside the staged log, and with.
 *
 * Then step 5.5's check: the segment is made to look as an older build would have left it, with no
 * loot rows, and "Refresh this history" must bring the rows back and record this version.
 */

import type { Page } from 'playwright-core'
import { copyFileSync, existsSync, mkdirSync, mkdtempSync, readFileSync, statSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { basename, join } from 'node:path'
import { buildIfStale } from './build.mjs'
import { check, note, reportRun } from './appHarness.mjs'
import { launchApp, mainWindow, makeUserData, removeUserData } from './appWindow.mjs'
import { settleEngineServing } from './engineSteps.mjs'
import type { RefoldTrialReport } from '../../src/shared/logArchive/refoldCompare'
import type { Segment } from '../../src/shared/logArchive/segment'

const SOURCE = process.env.LOG_ARCHIVE_TRIAL_LOG
const TABLES = process.env.LOG_ARCHIVE_TRIAL_TABLES

function stage(): { installDir: string; logPath: string } {
  if (SOURCE === undefined || !existsSync(SOURCE)) throw new Error('set LOG_ARCHIVE_TRIAL_LOG to a log or a copy of one')
  const installDir = mkdtempSync(join(tmpdir(), 'log-archive-refold-'))
  mkdirSync(join(installDir, 'Logs'))
  const stem = /^(eqlog_[^.]+)/i.exec(basename(SOURCE))?.[1] ?? 'eqlog_Trial_server'
  const logPath = join(installDir, 'Logs', `${stem}.txt`)
  copyFileSync(SOURCE, logPath)
  for (const t of ['spells_us.txt', 'spells_us_str.txt', 'dbstr_us.txt']) {
    if (TABLES !== undefined && existsSync(join(TABLES, t))) copyFileSync(join(TABLES, t), join(installDir, t))
  }
  return { installDir, logPath }
}

function call<T>(page: Page, fn: string, ...args: unknown[]): Promise<T> {
  return page.evaluate(async ([f, a]) => {
    const api = window.eq as unknown as Record<string, (...x: unknown[]) => Promise<unknown>>
    return api[f as string](...(a as unknown[])) as Promise<never>
  }, [fn, args] as const) as Promise<T>
}

function report(label: string, r: RefoldTrialReport): void {
  note(`${label}: ${r.message} captured by ${r.capturedBy?.engine ?? '?'}, refolded by ${r.running}; ` +
    `${r.bytes.toLocaleString()} bytes, staged in ${String(r.stageMs)} ms, folded in ${String(r.foldMs)} ms, ` +
    `${r.events.toLocaleString()} events, ${String(r.tables)} table(s)`)
  for (const v of r.verdicts) note(`  ${v.module}: ${v.detail}`)
  check(`${label}: the refold ran`, r.ok, r.message)
  const differ = r.verdicts.filter((v) => !v.same).map((v) => v.module)
  check(`${label}: every module matches`, r.verdicts.length > 0 && differ.length === 0, differ.join(', '))
}

interface Status {
  segments: { id: string; olderEngine: boolean }[]
}

/** Step 5.5: strip one event kind as an older build might have, mark it older, and refresh. */
async function refreshCheck(page: Page, userData: string, id: string): Promise<void> {
  const file = join(userData, 'log-archive', `${id}.segment.json`)
  const seg = JSON.parse(readFileSync(file, 'utf8')) as Segment
  const rows = (seg.modules.loot?.state as unknown[] | undefined)?.length ?? 0
  check('the fixture has loot rows to lose', rows > 0, String(rows))
  writeFileSync(file, JSON.stringify({ ...seg, producedBy: { app: '0.0.1', engine: '0.0.1' }, modules: { ...seg.modules, loot: { seq: 0, state: [] } } }))
  const st = await call<Status>(page, 'logArchiveStatus')
  check('the panel marks it older', st.segments.find((s) => s.id === id)?.olderEngine === true)
  const r = await call<{ ok: boolean; message: string; status: Status }>(page, 'logArchiveRefresh', id)
  note(`refresh: ${r.message}`)
  check('refresh succeeds', r.ok, r.message)
  const back = JSON.parse(readFileSync(file, 'utf8')) as Segment
  const after = (back.modules.loot?.state as unknown[] | undefined)?.length ?? 0
  check('the loot rows are back after the refresh', after === rows, `${String(after)} of ${String(rows)}`)
  check('the refresh records this version', back.producedBy.engine === seg.producedBy.engine, back.producedBy.engine)
  check('the old file is kept beside it', existsSync(`${file}.old`))
  check('it is no longer marked older', r.status.segments.find((s) => s.id === id)?.olderEngine === false)
}

async function main(): Promise<void> {
  buildIfStale()
  const { installDir, logPath } = stage()
  const userData = makeUserData()
  note(`staged ${statSync(logPath).size.toLocaleString()} bytes at ${logPath}`)
  const env: Record<string, string> = {}
  if (process.env.EQ_ENGINE_BIN !== undefined) env.EQ_ENGINE_BIN = process.env.EQ_ENGINE_BIN
  const began = Date.now()
  const run = await launchApp({ installDir, userData, env })
  try {
    const page = await mainWindow(run.app)
    const served = await settleEngineServing(run.app, 600_000)
    note(`engine ${served ? 'serving' : 'NOT serving'} after ${((Date.now() - began) / 1000).toFixed(0)} s`)
    await call(page, 'setLogArchiveEnabled', true)
    const backed = await call<{ ok: boolean; message: string; status: { segments: { id: string }[] } }>(page, 'logArchiveBackup')
    check('backup succeeds', backed.ok, backed.message)
    const id = backed.status.segments[0]?.id ?? ''
    report('without tables', await call<RefoldTrialReport>(page, 'logArchiveRefoldTrial', id, false))
    if (TABLES !== undefined) report('with tables', await call<RefoldTrialReport>(page, 'logArchiveRefoldTrial', id, true))
    await refreshCheck(page, userData, id)
  } finally {
    await run.close()
    await removeUserData(userData)
    await removeUserData(installDir)
  }
  reportRun()
}

void main().catch((err: unknown) => {
  console.error(err)
  process.exit(1)
})
