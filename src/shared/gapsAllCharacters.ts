// shared/gapsAllCharacters.ts — THE GAPS TAB ACROSS EVERY CHARACTER (owner, 2026-10-19;
// docs/community/plans/2026-10-19-gaps-all-characters.md).
//
// DATA IS JOINED, LOGS NEVER ARE (owner ruling: "it should not create a combined set of log files, it
// should just aggregate the data together INTO a single source of gaps in the tab"). Each character
// keeps its own log, its own archive segments and its own saved Gaps inputs; only the tab's view is
// a join, made here from those per-character states with the archive's own merge rules.
//
// ONE CHARACTER'S STATE is its saved snapshot (the engine's `gaps`, `loot` and `kills` from its log as
// it stood when saved) plus its sealed archive segments, chosen by the archive's eligibility rule
// against THE SAVED LOG, not the file on disk today: the snapshot is what it holds, so a segment that
// the saved log contains is left out exactly as it is for the attached character. A character with
// archives and no snapshot yet is its archives alone.
//
// HOW FAR BACK is a player setting in days (owner: default 60): an archive that ended before the
// cut-off is left out whole, and a row, loot line or kill last seen before it is dropped. A row's
// count still holds what one stretch saw before the cut-off; the stretch is the unit the log keeps.

import { eligibleSegments } from './logArchive/eligible'
import { mergeGaps } from './logArchive/mergeGaps'
import { mergeKills } from './logArchive/mergeKills'
import { mergeLoot } from './logArchive/mergeLoot'
import { mergeModule } from './logArchive/mergeRules'
import type { Segment } from './logArchive/segment'
import type { GapDomain, GapRow, GapsSnap } from './gaps'
import type { KillMap, KillsSnap } from './kills'
import type { OwnershipPayload } from './planner/ownership'
import type { LootSnap } from './types'

/** The engine modules one character's Gaps are built from (useGapsData). */
export const GAP_SOURCE_MODULES = ['gaps', 'loot', 'kills'] as const
export type GapSourceModule = (typeof GAP_SOURCE_MODULES)[number]

/** How far back the joined view reads unless the player picks otherwise (owner, 2026-10-19). */
export const DEFAULT_GAP_DAYS = 60
export const MAX_GAP_DAYS = 3650

/** A saved snapshot older than this many months is flagged (owner, 2026-10-19: "2 months"). */
export const STALE_MONTHS = 2

/** The saved log's identity, as `eligible.ts` reads a live log. */
export interface SavedLog {
  /** How many bytes `headSha256` covers: 64 KiB, or the whole log when it was shorter. */
  headBytes: number
  headSha256: string
  /** The first line's stamp key, `2026-10-19 17:54:48`; null when no line was stamped. */
  firstStamp: string | null
}

export const SAVED_GAPS_VERSION = 1

/**
 * What a saved file's `gaps` rows hold, raised when the engine starts serving a kind of row an
 * older build's save never had. 2: a known item's forages, the proof its page's forage zones are
 * checked against (gaps-item-facts, 2026-10-21). A file without it was saved by an older build:
 * the rows cannot be rebuilt from the file (forage lines are not in the loot), so the tab says to
 * log that character in once, which saves it again.
 */
export const SAVED_ROWS = 2

/** One character's saved Gaps inputs, one file per character. */
export interface SavedGaps {
  v: number
  /** `name_server`, lower-cased (log/config.ts `characterId`). */
  character: string
  name: string
  server: string
  /** When it was saved, ISO. */
  savedAt: string
  log: SavedLog
  modules: Record<GapSourceModule, { seq: number; state: unknown }>
  /** SAVED_ROWS when it was saved; absent on a file from before it. */
  rows?: number
}

/** One other character's Gaps inputs, its archives joined in, as main serves them to the tab. */
export interface CharacterGaps {
  character: string
  name: string
  server: string
  /** When its snapshot was saved; null for a character known only by its archives. */
  savedAt: string | null
  /** How many archive segments went in. */
  archives: number
  gaps: unknown
  loot: unknown
  kills: unknown
  /** Its OWN latest inventory export (`Name_server-Inventory.txt`), for "held by"; null when it has none. */
  inventory?: OwnershipPayload | null
  /** Saved by an older build whose rows lack a kind this one serves (SAVED_ROWS). */
  olderRows?: true
}

/** A saved file as read back, or null when it is not one this build understands. */
export function parseSavedGaps(raw: unknown): SavedGaps | null {
  if (raw === null || typeof raw !== 'object') return null
  const s = raw as Partial<SavedGaps>
  if (s.v !== SAVED_GAPS_VERSION || typeof s.character !== 'string' || typeof s.savedAt !== 'string') return null
  if (s.log === undefined || typeof s.log.headSha256 !== 'string' || typeof s.log.headBytes !== 'number') return null
  if (s.modules === undefined || GAP_SOURCE_MODULES.some((m) => s.modules?.[m] === undefined)) return null
  return s as SavedGaps
}

