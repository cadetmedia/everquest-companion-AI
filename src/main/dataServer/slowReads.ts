// slowReads — a small file a tester can send when the app feels slow (owner, 2026-10-20: "can we
// log potential slowdown detections like that, so we can help him?").
//
// Every engine read main proxies (readShim.ts) reports its op, how long it took and how it ended.
// Reads that end well and fast cost one map lookup. A read that took SLOW_READ_MS or longer, or
// that main gave up on and answered with the empty shape (the "Reading log…" a player sees), is
// tallied per op, and once a minute — only if anything was tallied — one line per op is appended
// to `userData/slow-reads.log`:
//
//   2026-10-20T21:40:00.000Z combat.snapshot: 7 slow (max 1840 ms), 3 unserved (the engine did not answer in time ×3)
//
// NOT errors.log: that file's lines are counted as errors fleet-wide (consoleForward.ts), and a
// slow read is a measurement, not an error. The file is capped: past MAX_BYTES it is moved to
// `slow-reads.old.log` (replacing the previous one) and starts again, so it never grows unbounded.
// The tally is pure (`createSlowReads`); the file and the timer are `startSlowReadLog`'s.

import { appendFileSync, existsSync, renameSync, statSync } from 'node:fs'
import { join } from 'node:path'

/** A served read at least this slow is worth a line: a quarter of main's 2 s deadline is gone. */
export const SLOW_READ_MS = 500
const FLUSH_EVERY_MS = 60_000
const MAX_BYTES = 256 * 1024

interface OpTally {
  slow: number
  maxMs: number
  unserved: Map<string, number>
}

export interface SlowReads {
  /** One finished read: `unserved` is the fallback phrase when main answered with the empty shape. */
  record: (op: string, ms: number, unserved?: string) => void
  /** The lines owed since the last drain, one per op; empty when nothing was slow or unserved. */
  drain: (at: Date) => string[]
}

export function createSlowReads(): SlowReads {
  const ops = new Map<string, OpTally>()
  return {
    record(op, ms, unserved) {
      if (unserved === undefined && ms < SLOW_READ_MS) return
      const t = ops.get(op) ?? { slow: 0, maxMs: 0, unserved: new Map<string, number>() }
      ops.set(op, t)
      t.maxMs = Math.max(t.maxMs, Math.round(ms))
      if (unserved === undefined) t.slow++
      else t.unserved.set(unserved, (t.unserved.get(unserved) ?? 0) + 1)
    },
    drain(at) {
      const lines = Array.from(ops, ([op, t]) => {
        const bits: string[] = []
        if (t.slow > 0) bits.push(`${String(t.slow)} slow`)
        const un = Array.from(t.unserved, ([why, n]) => `${why} ×${String(n)}`)
        const unN = Array.from(t.unserved.values()).reduce((a, b) => a + b, 0)
        if (unN > 0) bits.push(`${String(unN)} unserved (${un.join(', ')})`)
        return `${at.toISOString()} ${op}: ${bits.join(', ')} (max ${String(t.maxMs)} ms)`
      })
      ops.clear()
      return lines
    }
  }
}

/** Append `lines` to the log in `dir`, moving a full file aside first. Never throws. */
export function appendSlowReads(dir: string, lines: readonly string[]): void {
  if (lines.length === 0) return
  const file = join(dir, 'slow-reads.log')
  try {
    if (existsSync(file) && statSync(file).size > MAX_BYTES) renameSync(file, join(dir, 'slow-reads.old.log'))
    appendFileSync(file, `${lines.join('\n')}\n`)
  } catch {
    // A measurement that cannot be written is simply not written; the app carries on.
  }
}

/** The process-wide tally, flushed to `dir` once a minute. Returns the recorder readShim feeds. */
export function startSlowReadLog(dir: string): SlowReads['record'] {
  const tally = createSlowReads()
  setInterval(() => appendSlowReads(dir, tally.drain(new Date())), FLUSH_EVERY_MS).unref()
  return tally.record
}
