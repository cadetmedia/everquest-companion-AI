// shared/logArchive/mergeCombo.ts — the class-loadout history (`combo`) across an archive and the
// live log (step 4.12).
//
// The module publishes a list of intervals in time order, each a span the loadout is believed not
// to have changed in, and `current`, which is the last one. An archive's list ends in an open
// interval: the log stopped, not the loadout.
//
// AT THE CUT the archive's open interval meets the live log's first. When both name the same
// loadout outright (every slot resolved, the same classes, the same arity) and no level went
// backwards, they are one span read as one log, and they are joined: the start is the archive's,
// the slots and the end are the live log's, and the evidence adds. Otherwise the archived interval
// is closed where the live one begins, and the swap is placed between the archive's last evidence
// and the live log's first. A level that went down closes it too: inside one loadout the level
// only rises (`ComboInterval.levelRegressed`), which is why the engine cuts there itself.
//
// IDS ARE RENUMBERED, `ci1` upward over the whole list. The engine numbers each log from `ci1`, and
// its ids are documented as unstable across a recompute, so nothing holds one.
//
// CORRECTIONS. A correction is a time range, and the engine applies it only to its own log's
// intervals: one placed over archived time is accepted and changes nothing there. So the read path
// applies the stored corrections to the archived intervals itself (`withCorrections`), by the
// engine's own rule (`combo/intervals.rs correction_for_slice`, restated below): a correction
// covering the start wins, else the one overlapping most, ties to the latest. A span the game named
// with `/who` keeps its classes and is marked overruled, as the engine marks it. One thing cannot
// be undone: an archived interval locked by a correction that was later cleared keeps that loadout,
// because the archive kept the result, not the evidence beneath it.

import type { ClassAbbr, ComboCorrection, ComboInterval, ComboSlot, ComboSnap } from '../classCombo'

function isComboSnap(x: unknown): x is ComboSnap {
  if (x === null || typeof x !== 'object') return false
  const s = x as Record<string, unknown>
  return Array.isArray(s.intervals) && typeof s.ready === 'boolean' && (s.current === null || typeof s.current === 'object')
}

/** The loadout an interval states outright, or null while any slot is still open. */
function statedClasses(i: ComboInterval): string | null {
  if (!i.slots.every((s) => s.candidates.length === 1)) return null
  return i.slots.map((s) => s.candidates[0]).sort().join('/')
}

function oneLoadout(a: ComboInterval, b: ComboInterval): boolean {
  const classes = statedClasses(a)
  if (classes === null || classes !== statedClasses(b) || a.expectedSlots !== b.expectedSlots) return false
  return a.levelHi === null || b.levelLo === null || b.levelLo >= a.levelHi
}

function nullableMin(a: number | null, b: number | null): number | null {
  return a === null ? b : b === null ? a : Math.min(a, b)
}

function nullableMax(a: number | null, b: number | null): number | null {
  return a === null ? b : b === null ? a : Math.max(a, b)
}

/** The archive's open interval and the live log's first, read as one span. */
function joined(a: ComboInterval, b: ComboInterval): ComboInterval {
  const out: ComboInterval = {
    ...b,
    startTs: a.startTs,
    startLo: a.startLo,
    startHi: a.startHi,
    startReason: a.startReason,
    levelLo: nullableMin(a.levelLo, b.levelLo),
    levelHi: nullableMax(a.levelHi, b.levelHi),
    evidenceCount: a.evidenceCount + b.evidenceCount
  }
  delete out.startAlso
  if (a.startAlso !== undefined) out.startAlso = a.startAlso
  return out
}

/** The archive's open interval, closed where the live log's first begins. */
function closedAt(a: ComboInterval, b: ComboInterval): ComboInterval {
  return { ...a, endTs: b.startTs, endLo: a.endLo ?? a.startHi, endHi: b.startHi }
}

