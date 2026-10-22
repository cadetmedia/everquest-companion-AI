// shared/logArchive/refoldCompare.ts — DOES A REFOLD GIVE THE TOTALS A SEGMENT STORED (step 5.4).
//
// Module by module: the same, different (with the first place they part and how many values
// differ), or present on one side only. Object keys are compared as sets, so two maps holding the
// same entries in another order are the same. Arrays are compared in order, because every array a
// module publishes is ordered (loot rows by time, levels by time).
//
// ZERO-IMPORT apart from types: the main side and the node tests both read it.

import type { SegmentModule } from './segment'

export interface ModuleVerdict {
  module: string
  same: boolean
  /** Where the two first differ and how many leaf values differ, or which side lacks it. */
  detail: string
}

/**
 * Values that differ between any two folds of one log in two places, so they are not counted: the
 * character module names the file it read, and a refold reads a staged copy. Keyed `module:path`.
 */
export const IDENTITY_PATHS: readonly string[] = ['character:character.logPath']

function isObject(x: unknown): x is Record<string, unknown> {
  return x !== null && typeof x === 'object' && !Array.isArray(x)
}

interface Diff {
  first: string | null
  count: number
  /** Paths not compared, `IDENTITY_PATHS` for this module. */
  skip: ReadonlySet<string>
}

function note(d: Diff, path: string): void {
  d.count++
  d.first ??= path === '' ? '(the whole state)' : path
}

function walkArrays(a: unknown[], b: unknown[], path: string, d: Diff): void {
  if (a.length !== b.length) note(d, `${path}.length (${String(a.length)} vs ${String(b.length)})`)
  for (let i = 0; i < Math.min(a.length, b.length); i++) walk(a[i], b[i], `${path}[${String(i)}]`, d)
}

function walkObjects(a: Record<string, unknown>, b: Record<string, unknown>, path: string, d: Diff): void {
  for (const k of new Set([...Object.keys(a), ...Object.keys(b)])) {
    const p = path === '' ? k : `${path}.${k}`
    if (d.skip.has(p)) continue
    if (!(k in a) || !(k in b)) note(d, `${p} (only in the ${k in a ? 'stored' : 'refolded'} state)`)
    else walk(a[k], b[k], p, d)
  }
}

function walk(a: unknown, b: unknown, path: string, d: Diff): void {
  if (Array.isArray(a) && Array.isArray(b)) walkArrays(a, b, path, d)
  else if (isObject(a) && isObject(b)) walkObjects(a, b, path, d)
  else if (a !== b) note(d, path)
}

/** Compare one module's two states; null when they are the same. */
export function stateDifference(module: string, stored: unknown, refolded: unknown): Diff | null {
  const skip = new Set(IDENTITY_PATHS.filter((p) => p.startsWith(`${module}:`)).map((p) => p.slice(module.length + 1)))
  const d: Diff = { first: null, count: 0, skip }
  walk(stored, refolded, '', d)
  return d.count === 0 ? null : d
}

/** `refolded` with the stored value put back at every `IDENTITY_PATHS` entry. Neither input is
 *  changed. */
export function keepIdentity(
  stored: Record<string, SegmentModule>,
  refolded: Record<string, SegmentModule>
): Record<string, SegmentModule> {
  const out = structuredClone(refolded)
  for (const entry of IDENTITY_PATHS) {
    const [module, path] = entry.split(':')
    const keys = path.split('.')
    let from: unknown = stored[module]?.state
    let to: unknown = out[module]?.state
    for (const k of keys.slice(0, -1)) {
      from = isObject(from) ? from[k] : undefined
      to = isObject(to) ? to[k] : undefined
    }
    const last = keys[keys.length - 1]
    if (isObject(from) && isObject(to) && last in from) to[last] = from[last]
  }
  return out
}

/** Every module either side holds, in the stored side's order, then the refold's extras. */
export function compareModules(
  stored: Record<string, SegmentModule>,
  refolded: Record<string, SegmentModule>
): ModuleVerdict[] {
  const out: ModuleVerdict[] = []
  for (const module of new Set([...Object.keys(stored), ...Object.keys(refolded)])) {
    const a = stored[module]
    const b = refolded[module]
    if (a === undefined || b === undefined) {
      out.push({ module, same: false, detail: `only in the ${a === undefined ? 'refold' : 'segment'}` })
      continue
    }
    const d = stateDifference(module, a.state, b.state)
    out.push(
      d === null
        ? { module, same: true, detail: 'same' }
        : { module, same: false, detail: `${String(d.count)} value(s) differ, first at ${d.first ?? ''}` }
    )
  }
  return out
}

/** What the developer's refold trial answers (step 5.4). */
export interface RefoldTrialReport {
  ok: boolean
  /** The outcome, or why it did not run, in plain words. */
  message: string
  /** Which build produced the stored totals, and which build refolded them. */
  capturedBy: { app: string; engine: string } | null
  running: string
  bytes: number
  stageMs: number
  foldMs: number
  events: number
  /** How many client tables were copied beside the staged log. */
  tables: number
  verdicts: ModuleVerdict[]
}