/** `drywrought_oggok` -> Drywrought on oggok: the archive-only character's name, from its id. */
export function nameFromId(id: string): { name: string; server: string } {
  const cut = id.indexOf('_')
  const name = cut < 0 ? id : id.slice(0, cut)
  return { name: name.charAt(0).toUpperCase() + name.slice(1), server: cut < 0 ? '' : id.slice(cut + 1) }
}

/** The character's sealed segments that its saved log does not already hold, and that end on or after the cut-off. */
function shownSegments(segments: readonly Segment[], character: string, saved: SavedGaps | null, sinceStamp: string | null): Segment[] {
  const live = saved === null
    ? { headSha256: () => null, firstStamp: null }
    : { headSha256: (n: number) => (n === saved.log.headBytes ? saved.log.headSha256 : null), firstStamp: saved.log.firstStamp }
  const { shown } = eligibleSegments({ segments, character, live, sealedThisAttach: new Set() })
  return sinceStamp === null ? shown : shown.filter((s) => s.log.lastStamp >= sinceStamp)
}

/** One module over the shown segments (oldest first) and the saved state on top. */
function foldModule(id: GapSourceModule, shown: readonly Segment[], saved: SavedGaps | null): unknown {
  const states = shown.filter((s) => Object.prototype.hasOwnProperty.call(s.modules, id)).map((s) => s.modules[id].state)
  if (saved !== null) return mergeModule(id, states, saved.modules[id].state).state
  if (states.length === 0) return null
  return mergeModule(id, states.slice(0, -1), states[states.length - 1]).state
}

/** One character's Gaps inputs: the saved snapshot with its eligible archives, or null when it has neither. */
export function characterGaps(character: string, saved: SavedGaps | null, segments: readonly Segment[], sinceStamp: string | null): CharacterGaps | null {
  const shown = shownSegments(segments, character, saved, sinceStamp)
  if (saved === null && shown.length === 0) return null
  const who = saved === null ? nameFromId(character) : { name: saved.name, server: saved.server }
  return {
    character,
    ...who,
    savedAt: saved?.savedAt ?? null,
    ...(saved !== null && (saved.rows ?? 1) < SAVED_ROWS ? { olderRows: true as const } : {}),
    archives: shown.length,
    gaps: foldModule('gaps', shown, saved),
    loot: foldModule('loot', shown, saved),
    kills: foldModule('kills', shown, saved)
  }
}

/** Every character the saved files or the archive know, other than `except` (the attached one). */
export function otherCharacters(saved: readonly SavedGaps[], segments: readonly Segment[], except: string | null): string[] {
  const ids = new Set<string>([...saved.map((s) => s.character), ...segments.map((s) => s.character)])
  if (except !== null) ids.delete(except)
  return [...ids].sort()
}

// ---- the cut-off -------------------------------------------------------------------------------

const pad = (n: number): string => String(n).padStart(2, '0')

