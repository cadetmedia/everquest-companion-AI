// shared/logArchive/mergeGaps.ts — the `gaps` module across an archive and the live log.
//
// The fold (`gaps.rs`) keeps one row per unknown name and domain, served most mentioned first, at
// most CAP_PER_DOMAIN a domain, each with its details (`gaps_details.rs`): tallies served as their
// LIST_CAP most frequent entries plus the distinct count, two copper sums, the last SAMPLES lines.
// Rows join by domain and case-folded name (the fold keys every domain lowercased); a name on both
// sides adds its counts, tallies and copper and keeps the wider first and last. The row shape is
// restated here rather than imported: shared/gaps.ts lives on the gaps-tab branch, and this file
// must build without it.

interface Tally {
  entries: { name: string; n: number }[]
  distinct: number
  /** The zones list: every name, past the cap (the Gaps tab's "this zone" filter reads it). */
  all?: string[]
}

const LISTS = ['zones', 'sources', 'dispositions', 'drops', 'cons', 'killers', 'casters', 'sales', 'paid'] as const
const COPPER = ['salesCopper', 'paidCopper'] as const

type Details = Partial<Record<(typeof LISTS)[number], Tally>> & Partial<Record<(typeof COPPER)[number], number>> & { samples: string[] }

interface Row {
  domain: string
  name: string
  kinds: string[]
  count: number
  first: string
  last: string
  details: Details
}

/** A kill and a faction its lines moved (gaps_trade.rs), how often, and the zone last seen in. */
interface KillFaction {
  mob: string
  faction: string
  n: number
  zone: string
}

interface Snap {
  rows: Row[]
  totals: Record<string, number>
  seen: Record<string, number>
  killFactions?: KillFaction[]
}

/** The fold's own caps (gaps.rs `CAP_PER_DOMAIN`, gaps_details.rs `LIST_CAP` and `SAMPLES`). */
const CAP_PER_DOMAIN = 500
const LIST_CAP = 8
const SAMPLES = 3

/** The fold serves the domains in this order. */
const DOMAINS = ['item', 'mob', 'spell']

const isRecord = (x: unknown): x is Record<string, unknown> => x !== null && typeof x === 'object' && !Array.isArray(x)

function isSnap(x: unknown): x is Snap {
  if (!isRecord(x)) return false
  return Array.isArray(x.rows) && isRecord(x.totals) && isRecord(x.seen)
}

const byCountThenName = (a: { count: number; name: string }, b: { count: number; name: string }): number =>
  b.count - a.count || (a.name < b.name ? -1 : a.name > b.name ? 1 : 0)

/** Every name a side lists: its `all` where it has one, its served entries where it does not. */
const namesOf = (t: Tally): string[] => t.all ?? t.entries.map((e) => e.name)

/**
 * Entries summed by name and re-ranked, the fold's way (n desc, then name), the first LIST_CAP kept.
 * `distinct` is the union of what was served, or either side's own count when that is larger: a
 * capped list can only union the entries it carries, so the true distinct count is at least this.
 * `all`, when either side carries one, is the sorted union of both sides' names.
 */
function mergeTally(a: Tally | undefined, b: Tally | undefined): Tally | undefined {
  if (a === undefined || b === undefined) return a ?? b
  const n = new Map<string, number>()
  for (const e of [...a.entries, ...b.entries]) n.set(e.name, (n.get(e.name) ?? 0) + e.n)
  const entries = [...n].map(([name, count]) => ({ name, count })).sort(byCountThenName)
  const all = a.all || b.all ? [...new Set([...namesOf(a), ...namesOf(b)])].sort() : undefined
  return {
    entries: entries.slice(0, LIST_CAP).map((e) => ({ name: e.name, n: e.count })),
    distinct: Math.max(n.size, a.distinct, b.distinct, all?.length ?? 0),
    ...(all ? { all } : {})
  }
}

function mergeDetails(a: Details, b: Details): Details {
  const out: Details = { samples: [...a.samples, ...b.samples].slice(-SAMPLES) }
  for (const k of LISTS) {
    const t = mergeTally(a[k], b[k])
    if (t !== undefined) out[k] = t
  }
  for (const k of COPPER) {
    const sum = (a[k] ?? 0) + (b[k] ?? 0)
    if (sum > 0) out[k] = sum
  }
  return out
}

