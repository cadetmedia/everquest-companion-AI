// verify-gaps.mts — the Gaps tab's test checklist, run automatically against the player's real log
// (fork tool; owner, 2026-10-19: "shouldn't you be able to automatically test all this for me?").
//
//   node --import tsx scripts/community/verify-gaps.mts [logPath] [--reuse]
//
// HOW. Each character log in the log's folder is folded headlessly through the real engine
// (verifyGapsFold.mts: the knowledge crate's ignored `verify_fold` test, constructed as engined
// constructs an attach, with the committed corpora installed). The tab's data is then derived from
// those states with the very src/shared functions the tab calls (verifyGapsView.mts mirrors
// useGapsData.ts and GapsView.tsx), and each checklist item looks for a real case and prints PASS or
// FAIL with its evidence, SKIP with the reason when the log has no case, CODE-CHECKED for the one
// item only the UI can show (verifyGapsChecks.mts, verifyGapsAll.mts).
//
// WHAT IT IS NOT. No app, engine process or port: nothing here can touch a running app. The log is
// only read; the folds are written to the system temp folder (`--reuse` reads them back when newer
// than the log). The fold uses this checkout's committed data and none of the app's runtime wiki
// lookups, so its row counts can differ from a running app built from another branch.
//
// logPath defaults to the dev app's attached log (`activeLogPath` in its progress file). Exit code 1
// when any item FAILs.

import { existsSync, readFileSync, readdirSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { foldLog, type FoldOut } from './verifyGapsFold.mjs'
import { tabView } from './verifyGapsView.mjs'
import { tabChecks, type Check, type Outcome } from './verifyGapsChecks.mjs'
import { allCharactersCheck, heldCheck } from './verifyGapsAll.mjs'

/** The dev app's attached log, from its progress file (read only). */
function defaultLog(): string | null {
  const file = join(process.env.APPDATA ?? '', 'everquest-companion-dev', 'everquest-companion-progress.json')
  if (!existsSync(file)) return null
  const p = JSON.parse(readFileSync(file, 'utf8')) as { activeLogPath?: string }
  return p.activeLogPath ?? null
}

/** Every other `eqlog_<Name>_<server>.txt` beside the attached one. */
function otherLogs(logPath: string): string[] {
  const dir = dirname(logPath)
  const mine = logPath.slice(dir.length + 1).toLowerCase()
  return readdirSync(dir)
    .filter((f) => /^eqlog_.+_[^_]+\.txt$/i.test(f) && f.toLowerCase() !== mine)
    .map((f) => join(dir, f))
}

function timed(label: string, logPath: string, reuse: boolean): FoldOut {
  const started = Date.now()
  const fold = foldLog(logPath, reuse)
  const { character, events, foldMs } = fold.meta
  console.log(`folded ${label} ${character}: ${events.toLocaleString()} events (fold ${String(foldMs)} ms, ${String(Date.now() - started)} ms with the build check)`)
  return fold
}

async function runOne(c: Check): Promise<Outcome> {
  try {
    return await c.run()
  } catch (err) {
    return { status: 'FAIL', evidence: [`threw: ${(err as Error).stack ?? String(err)}`] }
  }
}

async function main(): Promise<number> {
  const args = process.argv.slice(2)
  const reuse = args.includes('--reuse')
  const logPath = args.find((a) => !a.startsWith('--')) ?? defaultLog()
  if (logPath === null || !existsSync(logPath)) {
    console.error('verify-gaps: name a log (eqlog_<Name>_<server>.txt); no dev-app attached log was found')
    return 2
  }
  const eqRoot = dirname(dirname(logPath))
  const live = timed('attached', logPath, reuse)
  const others = otherLogs(logPath).map((p) => timed('other', p, reuse))
  const view = tabView(live, eqRoot)
  const checks: Check[] = [
    ...tabChecks(view),
    { id: 10, title: 'Held now: Items rows the inventory export plus loot says you hold', run: () => heldCheck(view, eqRoot) },
    { id: 17, title: 'All characters: seenBy names both; the day window cuts', run: () => allCharactersCheck(live, others) }
  ].sort((a, b) => a.id - b.id)
  const counts = new Map<string, number>()
  for (const c of checks) {
    const o = await runOne(c)
    counts.set(o.status, (counts.get(o.status) ?? 0) + 1)
    console.log(`\n${o.status.padEnd(12)} ${String(c.id).padStart(2)}. ${c.title}`)
    for (const line of o.evidence) console.log(`             ${line}`)
  }
  console.log(`\n${[...counts].map(([s, n]) => `${s} ${String(n)}`).join(', ')}`)
  return (counts.get('FAIL') ?? 0) > 0 ? 1 : 0
}

process.exitCode = await main()