function renumbered(intervals: ComboInterval[]): ComboInterval[] {
  return intervals.map((i, n) => ({ ...i, id: `ci${n + 1}` }))
}

/** `older` then `newer`, or null when either is not a combo snapshot. */
export function mergeCombo(older: unknown, newer: unknown): ComboSnap | null {
  if (!isComboSnap(older) || !isComboSnap(newer)) return null
  const before = older.intervals
  const after = newer.intervals
  let intervals: ComboInterval[]
  const last = before.at(-1)
  const first = after.at(0)
  if (last === undefined || first === undefined || last.endTs !== null) intervals = [...before, ...after]
  else if (oneLoadout(last, first)) intervals = [...before.slice(0, -1), joined(last, first), ...after.slice(1)]
  else intervals = [...before.slice(0, -1), closedAt(last, first), ...after]
  const out = renumbered(intervals)
  return { ...newer, intervals: out, current: out.at(-1) ?? null }
}

// ── corrections over archived time ──────────────────────────────────────────────────────────────

/** How much of `[start, end)` a correction covers; both edges open is unbounded. */
function overlapMs(c: ComboCorrection, start: number, end: number | null): number {
  const hi = c.endTs === null ? (end ?? Infinity) : end === null ? c.endTs : Math.min(c.endTs, end)
  return hi - Math.max(c.startTs, start)
}

const laterOf = (a: ComboCorrection, b: ComboCorrection): ComboCorrection => (b.setAt >= a.setAt ? b : a)

/** `correction_for_slice`: a correction covering the start, else the one overlapping most. */
export function correctionFor(corrections: readonly ComboCorrection[], start: number, end: number | null): ComboCorrection | undefined {
  const covering = corrections.filter((c) => start >= c.startTs && (c.endTs === null || start <= c.endTs))
  if (covering.length > 0) return covering.reduce(laterOf)
  const overlapping = corrections.filter((c) => overlapMs(c, start, end) > 0)
  if (overlapping.length === 0) return undefined
  return overlapping.reduce((a, b) => {
    const da = overlapMs(a, start, end)
    const db = overlapMs(b, start, end)
    return db > da ? b : db < da ? a : laterOf(a, b)
  })
}

function statedSlots(classes: readonly ClassAbbr[]): ComboSlot[] {
  return classes.map((c) => ({ candidates: [c], confidence: 1, provenance: 'user', because: ['user'] }))
}

function corrected(i: ComboInterval, c: ComboCorrection): ComboInterval {
  if (i.slots.length > 0 && i.slots.every((s) => s.provenance === 'who')) {
    const named = i.slots.map((s) => s.candidates[0])
    const differs = named.length !== c.classes.length || named.some((n, k) => n !== c.classes[k])
    return differs ? { ...i, userOverruled: true } : i
  }
  return { ...i, slots: statedSlots(c.classes), expectedSlots: c.classes.length === 2 ? 2 : 3, userLocked: true }
}

/**
 * An archived combo state with today's corrections applied to its intervals. Anything else back as
 * is. `liveStart` is where the live log's first interval begins: the archive's open interval ends
 * there, so the open-ended correction of today's loadout does not reach back into it. Null when
 * the live log has no interval yet, and the archive's open interval is then the current one.
 */
export function withCorrections(state: unknown, corrections: readonly ComboCorrection[], liveStart: number | null): unknown {
  if (!isComboSnap(state) || corrections.length === 0) return state
  const intervals = state.intervals.map((i) => {
    const c = correctionFor(corrections, i.startTs, i.endTs ?? liveStart)
    return c === undefined ? i : corrected(i, c)
  })
  return { ...state, intervals, current: intervals.at(-1) ?? null }
}

/** Where the live combo state's first interval begins, or null: `withCorrections`' `liveStart`. */
export function firstStart(state: unknown): number | null {
  return isComboSnap(state) ? (state.intervals[0]?.startTs ?? null) : null
}
