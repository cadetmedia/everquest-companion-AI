// shared/gapTimes.ts — First and Last on the rows the tab builds itself (Factions, Drops, Images),
// which came out blank (owner, 2026-10-19: "why is the first and last time missing?"). The engine's
// rows carry the log's own stamp keys; these rows are made from the loot and kill ledgers, whose
// times are epoch ms, so they are written back in the same `2026-10-19 17:54:48` shape (local wall
// clock, as the log prints it), and sort and cut by day exactly as the engine's do.

/** The earliest and latest instant seen, epoch ms. */
export interface Span {
  first: number
  last: number
}

/** `span` widened to take in `ts`; a missing or non-positive time changes nothing. */
export function widen(span: Span | undefined, ts: number | undefined): Span | undefined {
  if (ts === undefined || !Number.isFinite(ts) || ts <= 0) return span
  return span === undefined ? { first: ts, last: ts } : { first: Math.min(span.first, ts), last: Math.max(span.last, ts) }
}

const pad = (n: number): string => String(n).padStart(2, '0')

/** Epoch ms as the log's stamp key, local wall clock: `2026-10-19 17:54:48`. */
export function stampOf(ms: number): string {
  const d = new Date(ms)
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}`
}

/** A row's First and Last from a span; blank when nothing was timed. */
export function spanStamps(span: Span | undefined): { first: string; last: string } {
  return span === undefined ? { first: '', last: '' } : { first: stampOf(span.first), last: stampOf(span.last) }
}
