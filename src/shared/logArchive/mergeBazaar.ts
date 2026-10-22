// shared/logArchive/mergeBazaar.ts — the `bazaar` module across an archive and the live log.
//
// The fold (`bazaar.rs`) keeps one row per day, item, tier and direction. Rows join by that key;
// a day both sides hold (the day the log was archived) adds its counts and sums and keeps the
// wider low and high. A seller repeating one offer across the cut can count twice on that one day.
// The row shape is restated here rather than imported: shared/bazaar.ts lives on the bazaar-tab
// branch, and this file must build without it.

interface Row {
  day: string
  dir: string
  item: string
  tier: number
  n: number
  unpriced: number
  min: number | null
  max: number | null
  sum: number
  /** Every priced offer's platinum per unit (since 2026-10-06). */
  prices?: number[]
  /** Who said what: one per person, their newest, the day's latest QUOTES_KEPT people (since 2026-10-07). */
  quotes?: { who?: string }[]
}

/** The fold's own cap on a row's quotes (bazaar.rs `QUOTES_KEPT`). */
const QUOTES_KEPT = 20

interface Snap {
  rows: Row[]
}

function isSnap(x: unknown): x is Snap {
  return x !== null && typeof x === 'object' && Array.isArray((x as { rows?: unknown }).rows)
}

const keyOf = (r: Row): string => `${r.day}|${r.dir}|${r.item}|${r.tier}`

/** A row's prices; a row from before the list stands for its average, `n` times. */
const pricesOf = (r: Row): number[] => r.prices ?? (r.n > 0 ? Array<number>(r.n).fill(r.sum / r.n) : [])

function lowest(a: number | null, b: number | null): number | null {
  return a === null ? b : b === null ? a : Math.min(a, b)
}

function highest(a: number | null, b: number | null): number | null {
  return a === null ? b : b === null ? a : Math.max(a, b)
}

/**
 * Both sides' quotes when either has any (rows from before 2026-10-07 have none), as the fold keeps
 * them: one per person, the newer side's winning, the latest QUOTES_KEPT people.
 */
function quotesOf(had: Row, r: Row): Pick<Row, 'quotes'> {
  if (had.quotes === undefined && r.quotes === undefined) return {}
  const newer = r.quotes ?? []
  const said = new Set(newer.map((q) => (q.who ?? '').toLowerCase()))
  const older = (had.quotes ?? []).filter((q) => !said.has((q.who ?? '').toLowerCase()))
  return { quotes: [...older, ...newer].slice(-QUOTES_KEPT) }
}

/** `older` then `newer`, a row on both sides added together; null when either is not a bazaar state. */
export function mergeBazaar(older: unknown, newer: unknown): Snap | null {
  if (!isSnap(older) || !isSnap(newer)) return null
  const out = new Map<string, Row>()
  for (const r of [...older.rows, ...newer.rows]) {
    const k = keyOf(r)
    const had = out.get(k)
    out.set(
      k,
      had === undefined
        ? { ...r }
        : {
            ...had,
            n: had.n + r.n,
            unpriced: had.unpriced + r.unpriced,
            min: lowest(had.min, r.min),
            max: highest(had.max, r.max),
            sum: had.sum + r.sum,
            prices: [...pricesOf(had), ...pricesOf(r)],
            ...quotesOf(had, r)
          }
    )
  }
  return { rows: [...out.values()] }
}
