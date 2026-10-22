// main/logArchive/history.ts — ARCHIVED HISTORY ON THE READ PATH (step 1.7).
//
// `serveModuleSnapshot` hands every served module snapshot through `mergeHistory`. With the switch
// off, with no character attached, with no merge rule for the module, or with no eligible segment,
// the served state comes back as the same object: nothing is read and nothing is copied. Only with
// the switch on does the archive folder get opened at all.
//
// DECIDED ONCE PER CHARACTER PER LAUNCH. The segment list and the live log's head are read on the
// first merge for a character and kept. That is what keeps the eligibility rule honest: the engine
// folded the log as it was at attach, so a log cleared by hand mid-session must not make its
// sealed segment eligible while the engine's memory still holds the same lines. The cost is the
// safe one: such history appears from the next launch. `forgetHistoryContext` is the reset for
// the steps that change what is on disk (phase 2).
//
// CACHED PER MODULE AND ENGINE SEQ, so a busy surface re-reading the same snapshot does not
// re-merge it.
//
// `archived` hands out the eligible archived states of one module, unmerged, for a read that is not
// a module snapshot (one mob's drops, step 4.1). The same switch and the same eligibility apply.
//
// KILLS ALSO NEED THE LIVE LOG'S FIRST ZONE LINE (step 3.8, `carryZone.ts`), which only the live
// `progression` states. The caller asks `wantsLiveZone` and hands that snapshot to
// `noteLiveProgression` before the kills merge. Once the line is known it is kept for the context:
// it cannot move, so the snapshot is not asked for again.
//
// COMBO ALSO NEEDS TODAY'S CORRECTIONS (step 4.12, `mergeCombo.ts withCorrections`): the engine
// applies a correction only to its own log, so the archived intervals take it here. A correction
// moves the engine's combo revision, so the cache below is never stale on one. RESPAWN ALSO TAKES
// EACH SEGMENT'S `respawnHistory` (step 4.14, `mergeRespawn.ts withHistoryRows`); a watch edit moves
// the respawn revision the same way.
//
// `archivedFights` is the same for the fight summaries a segment keeps beside its modules (step
// 4.7), already re-named and sorted, and built once per context: the picker polls it.

import { createHash } from 'node:crypto'
import { closeSync, openSync, readSync } from 'node:fs'
import { eligibleSegments, type Held } from '../../shared/logArchive/eligible'
import { carryZoneIntoKills, firstZoneLine } from '../../shared/logArchive/carryZone'
import type { SegmentSummary } from '../../shared/combat'
import { archivedFightRows } from '../../shared/logArchive/mergeFights'
import { hasMergeRule, mergeModule } from '../../shared/logArchive/mergeRules'
import { firstStart, withCorrections } from '../../shared/logArchive/mergeCombo'
import { withHistoryRows } from '../../shared/logArchive/mergeRespawn'
import type { ComboCorrection } from '../../shared/classCombo'
import { HEAD_BYTES, logStampKey, type Segment } from '../../shared/logArchive/segment'
import { listSegments, type SkippedFile } from './segmentStore'

export interface HistoryDeps {
  /** The switch. Asked before anything else, on every read. */
  on: () => boolean
  /** The folder segments live in. */
  dir: () => string
  /** The attached character's id (`characterId`) and live log, or null. */
  attached: () => { character: string; logPath: string } | null
  /** Up to `n` bytes from the start of `path`, or null when it cannot be read. */
  readHead: (path: string, n: number) => Buffer | null
  note: (line: string) => void
  /** The attached character's class-loadout corrections; none when absent. */
  comboCorrections?: () => readonly ComboCorrection[]
}

interface Context {
  key: string
  shown: Segment[]
  held: Held[]
  skipped: SkippedFile[]
  /** The live log's first zone line: `firstZoneLine` of the last live progression noted. */
  firstZone?: number | null
  /** `archivedFights`, built on first ask. */
  fights?: SegmentSummary[]
}

export interface HistoryStatus {
  shown: string[]
  held: Held[]
  skipped: SkippedFile[]
}

function sha256(b: Buffer): string {
  return createHash('sha256').update(b).digest('hex')
}

function firstStamp(head: Buffer): string | null {
  for (const line of head.toString('latin1').split('\n')) {
    const key = logStampKey(line)
    if (key !== null) return key
  }
  return null
}

export interface HistoryMerge {
  mergeHistory: (moduleId: string, seq: number, state: unknown) => unknown
  /** The eligible archived states of `moduleId`, oldest first; empty with the switch off. */
  archived: (moduleId: string) => unknown[]
  /** True when a merge of `moduleId` would read the live progression and has not got its answer. */
  wantsLiveZone: (moduleId: string) => boolean
  noteLiveProgression: (state: unknown) => void
  /** Every eligible segment's fight summaries, newest first; empty with the switch off. */
  archivedFights: () => SegmentSummary[]
  status: () => HistoryStatus | null
  noteSealedThisAttach: (id: string) => void
  forgetHistoryContext: () => void
}

/**
 * A module's archived states as the merge takes them: combo's with today's corrections on, and
 * respawn's with the history rows of the mobs watched today (step 4.14).
 */
