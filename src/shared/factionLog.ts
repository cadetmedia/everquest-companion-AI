// ============================================================================
// shared/factionLog.ts — the LOG's faction receipt lines, and the fold that turns them into a
// correction on a stale `/outputfile faction` dump. PURE (no fs, no Electron), both tsconfigs.
// ============================================================================
//
// THE LINES, MEASURED (Drywrought's real log, 2026-09-05 — 21,354 faction lines, every one
// accounted for by exactly two shapes; the classic "got better"/"got worse" wording occurs ZERO
// times on Legends):
//
//   Your faction standing with Heretics has been adjusted by -5.
//   Your faction standing with Ring of Scale could not possibly get any better.
//   Your faction standing with Agents of Mistmoore could not possibly get any worse.
//
// The first is an EXACT signed delta; the caps are ABSOLUTE pins — the value IS the cap at that
// instant, whatever any older file said. Together they make a stale dump correctable: standing
// now = the dump's number plus every adjustment logged after the dump was written, clamped —
// and after a cap line, the dump stops mattering at all for that faction.
//
// THE FOLD IS COMPRESSED, NOT A REPLAY. A maxed faction prints its cap line on every kill
// (2,387 repeats of one line in the measured log), so per faction only three facts survive:
// the LAST cap seen (everything before it is superseded — the pin restarts the arithmetic),
// the SUM of adjustments after that pin (or after the dump when nothing pinned), and how many
// lines said so. `applyEvidence` turns those into a value; the split exists so the fs half
// (main/factionsEvidence.ts) stays a dozen lines and everything with rules in it is testable
// without a disk.
//
// AND THE PIN SURVIVES A SHORT WINDOW. The reader can only afford the log's tail, so the window
// may not reach back to an old dump — an unpinned faction's sum is then incomplete and is
// reported as such — but a faction whose LAST line in the window is a cap is exact from that
// instant regardless of everything unread before it. That is the property the user asked for by
// name: the cap messages are what update a stale old file.

import { factionNameKey } from './outputs/factions'

/** One faction line, parsed. `amount` for an adjustment; `cap` for a pin. */
export type FactionLogEvent =
  | { name: string; kind: 'adjust'; amount: number }
  | { name: string; kind: 'cap'; cap: 'high' | 'low' }

const ADJUST_RE = /Your faction standing with (.+?) has been adjusted by \(?\s*([+-]?\d+)\s*\)?\./
const CAP_RE = /Your faction standing with (.+?) could not possibly get any (better|worse)\./

/** Parse one log line's payload (prefix included or not), or null when it is not a faction line. */
export function parseFactionLogLine(line: string): FactionLogEvent | null {
  const adj = ADJUST_RE.exec(line)
  if (adj !== null) return { name: adj[1].trim(), kind: 'adjust', amount: Number(adj[2]) }
  const cap = CAP_RE.exec(line)
  if (cap !== null) return { name: cap[1].trim(), kind: 'cap', cap: cap[2] === 'better' ? 'high' : 'low' }
  return null
}

/** One faction's compressed evidence — see the header's fold argument. */
export interface FactionEvidence {
  /** the faction name exactly as the log spelled it (joins the dump's Name column) */
  name: string
  /** the last cap pin in the window, or null when no line pinned it */
  cap: 'high' | 'low' | null
  /** the summed adjustments AFTER the pin (after the window's start when unpinned) */
  sum: number
  /** how many faction lines said any of this — the "moved since dump" count */
  hits: number
}

/** What the reader hands the tab: per-faction evidence plus whether the window reached the dump. */
export interface FactionEvidenceReport {
  /** true when the read window starts at or before `sinceMs`, so unpinned sums are complete */
  complete: boolean
  /** the boundary the evidence was folded from — the dump's own mtime */
  sinceMs: number
  rows: FactionEvidence[]
  /** the factions the log moved since `recentFromMs`, whatever the dump's age (owner ask,
   *  2026-10-13: "show me the ones I'm working on"); absent from a reader that did not tally */
  recent?: FactionRecent[]
  recentFromMs?: number
}

/** One faction's lines inside the recent window: how often, how far, and when last. */
export interface FactionRecent {
  name: string
  hits: number
  /** the summed adjustments; a cap line counts a hit and adds nothing */
  net: number
  lastTs: number
}

/** Tally timestamped events (log order) at or after `fromMs`, per faction, by the dump join's key. */
export function foldRecentFactions(
  events: Iterable<{ ts: number; ev: FactionLogEvent }>,
  fromMs: number
): FactionRecent[] {
  const byName = new Map<string, FactionRecent>()
  for (const { ts, ev } of events) {
    if (ts < fromMs) continue
    const key = factionNameKey(ev.name)
    let row = byName.get(key)
    if (row === undefined) {
      row = { name: ev.name, hits: 0, net: 0, lastTs: ts }
      byName.set(key, row)
    }
    row.hits++
    row.lastTs = ts
    if (ev.kind === 'adjust') row.net += ev.amount
  }
  return [...byName.values()]
}

/**
 * Fold parsed events (chronological order — the log's own order) into per-faction evidence.
 * A cap RESTARTS a faction's arithmetic: the pin is absolute, so the running sum resets. Keyed by
 * `factionNameKey`, the dump join's own key, so two spellings of one faction fold into one row.
 */
export function foldFactionEvidence(events: Iterable<FactionLogEvent>): FactionEvidence[] {
  const byName = new Map<string, FactionEvidence>()
  for (const ev of events) {
    const key = factionNameKey(ev.name)
    let row = byName.get(key)
    if (row === undefined) {
      row = { name: ev.name, cap: null, sum: 0, hits: 0 }
      byName.set(key, row)
    }
    row.hits++
    if (ev.kind === 'cap') {
      row.cap = ev.cap
      row.sum = 0
    } else {
      row.sum += ev.amount
    }
  }
  return [...byName.values()]
}

/** What one faction's standing is once the log has spoken. */
export interface LiveStanding {
  /** the corrected value, clamped to the faction's own scale */
  value: number
  /** value − the dump's number: what the log added since the file was written */
  drift: number
  /**
   * Is `value` exact? A pinned faction is exact whatever the window missed (the pin restarts
   * the arithmetic inside the window); an unpinned one is exact only when the window reached
   * back to the dump. When false the honest claim is "moved at least this much".
   */
  exact: boolean
}

/**
 * Apply one faction's evidence to its dump standing. `cap` is the faction's own ceiling from the
 * dump (`standing + toMax`); the floor is the scale's measured -2000.
 */
export function applyEvidence(
  dumpStanding: number,
  cap: number,
  ev: FactionEvidence,
  windowComplete: boolean
): LiveStanding {
  const base = ev.cap === null ? dumpStanding : ev.cap === 'high' ? cap : -2000
  const value = Math.max(-2000, Math.min(cap, base + ev.sum))
  return { value, drift: value - dumpStanding, exact: ev.cap !== null || windowComplete }
}
