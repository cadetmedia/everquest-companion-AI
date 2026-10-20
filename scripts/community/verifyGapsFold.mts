// verifyGapsFold.mts — one character's log folded through the real engine, headless, for
// verify-gaps.mts. The engine's own Rust fold runs as the ignored test
// `engine/crates/knowledge/tests/verify_fold.rs`, built and constructed as engined builds an attach
// (the log's character and clock, the combat engine, the committed corpora installed); it writes the
// `gaps`, `loot`, `kills` and `consider` states as one JSON file, which this reads back.
//
// No engine process is spawned, no port is opened, no app is touched, and the log is only read. The
// build reuses the main clone's warm `engine/target` (CARGO_TARGET_DIR wins when set); it builds the
// knowledge crate's test only, never `engined.exe`, so the dev app's engine is not rebuilt under it.

import { execFileSync } from 'node:child_process'
import { createHash } from 'node:crypto'
import { closeSync, existsSync, mkdirSync, openSync, readFileSync, readSync, statSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { basename, dirname, join } from 'node:path'
import type { GapsSnap } from '../../src/shared/gaps'
import type { KillsSnap } from '../../src/shared/kills'
import type { ConsiderSnap, LootSnap } from '../../src/shared/types'
import type { SavedGaps, SavedLog } from '../../src/shared/gapsAllCharacters'
import { HEAD_BYTES, logStampKey } from '../../src/shared/logArchive/segment'
import { ENGINE_DIR, ROOT, cargoBinary } from '../build-engine.mjs'

/** What the fold wrote: the states the Gaps tab reads, and how the fold went. */
export interface FoldOut {
  logPath: string
  meta: { character: string; server: string; events: number; foldMs: number; lastEventTs: number; bytes: number }
  gaps: GapsSnap
  loot: LootSnap
  kills: KillsSnap
  consider: ConsiderSnap
}

/** The repo this script sits in. */
export const REPO_ROOT = ROOT

/** The main clone's `engine/target` (a worktree's own is cold), unless CARGO_TARGET_DIR says otherwise. */
function cargoTargetDir(): string {
  const set = process.env.CARGO_TARGET_DIR
  if (set !== undefined && set !== '') return set
  try {
    const common = execFileSync('git', ['-C', REPO_ROOT, 'rev-parse', '--path-format=absolute', '--git-common-dir'], { encoding: 'utf8' }).trim()
    return join(dirname(common), 'engine', 'target')
  } catch {
    return join(REPO_ROOT, 'engine', 'target')
  }
}

/** Where a log's fold is written: the system temp folder, never the repo (it is the player's log). */
function outFile(logPath: string): string {
  const dir = join(tmpdir(), 'eqc-verify-gaps')
  mkdirSync(dir, { recursive: true })
  return join(dir, `${basename(logPath, '.txt')}.fold.json`)
}

/**
 * Fold one log and read its states back. With `reuse`, a fold written after the log last changed is
 * read as it stands instead of folding again.
 */
export function foldLog(logPath: string, reuse = false): FoldOut {
  const out = outFile(logPath)
  const fresh = existsSync(out) && statSync(out).mtimeMs > statSync(logPath).mtimeMs
  if (!(reuse && fresh)) {
    execFileSync(cargoBinary(), ['test', '--release', '-q', '-p', 'knowledge', '--test', 'verify_fold', '--', '--ignored'], {
      cwd: ENGINE_DIR,
      env: { ...process.env, CARGO_TARGET_DIR: cargoTargetDir(), VERIFY_LOG: logPath, VERIFY_OUT: out },
      stdio: ['ignore', 'ignore', 'inherit']
    })
  }
  const raw = JSON.parse(readFileSync(out, 'utf8')) as { meta: FoldOut['meta']; modules: Record<string, unknown> }
  return {
    logPath,
    meta: raw.meta,
    gaps: raw.modules.gaps as GapsSnap,
    loot: (raw.modules.loot ?? []) as LootSnap,
    kills: (raw.modules.kills ?? { mobs: {} }) as KillsSnap,
    consider: (raw.modules.consider ?? []) as ConsiderSnap
  }
}

/** The log's identity as main's `logIdentity` (gapsCharacters.ts) records it beside a save. */
function logIdentity(path: string): SavedLog {
  const fd = openSync(path, 'r')
  const buf = Buffer.alloc(HEAD_BYTES)
  const head = buf.subarray(0, readSync(fd, buf, 0, HEAD_BYTES, 0))
  closeSync(fd)
  let firstStamp: string | null = null
  for (const line of head.toString('latin1').split('\n')) {
    firstStamp = logStampKey(line)
    if (firstStamp !== null) break
  }
  return { headBytes: head.length, headSha256: createHash('sha256').update(head).digest('hex'), firstStamp }
}

/** The file main's `saveAttachedGaps` would write for this character, built from its fold. */
export function savedGapsOf(fold: FoldOut): SavedGaps {
  const { character, server } = fold.meta
  const state = (s: unknown): { seq: number; state: unknown } => ({ seq: 1, state: s })
  return {
    v: 1,
    character: `${character}_${server}`.toLowerCase(),
    name: character,
    server,
    savedAt: new Date().toISOString(),
    log: logIdentity(fold.logPath),
    modules: { gaps: state(fold.gaps), loot: state(fold.loot), kills: state(fold.kills) }
  }
}
