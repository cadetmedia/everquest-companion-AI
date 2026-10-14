// factionsEvidence.ts — read the LOG's faction receipts since the dump was written, folded.
//
// The RULES all live in shared/factionLog.ts (pure, tested); this file is the fs dozen lines:
// one read-only capped tail read (feedback/slice.ts's own readTail — reuse, never a second one),
// a timestamp window from the dump's mtime, and the fold. It runs on demand (an IPC ask when the
// Factions tab wants it), never on a timer — the engine owns the live tail, and this is a
// bounded second read of a file main already owns the path to, the feedback slice's exact
// arrangement.
//
// THE WINDOW IS THE TAIL'S LAST 32 MB. A log that has grown further than that since the dump
// leaves the unpinned sums incomplete, and the report SAYS so (`complete: false`) rather than
// presenting a partial sum as a total; cap-pinned factions stay exact regardless (the shared
// module's header carries that argument). 32 MB covers weeks of ordinary play — the measured log
// holds its whole 21k faction lines in well under that.
//
// AN ARCHIVED LOG LEFT ITS LINES IN A LEDGER (log archive step 4.16, `shared/factionLedger.ts`,
// kept byte-identical with the `log-archive` branch that writes them). Once a log is archived the
// live log starts after it, so the lines between the dump and the archive are in the ledgers beside
// it: `<Logs>/companion-archive/<segment>.factions.json`. They are read here, read-only, under the
// ledger's own window rule: only lines older than the live read holds, newest ledger first, so
// nothing is counted twice. With ledgers present the window is complete only when the live read and
// the ledgers together reach back to the dump. With none, nothing changes. The ledgers are read
// whether or not the archive switch is on: they correct today's standing, not a history.

import { readdirSync, readFileSync } from 'node:fs'
import { basename, dirname, join } from 'node:path'
import { lineTs, readTail } from './feedback/slice'
import {
  foldFactionEvidence,
  foldRecentFactions,
  parseFactionLogLine,
  type FactionEvidenceReport,
  type FactionLogEvent
} from '../shared/factionLog'
import {
  FACTION_LEDGER_DIR,
  isLedgerFileName,
  ledgerWindow,
  parseLedger,
  type FactionLedger,
  type LedgerEvent
} from '../shared/factionLedger'

const TAIL_CAP_BYTES = 32 * 1024 * 1024

/** The cheap pre-filter: every faction receipt line carries this phrase. */
const MARKER = 'faction standing with'

interface Collected {
  events: FactionLogEvent[]
  windowStartTs: number
  /** every faction event at or after the recent window's start, with its time */
  recent: { ts: number; ev: FactionLogEvent }[]
}

/**
 * Walk the tail's lines: collect the faction events newer than `sinceMs`, the ones in the recent
 * window (whatever the dump's age), and note the first parseable timestamp (the window's start —
 * what decides completeness). Split out of the reader below at the measured complexity ceiling;
 * this is the loop, that is the fs.
 */
function collectEvents(raw: readonly string[], from: number, sinceMs: number, recentFromMs: number): Collected {
  const out: Collected = { events: [], windowStartTs: 0, recent: [] }
  for (let i = from; i < raw.length; i++) {
    const line = raw[i]
    if (out.windowStartTs === 0) out.windowStartTs = lineTs(line)
    if (!line.includes(MARKER)) continue
    const ts = lineTs(line)
    if (ts <= sinceMs && ts < recentFromMs) continue
    const ev = parseFactionLogLine(line)
    if (ev === null) continue
    if (ts > sinceMs) out.events.push(ev)
    if (ts >= recentFromMs) out.recent.push({ ts, ev })
  }
  return out
}

/** Every ledger an archive left for this log. Read-only; an unreadable or foreign file is skipped. */
export function readLedgers(logPath: string): FactionLedger[] {
  const dir = join(dirname(logPath), FACTION_LEDGER_DIR)
  let files: string[]
  try {
    files = readdirSync(dir)
  } catch {
    return []
  }
  const want = basename(logPath).toLowerCase()
  return files.filter(isLedgerFileName).flatMap((f) => {
    try {
      const l = parseLedger(JSON.parse(readFileSync(join(dir, f), 'utf8')))
      return l !== null && l.log.toLowerCase() === want ? [l] : []
    } catch {
      return []
    }
  })
}

const asLogEvent = (e: LedgerEvent): FactionLogEvent =>
  e.kind === 'adjust' ? { name: e.name, kind: 'adjust', amount: e.amount } : { name: e.name, kind: 'cap', cap: e.cap }

/**
 * The live read's events joined to the ledgers'. `liveComplete` is the read's own answer (the
 * header's rule); with ledgers, completeness is how far back the two reach together.
 */
export function withLedgers(
  ledgers: readonly FactionLedger[],
  live: { events: FactionLogEvent[]; windowStartTs: number; liveComplete: boolean },
  sinceMs: number
): FactionEvidenceReport {
  if (ledgers.length === 0) return { complete: live.liveComplete, sinceMs, rows: foldFactionEvidence(live.events) }
  const w = ledgerWindow(ledgers, live.windowStartTs === 0 ? Infinity : live.windowStartTs, sinceMs)
  return {
    complete: w.reachedTs <= sinceMs,
    sinceMs,
    rows: foldFactionEvidence([...w.events.map(asLogEvent), ...live.events])
  }
}

/**
 * Fold the log's faction lines newer than `sinceMs`, and an archive's ledgers before them. Null
 * when neither the log nor a ledger can be read — the tab then simply shows the dump as-is, which
 * is what it showed before this existed.
 */
export async function readFactionEvidence(
  logPath: string,
  sinceMs: number,
  recentFromMs?: number
): Promise<FactionEvidenceReport | null> {
  let tail: { text: string; truncated: boolean } | null
  try {
    tail = await readTail(logPath, TAIL_CAP_BYTES)
  } catch {
    tail = null
  }
  if (tail === null) {
    // A log just archived is empty or not yet recreated, yet every line since the dump is in the
    // ledgers beside it — read them over an empty live window rather than fall back to the dump.
    const ledgers = readLedgers(logPath)
    if (ledgers.length === 0) return null
    return withLedgers(ledgers, { events: [], windowStartTs: 0, liveComplete: true }, sinceMs)
  }

  const raw = tail.text.split(/\r?\n/)
  // A truncated read starts mid-line; the fragment cannot be trusted to parse.
  const from = tail.truncated && raw.length > 0 ? 1 : 0
  const { events, windowStartTs, recent } = collectEvents(raw, from, sinceMs, recentFromMs ?? Infinity)
  // Complete when the window reaches back to the dump: an untruncated read always does; a
  // truncated one does only if its first readable line is no newer than the dump.
  const liveComplete = !tail.truncated || (windowStartTs !== 0 && windowStartTs <= sinceMs)
  const report = withLedgers(readLedgers(logPath), { events, windowStartTs, liveComplete }, sinceMs)
  // The recent tally reads the live tail only: an archive happens at launch, so the last hours of
  // play are in the live log.
  if (recentFromMs === undefined) return report
  return { ...report, recent: foldRecentFactions(recent, recentFromMs), recentFromMs }
}
