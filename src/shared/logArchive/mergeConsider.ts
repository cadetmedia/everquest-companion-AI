// shared/logArchive/mergeConsider.ts — the `consider` module across an archive and the live log
// (step 4.1).
//
// The ring of recently considered mobs: one row per mob, newest last, capped at `CONSIDER_CAP`.
// The fold (engine `consider.rs`) moves a re-conned mob to the end, adds to its `cons` and keeps
// the newest con's facts, so a mob conned on both sides takes the newer row with the two counts
// added. Its display name is chosen the way the fold chooses it, and choosing between the two
// sides' results gives the same answer as the fold walking every con in turn. Rows only the
// archive has keep their place before the live ones: every one of them is older.
//
// The own-loot index the same module folds is published in no snapshot; its read is joined in
// `mergeDropsSeen.ts`.

import type { ConsiderRow, ConsiderSnap } from '../types'

/** `consider.rs CONSIDER_CAP`: how many considered mobs the ring keeps. Oldest fall off the front. */
export const CONSIDER_CAP = 50

function isRow(x: unknown): x is ConsiderRow {
  if (x === null || typeof x !== 'object') return false
  const r = x as { id?: unknown; mob?: unknown; cons?: unknown }
  return typeof r.id === 'string' && typeof r.mob === 'string' && typeof r.cons === 'number'
}

function isConsiderSnap(x: unknown): x is ConsiderSnap {
  return Array.isArray(x) && x.every(isRow)
}

/**
 * `consider.rs adopt_display`. A lowercase-initial spelling is the mob's true name; a capital is the
 * con line sentence-casing the article. So a lowercase spelling wins, otherwise the later one.
 */
function adoptDisplay(current: string, incoming: string): string {
  const lowerInitial = (s: string): boolean => /^[a-z]/.test(s)
  return lowerInitial(incoming) || !lowerInitial(current) ? incoming : current
}

/** `older` then `newer`, or null when either is not a consider ring. */
export function mergeConsider(older: unknown, newer: unknown): ConsiderSnap | null {
  if (!isConsiderSnap(older) || !isConsiderSnap(newer)) return null
  const olderById = new Map(older.map((r) => [r.id, r]))
  const newerIds = new Set(newer.map((r) => r.id))
  const ring: ConsiderSnap = older.filter((r) => !newerIds.has(r.id)).map((r) => ({ ...r }))
  for (const row of newer) {
    const prev = olderById.get(row.id)
    if (prev === undefined) {
      ring.push({ ...row })
      continue
    }
    const merged: ConsiderRow = { ...row, mob: adoptDisplay(prev.mob, row.mob), cons: prev.cons + row.cons }
    // Enrichment is per mob: a re-con keeps what was already learned.
    if (merged.knowledge === undefined && prev.knowledge !== undefined) merged.knowledge = prev.knowledge
    ring.push(merged)
  }
  return ring.slice(Math.max(0, ring.length - CONSIDER_CAP))
}
