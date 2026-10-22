// shared/factionLedger.ts — THE FACTION LINES OF AN ARCHIVED LOG, KEPT BESIDE ITS ARCHIVE.
//
// KEPT BYTE-IDENTICAL ON TWO BRANCHES. `log-archive` writes a ledger when it archives a log (and
// again on Refresh); `faction-tab` reads every ledger when it corrects a stale `/outputfile faction`
// dump. Neither branch has the other's code, so this file holds everything both sides must agree
// on: the folder, the file name, the format, the line reading, and the window rule. A change here is
// made on both branches in the same words.
//
// WHY IT EXISTS. The Factions tab corrects the dump with the faction lines the log printed after
// the dump was written (`shared/factionLog.ts`). Once the log is archived and a fresh one started,
// those lines are in the archive, which nothing reads except Refresh. So the archive step reads them
// once, while it holds the moved log, and keeps them here: `<segment id>.factions.json` beside the
// segment, in `<Logs>/companion-archive/`.
//
// WHAT A LEDGER HOLDS. Every faction line with its time, in log order for each faction, with one
// compression: a run of identical cap lines for one faction ("could not possibly get any better",
// printed on every kill while maxed) is one entry at the run's LAST time, with its count. A run has no adjustment for
// that faction inside it, so one pin at its last time says everything the run said about any
// window that reaches it. The line reading is `shared/factionLog.ts parseFactionLogLine`'s, restated
// because `log-archive` does not have that file; the faction-tab test holds the two together.
//
// THE WINDOW RULE, so nothing is counted twice. The reader already reads the live log's tail. Ledgers
// are taken newest first, and each gives only the lines OLDER than everything already covered (the
// live read, then each newer ledger). Two ledgers of the same log (a backup and a later archive of
// it) therefore count once, and a backup of a log that is still live gives only what the live read
// no longer reaches. A line in the very second the coverage starts is left out: it may be in both,
// and leaving it out is the safe direction.

import { parseEqTimestamp } from './spellKey'

/** The archive folder beside the game's logs: `main/logArchive/liveHistory.ts logArchiveDir`. */
export const FACTION_LEDGER_DIR = 'companion-archive'

/** Bump when a field changes meaning. A ledger of another version is skipped. */
export const FACTION_LEDGER_VERSION = 1

const SUFFIX = '.factions.json'

export function ledgerFileName(segmentId: string): string {
  return `${segmentId}${SUFFIX}`
}

export function isLedgerFileName(name: string): boolean {
  return name.endsWith(SUFFIX)
}

export type LedgerEvent =
  | { ts: number; name: string; kind: 'adjust'; amount: number }
  | { ts: number; name: string; kind: 'cap'; cap: 'high' | 'low'; n: number }

export interface FactionLedger {
  v: number
  /** The live log's file name the lines came from (`eqlog_Drywrought_oggok.txt`). */
  log: string
  /** The segment this ledger belongs to. */
  segment: string
  /** The first and last timestamped line of the whole archived file, faction or not; 0 when none. */
  firstTs: number
  lastTs: number
  events: LedgerEvent[]
}

const STAMP_RE = /^\[([^\]]+)\]/
const ADJUST_RE = /Your faction standing with (.+?) has been adjusted by \(?\s*([+-]?\d+)\s*\)?\./
const CAP_RE = /Your faction standing with (.+?) could not possibly get any (better|worse)\./
const MARKER = 'faction standing with'

/** One line's faction event, or null. Same reading as `factionLog.ts parseFactionLogLine`. */
export function ledgerEventOf(line: string, ts: number): LedgerEvent | null {
  if (!line.includes(MARKER)) return null
  const adj = ADJUST_RE.exec(line)
  if (adj !== null) return { ts, name: adj[1].trim(), kind: 'adjust', amount: Number(adj[2]) }
  const cap = CAP_RE.exec(line)
  if (cap !== null) return { ts, name: cap[1].trim(), kind: 'cap', cap: cap[2] === 'better' ? 'high' : 'low', n: 1 }
  return null
}

/** Builds a ledger one line at a time, so a writer can stream a large log through it. */
export class LedgerBuilder {
  private readonly events: LedgerEvent[] = []
  /** Per faction (lower case), the index of its latest event. */
  private readonly latest = new Map<string, number>()
  private firstTs = 0
  private lastTs = 0

  add(line: string): void {
    const m = STAMP_RE.exec(line)
    if (m === null) return
    const ts = parseEqTimestamp(m[1])
    if (ts === 0) return
    if (this.firstTs === 0) this.firstTs = ts
    this.lastTs = ts
    const ev = ledgerEventOf(line, ts)
    if (ev !== null) this.push(ev)
  }

  private push(ev: LedgerEvent): void {
    const key = ev.name.toLowerCase()
    const at = this.latest.get(key)
    if (at !== undefined && ev.kind === 'cap') {
      const prev = this.events[at]
      if (prev.kind === 'cap' && prev.cap === ev.cap) {
        this.events[at] = { ...prev, ts: ev.ts, n: prev.n + 1 }
        return
      }
    }
    this.latest.set(key, this.events.length)
    this.events.push(ev)
  }

  build(log: string, segment: string): FactionLedger {
    return { v: FACTION_LEDGER_VERSION, log, segment, firstTs: this.firstTs, lastTs: this.lastTs, events: [...this.events] }
  }
}

function isEvent(x: unknown): x is LedgerEvent {
  if (x === null || typeof x !== 'object') return false
  const e = x as Record<string, unknown>
  if (typeof e.ts !== 'number' || typeof e.name !== 'string') return false
  if (e.kind === 'adjust') return typeof e.amount === 'number'
  return e.kind === 'cap' && (e.cap === 'high' || e.cap === 'low') && typeof e.n === 'number'
}

/** A ledger read from parsed JSON, or null when it is not one this build reads. Never throws. */
export function parseLedger(raw: unknown): FactionLedger | null {
  if (raw === null || typeof raw !== 'object') return null
  const l = raw as Record<string, unknown>
  if (l.v !== FACTION_LEDGER_VERSION || typeof l.log !== 'string' || typeof l.segment !== 'string') return null
  if (typeof l.firstTs !== 'number' || typeof l.lastTs !== 'number' || !Array.isArray(l.events)) return null
  return l.events.every(isEvent) ? (raw as FactionLedger) : null
}

export interface LedgerWindow {
  /** The ledgers' events after `sinceMs` and before the coverage, oldest first. */
  events: LedgerEvent[]
  /** How far back the live read and the ledgers together reach. */
  reachedTs: number
  /** How many ledgers gave anything. */
  used: number
}

/**
 * The window rule (header): `coveredFrom` is the first time the live read holds (Infinity when it
 * holds none). Ledgers of other logs must already be filtered out.
 */
export function ledgerWindow(ledgers: readonly FactionLedger[], coveredFrom: number, sinceMs: number): LedgerWindow {
  const newestFirst = [...ledgers].sort((a, b) => b.lastTs - a.lastTs)
  const chunks: LedgerEvent[][] = []
  let from = coveredFrom
  for (const l of newestFirst) {
    if (from <= sinceMs) break
    if (l.firstTs >= from || l.firstTs === 0) continue
    const upTo = from
    chunks.push(l.events.filter((e) => e.ts > sinceMs && e.ts < upTo))
    from = l.firstTs
  }
  return { events: chunks.reverse().flat(), reachedTs: from, used: chunks.length }
}
