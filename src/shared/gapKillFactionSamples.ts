// shared/gapKillFactionSamples.ts — the proof lines behind each kill-faction pair (owner, 2026-10-20:
// "how do I know it has Grobb Merchants?"), served apart from the Gaps snapshot.
//
// WHY APART (perf review 2026-10-20, finding 2). The engine served each pair's last kills' raw lines
// inside `gaps.killFactions`; they were about half of every Gaps fetch (458 of 951 KB on the owner's
// October log), re-sent on every hail, con, loot and kill, and only an open faction row or a Copy
// reads them. The engine now serves them as their own module, `killFactionSamples`
// (engine gaps_samples.rs), and:
//
//   * THE TAB asks main for the pairs it needs, when it needs them (`gaps:killFactionSamples`):
//     main joins the archive's lines and the live ones (`joinedKillFactionSamples`);
//   * THE SERVED SNAPSHOT drops any lines the archive merge brought back (`withoutKillFactionSamples`);
//   * WHAT IS KEPT ON DISK keeps its shape: a captured segment and a saved character file get the
//     lines put back into `killFactions` (`gapsWithSamples`), so every file, old or new, reads the
//     same and the archive's merge (mergeGaps.ts) and the All characters join still carry them.

import type { GapRow } from './gaps'

/** The engine module that serves the lines (engine gaps_samples.rs). */
export const KILL_FACTION_SAMPLES_MODULE = 'killFactionSamples'

/** engine gaps_samples.rs `KILL_FACTION_SAMPLES`: three kills, two lines each. */
const KILL_FACTION_SAMPLES = 6

/** One pair's lines, as the module serves them: oldest first, each kill its faction line then its death line. */
export interface KillFactionProof {
  mob: string
  faction: string
  samples: string[]
}

/** Lines by `killFactionKey`. */
export type KillFactionSamples = Readonly<Record<string, readonly string[]>>

/** A pair's key: case-folded, as the engine and mergeGaps.ts key pairs. */
export const killFactionKey = (mob: string, faction: string): string => `${mob.toLowerCase()}|${faction.toLowerCase()}`

interface Pair {
  mob: string
  faction: string
  samples?: string[]
}

const isPair = (x: unknown): x is Pair =>
  x !== null && typeof x === 'object' && typeof (x as Pair).mob === 'string' && typeof (x as Pair).faction === 'string'

/** A state's pairs, or none when it is not a list of them. */
function pairsOf(x: unknown): Pair[] {
  return Array.isArray(x) ? x.filter(isPair) : []
}

/** A gaps state's `killFactions`, or null when it has none. */
function killFactionsOf(gaps: unknown): Pair[] | null {
  if (gaps === null || typeof gaps !== 'object') return null
  const kf = (gaps as { killFactions?: unknown }).killFactions
  return Array.isArray(kf) ? pairsOf(kf) : null
}

/** A gaps state with each pair's lines put back from the module's state; pairs that carry lines already keep them. */
export function withKillFactionSamples(gaps: unknown, proofs: unknown): unknown {
  const kf = killFactionsOf(gaps)
  const byKey = new Map(pairsOf(proofs).map((p) => [killFactionKey(p.mob, p.faction), p.samples ?? []]))
  if (kf === null || byKey.size === 0) return gaps
  const killFactions = kf.map((p) => {
    const samples = byKey.get(killFactionKey(p.mob, p.faction))
    return p.samples !== undefined || samples === undefined || samples.length === 0 ? p : { ...p, samples }
  })
  return { ...(gaps as object), killFactions }
}

/**
 * A gaps state as captured or saved: the module's lines put back. `ask` reads the module; an engine
 * without it (or a failed read) leaves the state as it came.
 */
export async function gapsWithSamples(gaps: unknown, ask: () => Promise<unknown>): Promise<unknown> {
  try {
    return withKillFactionSamples(gaps, await ask())
  } catch {
    return gaps
  }
}

/** Each stripped state by its source: the history merge hands back one object per seq, served many times. */
const stripped = new WeakMap<object, unknown>()

/** A gaps state without any pair's lines: the same object when none carries any. */
export function withoutKillFactionSamples(gaps: unknown): unknown {
  const kept = gaps !== null && typeof gaps === 'object' ? stripped.get(gaps) : undefined
  if (kept !== undefined) return kept
  const kf = killFactionsOf(gaps)
  if (!kf?.some((p) => p.samples !== undefined)) return gaps
  const out = { ...(gaps as object), killFactions: kf.map(({ samples: _samples, ...p }) => p) }
  stripped.set(gaps as object, out)
  return out
}

/**
 * The wanted pairs' lines: the archived gaps states' (oldest first), then the live module's, joined
 * newest last and cut to the last three kills, as mergeGaps.ts joins a pair.
 */
export function joinedKillFactionSamples(archivedGaps: readonly unknown[], live: unknown, wanted: ReadonlySet<string>): Record<string, string[]> {
  const out: Record<string, string[]> = {}
  const add = (pairs: readonly Pair[]): void => {
    for (const p of pairs) {
      const key = killFactionKey(p.mob, p.faction)
      if (!wanted.has(key) || p.samples === undefined || p.samples.length === 0) continue
      out[key] = [...(out[key] ?? []), ...p.samples].slice(-KILL_FACTION_SAMPLES)
    }
  }
  for (const g of archivedGaps) add(killFactionsOf(g) ?? [])
  add(pairsOf(live))
  return out
}

// ---- the tab's side ----------------------------------------------------------------------------

/** A faction row's pair (gapFactions.ts `factionRow`: named `Faction (mob)`, its mob its one source); null for any other row. */
export function factionPairOf(row: GapRow): { mob: string; faction: string } | null {
  const mob = row.domain === 'faction' ? row.details.sources?.entries[0]?.name : undefined
  if (mob === undefined || !row.name.endsWith(` (${mob})`)) return null
  return { mob, faction: row.name.slice(0, -(mob.length + 3)) }
}

/** The pair keys of the faction rows among `rows`. */
export function factionRowKeys(rows: readonly GapRow[]): string[] {
  return rows.flatMap((r) => {
    const pair = factionPairOf(r)
    return pair === null ? [] : [killFactionKey(pair.mob, pair.faction)]
  })
}

/**
 * A faction row's lines: the attached character's asked-for ones first, then any the row carries
 * (another character's, joined after the attached one under All characters), the last three kills.
 * Each line once, so a row that still carries the attached character's own lines does not show them
 * twice. Any other row's own lines.
 */
export function rowSamples(row: GapRow, asked: KillFactionSamples | undefined): readonly string[] {
  const pair = factionPairOf(row)
  const mine = pair === null ? undefined : asked?.[killFactionKey(pair.mob, pair.faction)]
  if (mine === undefined || mine.length === 0) return row.details.samples
  return [...new Set([...mine, ...row.details.samples])].slice(-KILL_FACTION_SAMPLES)
}

/** The rows with each faction row's lines filled in (`rowSamples`), for a Copy; the same row when nothing changes. */
export function withRowSamples(rows: readonly GapRow[], asked: KillFactionSamples): GapRow[] {
  return rows.map((r) => {
    const samples = rowSamples(r, asked)
    return samples === r.details.samples ? r : { ...r, details: { ...r.details, samples: [...samples] } }
  })
}