/** The log's stamp key for a local time, `2026-10-19 17:54:48` (the log writes local wall clock). */
export function stampKeyOf(d: Date): string {
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}`
}

/** The cut-off `days` before `now`, as a stamp key and as epoch ms. */
export function cutoffOf(days: number, now: Date): { stamp: string; ms: number } {
  const d = new Date(now.getTime())
  d.setDate(d.getDate() - days)
  return { stamp: stampKeyOf(d), ms: d.getTime() }
}

/** Whether a snapshot saved at `savedAt` is older than STALE_MONTHS before `now`. */
export function isStale(savedAt: string, now: Date): boolean {
  const d = new Date(savedAt)
  if (Number.isNaN(d.getTime())) return false
  d.setMonth(d.getMonth() + STALE_MONTHS)
  return d.getTime() < now.getTime()
}

function asGaps(x: unknown): GapsSnap | null {
  return x !== null && typeof x === 'object' && Array.isArray((x as GapsSnap).rows) ? (x as GapsSnap) : null
}

/** The rows last seen on or after the cut-off; each domain's total recounted when a row was dropped. */
export function gapsSince(snap: GapsSnap, stamp: string): GapsSnap {
  const rows = snap.rows.filter((r) => r.last === '' || r.last >= stamp)
  if (rows.length === snap.rows.length) return snap
  const totals = { ...snap.totals }
  const dropped = new Map<GapDomain, number>()
  for (const r of snap.rows) if (!(r.last === '' || r.last >= stamp)) dropped.set(r.domain, (dropped.get(r.domain) ?? 0) + 1)
  for (const [d, n] of dropped) totals[d] = Math.max(0, (totals[d] ?? 0) - n)
  return { ...snap, rows, totals }
}

export function lootSince(loot: LootSnap, ms: number): LootSnap {
  return loot.filter((e) => e.ts >= ms)
}

export function killsSince(kills: KillsSnap, ms: number): KillsSnap {
  const mobs: KillMap = {}
  for (const [k, info] of Object.entries(kills.mobs)) if (info.lastTs >= ms) mobs[k] = info
  return { ...kills, mobs }
}

/** The attached character's inputs as the derivation reads them. */
export interface OwnGaps {
  gaps: GapsSnap
  loot: LootSnap
  kills: KillsSnap | null
}

/**
 * The one-character view cut to the window (owner, 2026-10-21: "days back should be for any
 * character yes"), the same cut the join makes per character: rows last seen before it, and loot
 * and kills before it, are left out. The attached character's archive history is already folded
 * into its modules, so a segment that ended before the cut drops out through its rows, loot and
 * kills, all older than the cut; a row also seen since keeps its whole count, as in the join.
 */
export function ownSince(own: OwnGaps, cut: { stamp: string; ms: number }): OwnGaps {
  return { gaps: gapsSince(own.gaps, cut.stamp), loot: lootSince(own.loot, cut.ms), kills: own.kills === null ? null : killsSince(own.kills, cut.ms) }
}

// ---- the join ----------------------------------------------------------------------------------

/** One character's inputs, as the tab joins them. */
export interface CharacterInputs {
  /** The name the details print ("Seen by"). */
  label: string
  gaps: unknown
  loot: unknown
  kills: unknown
}

/** Every character's inputs joined, and who saw each row. */
export interface JoinedGaps {
  gaps: GapsSnap | null
  loot: LootSnap
  kills: KillsSnap | null
  /** `domain|name` lower-cased -> the characters whose rows it joined, in input order. */
  seenBy: ReadonlyMap<string, readonly string[]>
}

export const seenByKey = (r: Pick<GapRow, 'domain' | 'name'>): string => `${r.domain}|${r.name.toLowerCase()}`

/** Each row of one character's cut snapshot noted as seen by it. */
function noteSeen(seenBy: Map<string, string[]>, rows: readonly GapRow[], label: string): void {
  for (const r of rows) {
    const k = seenByKey(r)
    const had = seenBy.get(k)
    if (had === undefined) seenBy.set(k, [label])
    else if (!had.includes(label)) had.push(label)
  }
}

function asKills(x: unknown): KillsSnap | null {
  return x !== null && typeof x === 'object' && typeof (x as KillsSnap).mobs === 'object' ? (x as KillsSnap) : null
}

/** One module's join step: the cut state on top of what came before, or what came before when the rule refuses. */
function joinStep<T>(acc: T | null, next: T | null, rule: (a: unknown, b: unknown) => unknown): T | null {
  if (next === null) return acc
  if (acc === null) return next
  return (rule(acc, next) as T | null) ?? acc
}

/**
 * The characters joined one after another with the archive's merge rules, each cut to the window
 * first. A character whose state the rule will not join (a kills shape from another build) adds
 * nothing to that module and is not counted twice. Loot is put back in time order.
 */
export function joinCharacters(inputs: readonly CharacterInputs[], cut: { stamp: string; ms: number } | null): JoinedGaps {
  let gaps: GapsSnap | null = null
  let loot: LootSnap = []
  let kills: KillsSnap | null = null
  const seenBy = new Map<string, string[]>()
  for (const c of inputs) {
    const g = asGaps(c.gaps)
    const cutG = g === null || cut === null ? g : gapsSince(g, cut.stamp)
    if (cutG !== null) noteSeen(seenBy, cutG.rows, c.label)
    gaps = joinStep(gaps, cutG, mergeGaps)
    const l = Array.isArray(c.loot) ? (c.loot as LootSnap) : null
    loot = joinStep(loot, l === null || cut === null ? l : lootSince(l, cut.ms), mergeLoot) ?? loot
    const k = asKills(c.kills)
    kills = joinStep(kills, k === null || cut === null ? k : killsSince(k, cut.ms), mergeKills)
  }
  return { gaps, loot: inputs.length > 1 ? [...loot].sort((x, y) => x.ts - y.ts) : loot, kills, seenBy }
}

/**
 * Another character's inputs for the join. Its saved mob rows are checked again against today's
 * catalog (a page added since it was saved closes the gap); item and spell known-ness is the engine's
 * call and waits for that character's next attach. Its label names it, with its server when two
 * characters share a name.
 */
export function otherInputs(others: readonly CharacterGaps[], isMob: (name: string) => boolean): CharacterInputs[] {
  const names = others.map((o) => o.name)
  return others.map((o) => {
    const g = asGaps(o.gaps)
    const gaps = g === null ? null : { ...g, rows: g.rows.filter((r) => !(r.domain === 'mob' && isMob(r.name))) }
    const label = names.filter((n) => n === o.name).length > 1 ? `${o.name} (${o.server})` : o.name
    return { label, gaps, loot: o.loot, kills: o.kills }
  })
}