function archivedFor(shown: readonly Segment[], moduleId: string, live: unknown, deps: HistoryDeps): unknown[] {
  const kept = shown.filter((s) => Object.hasOwn(s.modules, moduleId))
  if (moduleId === 'respawn') return kept.map((s) => withHistoryRows(s.modules.respawn.state, s.respawnHistory ?? [], live))
  const states = kept.map((s) => s.modules[moduleId].state)
  if (moduleId !== 'combo') return states
  const corrections = deps.comboCorrections?.() ?? []
  // Each archive's open interval ends where the NEXT stretch begins (the next archive, or the live
  // log for the newest), so a correction placed in a later stretch cannot reach back into it.
  const nextStarts = [...states.slice(1).map(firstStart), firstStart(live)]
  return states.map((s, i) => withCorrections(s, corrections, nextStarts[i]))
}

export function createHistoryMerge(deps: HistoryDeps): HistoryMerge {
  let ctx: Context | null = null
  const sealedThisAttach = new Set<string>()
  const cache = new Map<string, { seq: number; state: unknown }>()

  function build(character: string, logPath: string): Context {
    const listing = listSegments(deps.dir(), character)
    const head = deps.readHead(logPath, HEAD_BYTES)
    // AN UNREADABLE LIVE LOG DECIDES NOTHING. Without its head there is no proof the engine's
    // memory does not already hold a segment's lines, so nothing is shown this launch.
    if (head === null) {
      deps.note('log archive: the live log could not be read; archived history is not shown')
      return { key: `${character}|${logPath}`, shown: [], held: [], skipped: listing.skipped }
    }
    const { shown, held } = eligibleSegments({
      segments: listing.segments,
      character,
      live: {
        headSha256: (n) => (head.length < n ? null : sha256(head.subarray(0, n))),
        firstStamp: firstStamp(head)
      },
      sealedThisAttach
    })
    for (const s of listing.skipped) deps.note(`log archive: skipped ${s.file}: ${s.reason}`)
    for (const h of held) deps.note(`log archive: holding back ${h.id}: ${h.reason}`)
    return { key: `${character}|${logPath}`, shown, held, skipped: listing.skipped }
  }

  function context(): Context | null {
    const a = deps.attached()
    if (a === null) return null
    const key = `${a.character}|${a.logPath}`
    if (ctx?.key !== key) {
      ctx = build(a.character, a.logPath)
      cache.clear()
    }
    return ctx
  }

  function statesOf(c: Context, moduleId: string): unknown[] {
    return c.shown.flatMap((s) => (Object.hasOwn(s.modules, moduleId) ? [s.modules[moduleId].state] : []))
  }

  function archived(moduleId: string): unknown[] {
    if (!deps.on()) return []
    const c = context()
    return c === null ? [] : statesOf(c, moduleId)
  }

  function archivedFights(): SegmentSummary[] {
    if (!deps.on()) return []
    const c = context()
    if (c === null) return []
    c.fights ??= archivedFightRows(c.shown)
    return c.fights
  }

  function shownContext(): Context | null {
    if (!deps.on()) return null
    const c = context()
    return c === null || c.shown.length === 0 ? null : c
  }

  function wantsLiveZone(moduleId: string): boolean {
    return moduleId === 'kills' && typeof shownContext()?.firstZone !== 'number'
  }

  function noteLiveProgression(state: unknown): void {
    const c = shownContext()
    if (c === null) return
    const first = firstZoneLine(state)
    if (first === c.firstZone) return
    c.firstZone = first
    cache.delete('kills')
  }

  function mergeKills(c: Context, state: unknown): unknown {
    const stateOf = (s: Segment, id: string): unknown => (Object.hasOwn(s.modules, id) ? s.modules[id].state : undefined)
    const stretches = c.shown.map((s) => ({ kills: stateOf(s, 'kills'), progression: stateOf(s, 'progression') }))
    const carried = carryZoneIntoKills(stretches, { kills: state, firstZone: c.firstZone })
    return mergeModule('kills', carried.archived.filter((k) => k !== undefined), carried.live).state
  }

  function mergeHistory(moduleId: string, seq: number, state: unknown): unknown {
    if (!hasMergeRule(moduleId)) return state
    const c = shownContext()
    if (c === null) return state
    const hit = cache.get(moduleId)
    if (hit?.seq === seq) return hit.state
    const merged = moduleId === 'kills' ? mergeKills(c, state) : mergeModule(moduleId, archivedFor(c.shown, moduleId, state, deps), state).state
    cache.set(moduleId, { seq, state: merged })
    return merged
  }

  return {
    mergeHistory,
    archived,
    wantsLiveZone,
    noteLiveProgression,
    archivedFights,
    status: () => (ctx === null ? null : { shown: ctx.shown.map((s) => s.id), held: ctx.held, skipped: ctx.skipped }),
    noteSealedThisAttach: (id) => {
      sealedThisAttach.add(id)
      ctx = null
      cache.clear()
    },
    forgetHistoryContext: () => {
      ctx = null
      cache.clear()
    }
  }
}

/** Up to `n` bytes from the start of a file, read without holding it. Null when unreadable. */
export function readHeadBytes(path: string, n: number): Buffer | null {
  let fd: number | null = null
  try {
    fd = openSync(path, 'r')
    const buf = Buffer.alloc(n)
    const got = readSync(fd, buf, 0, n, 0)
    return buf.subarray(0, got)
  } catch {
    return null
  } finally {
    if (fd !== null) closeSync(fd)
  }
}