/** The earlier of two stamps, an empty one (a line without a stamp) losing to the other. */
const earliest = (a: string, b: string): string => (a === '' ? b : b === '' ? a : a < b ? a : b)

/** The fold's spelling rule for a mob: the lowercase (loot line) spelling wins over a /con's sentence case. */
function nameOf(had: Row, r: Row): string {
  const lowerInitial = (s: string): boolean => /^[a-z]/.test(s)
  return had.domain === 'mob' && lowerInitial(r.name) && !lowerInitial(had.name) ? r.name : had.name
}

function mergeRow(had: Row, r: Row): Row {
  return {
    ...had,
    name: nameOf(had, r),
    kinds: [...had.kinds, ...r.kinds.filter((k) => !had.kinds.includes(k))],
    count: had.count + r.count,
    first: earliest(had.first, r.first),
    last: had.last > r.last ? had.last : r.last,
    details: mergeDetails(had.details, r.details)
  }
}

/** Each domain's rows re-ranked and re-capped as the fold serves them, the domains in its order. */
function served(rows: Iterable<Row>): { rows: Row[]; counted: Map<string, number> } {
  const groups = new Map<string, Row[]>(DOMAINS.map((d) => [d, []]))
  for (const r of rows) {
    const g = groups.get(r.domain)
    if (g === undefined) groups.set(r.domain, [r])
    else g.push(r)
  }
  const counted = new Map([...groups].map(([d, g]) => [d, g.length]))
  return { rows: [...groups.values()].flatMap((g) => g.sort(byCountThenName).slice(0, CAP_PER_DOMAIN)), counted }
}

/**
 * Per domain: `totals` recounted from the joined rows (a name on both sides is one name), or either
 * side's own total when that is larger (names past a side's cap were never served, so cannot be
 * joined); `seen` the larger side's, since the true union of two distinct counts is unknowable.
 */
function perDomain(older: Snap, newer: Snap, counted: Map<string, number>): Pick<Snap, 'totals' | 'seen'> {
  const totals: Record<string, number> = {}
  const seen: Record<string, number> = {}
  for (const d of new Set([...DOMAINS, ...Object.keys(older.totals), ...Object.keys(newer.totals), ...counted.keys()])) {
    totals[d] = Math.max(counted.get(d) ?? 0, older.totals[d] ?? 0, newer.totals[d] ?? 0)
  }
  for (const d of new Set([...DOMAINS, ...Object.keys(older.seen), ...Object.keys(newer.seen)])) {
    seen[d] = Math.max(older.seen[d] ?? 0, newer.seen[d] ?? 0)
  }
  return { totals, seen }
}

/** Both sides' kill-faction pairs, one per case-folded (mob, faction), counts added, the newer zone kept. */
function mergeKillFactions(older: Snap, newer: Snap): KillFaction[] {
  const out = new Map<string, KillFaction>()
  for (const p of [...(older.killFactions ?? []), ...(newer.killFactions ?? [])]) {
    const k = `${p.mob.toLowerCase()}|${p.faction.toLowerCase()}`
    const had = out.get(k)
    out.set(k, had === undefined ? { ...p } : { ...had, n: had.n + p.n, zone: p.zone || had.zone })
  }
  return [...out.values()]
}

/** `older` then `newer`, a row on both sides added together; null when either is not a gaps state. */
export function mergeGaps(older: unknown, newer: unknown): Snap | null {
  if (!isSnap(older) || !isSnap(newer)) return null
  const out = new Map<string, Row>()
  for (const r of [...older.rows, ...newer.rows]) {
    const k = `${r.domain}|${r.name.toLowerCase()}`
    const had = out.get(k)
    out.set(k, had === undefined ? { ...r } : mergeRow(had, r))
  }
  const { rows, counted } = served(out.values())
  return { rows, ...perDomain(older, newer, counted), killFactions: mergeKillFactions(older, newer) }
}
