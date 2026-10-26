// shared/respawnLearn.ts — THE WIKI RESPAWN TIME FROM THE PLAYER'S OWN KILLS (owner, 2026-10-25).
//
// The engine publishes, per mob and zone, every gap between two deaths in one stay, each ending at
// the mob's first sign of life (it casts, swings, is hit, is conned, speaks): `RespawnSnap.learned`,
// respawn-first-sight. This reads the respawn out of them.
//
// THE RESPAWN IS A CONSTANT (owner: "the respawn time is constant so we are looking for that constant
// value it does not differ, unless they miss a spawn, arn't there when it respawns, etc"). A gap can
// only be longer than the respawn, never shorter: a missed spawn, a late arrival or a placeholder
// cycle adds time. So the answer is the value most gaps agree on, the densest cluster, and its
// median; the stragglers above it are the outliers. Proved on the owner's Castle of Mistmoore 4 camps:
// Lasna Cheroon's 50 gaps sit at 526-532 s (the wiki's 8:50), Xicotl's at 293-296 s with a tail of
// late re-kills that pulls a plain mean to 6.3 minutes.
//
// WHEN IT IS OFFERED (owner: "3 if they are the same gap +- 25 seconds, 5 if they are the same gap
// 20, 10 otherwise"; "meant seconds"): three gaps within 25 s of their middle, or five within 20 s,
// or ten gaps in all (then the median once the outliers beyond 1.5 times the middle spread are out).
//
// TWO SPAWNS SHARING A NAME. A common name (`a deathly usher`) can stand at two spawn points, and its
// gaps then cluster near the engine's one-minute floor: one spawn's death and the other's sighting.
// Measured on the same camps: the trash of Mistmoore 4 clusters at 60-90 s while its nameds sit at
// 528 s. A name with an article is therefore not offered under two minutes.

/** One mob's evidence as the engine publishes it (`RespawnLearned`, respawn-first-sight). */
export interface LearnedEvidence {
  id: string
  key: string
  display: string
  zone: string
  /** Newest first. */
  gapsMs: number[]
  /** The wiki page's own `|respawn_time`, verbatim; its ms when it is a duration; the page. */
  wikiText?: string
  wikiMs?: number
  wikiPage?: string
}

/** Which of the owner's three rules the number stands on. */
export type RespawnRule = 'within25' | 'within20' | 'ten'

export interface RespawnVerdict {
  /** The respawn, ms, to the second. */
  ms: number
  /** Every gap the mob has. */
  samples: number
  /** The gaps the number stands on: the cluster, or every gap left once the outliers are out. */
  agree: number
  rule: RespawnRule
}

/** The rules, in the owner's words, for the row's details. */
export const RULE_WORDS: Readonly<Record<RespawnRule, string>> = {
  within25: 'within 25 seconds of each other',
  within20: 'within 20 seconds of each other',
  ten: 'once the outliers are out'
}

/** How far apart the gaps of one spawn sit: the log's whole seconds and the lag to the first sign of life. */
const PEAK_MS = 6_000

const A_COMMON_NAME = /^(a|an) /i
/** Under this a common name's cluster is two spawns sharing the name (header). */
const COMMON_FLOOR_MS = 120_000

/** The engine's `learned` list out of a respawn snapshot, read by shape; empty when it has none. */
export function learnedOf(respawn: unknown): LearnedEvidence[] {
  const raw = respawn !== null && typeof respawn === 'object' ? (respawn as { learned?: unknown }).learned : undefined
  if (!Array.isArray(raw)) return []
  return raw.filter(
    (l): l is LearnedEvidence =>
      l !== null &&
      typeof l === 'object' &&
      typeof (l as LearnedEvidence).id === 'string' &&
      typeof (l as LearnedEvidence).key === 'string' &&
      typeof (l as LearnedEvidence).display === 'string' &&
      typeof (l as LearnedEvidence).zone === 'string' &&
      Array.isArray((l as LearnedEvidence).gapsMs) &&
      (l as LearnedEvidence).gapsMs.every((g) => Number.isFinite(g))
  )
}

const median = (sorted: readonly number[]): number => {
  const mid = Math.floor(sorted.length / 2)
  return sorted.length % 2 === 1 ? sorted[mid] : (sorted[mid - 1] + sorted[mid]) / 2
}

/** The most gaps that fit inside a window `width` wide, lowest such window on a tie: ascending. */
function densest(sorted: readonly number[], width: number): number[] {
  let best: [number, number] = [0, 0]
  let j = 0
  for (let i = 0; i < sorted.length; i++) {
    while (j < sorted.length && sorted[j] - sorted[i] <= width) j++
    if (j - i > best[1] - best[0]) best = [i, j]
  }
  return sorted.slice(best[0], best[1])
}

/** The gaps inside Tukey's fences (1.5 times the interquartile range past each quartile). */
function withoutOutliers(sorted: readonly number[]): number[] {
  const q = (p: number): number => sorted[Math.min(sorted.length - 1, Math.floor(p * (sorted.length - 1)))]
  const q1 = q(0.25)
  const q3 = q(0.75)
  const spread = (q3 - q1) * 1.5
  return sorted.filter((g) => g >= q1 - spread && g <= q3 + spread)
}

/** The respawn the gaps agree on, under the owner's rules; null when they do not agree enough yet. */
export function constantRespawn(gapsMs: readonly number[], name: string): RespawnVerdict | null {
  const sorted = [...gapsMs].sort((a, b) => a - b)
  // The number is the sharpest peak inside the agreeing gaps: a constant shows up as many gaps a
  // few seconds apart (the first sign of life lags the spawn by a cast or a swing), and a looser band
  // above it in the same 50 s is spawns found late. Enynti's 31 gaps: a peak at 529-533 s (8:51)
  // under a band to 559 s, whose median would say 8:58. `ten` has no cluster: its number is the
  // median of every gap left once the outliers are out (header).
  const verdict = (members: readonly number[], rule: RespawnRule): RespawnVerdict => ({
    ms: Math.round(median(rule === 'ten' ? members : densest(members, PEAK_MS)) / 1000) * 1000,
    samples: sorted.length,
    agree: members.length,
    rule
  })
  const c25 = densest(sorted, 50_000)
  const c20 = densest(sorted, 40_000)
  // within20 is the owner's stated rule, kept as said; five gaps inside 40 s are also three inside 50 s, so within25 always answers first.
  const found =
    c25.length >= 3 ? verdict(c25, 'within25') : c20.length >= 5 ? verdict(c20, 'within20') : sorted.length >= 10 ? verdict(withoutOutliers(sorted), 'ten') : null
  if (found === null) return null
  if (A_COMMON_NAME.test(name.trim()) && found.ms < COMMON_FLOOR_MS) return null
  return found
}

/**
 * The respawn as the wiki writes it: `8:48` under the hour (44 pages write `m:ss`), and from the
 * hour `1 hour 5 minutes` (`N hours`, 27 pages; `h:mm:ss` is not a shape `respawnWiki.ts` reads).
 */
export function wikiRespawnText(ms: number): string {
  const total = Math.round(ms / 1000)
  const h = Math.floor(total / 3600)
  const m = Math.floor((total % 3600) / 60)
  const s = total % 60
  if (h === 0) return `${String(m)}:${String(s).padStart(2, '0')}`
  const unit = (n: number, word: string): string => `${String(n)} ${word}${n === 1 ? '' : 's'}`
  return [unit(h, 'hour'), ...(m > 0 ? [unit(m, 'minute')] : []), ...(s > 0 ? [unit(s, 'second')] : [])].join(' ')
}

/** A page's respawn and the kills' agree when they are within 25 s: nothing to fix. */
export const AGREES_MS = 25_000

/** The best-evidenced verdict for a mob, by key, over every zone it was learned in. */
export function verdictFor(learned: readonly LearnedEvidence[], key: string): { evidence: LearnedEvidence; verdict: RespawnVerdict } | null {
  let best: { evidence: LearnedEvidence; verdict: RespawnVerdict } | null = null
  for (const e of learned) {
    if (e.key !== key) continue
    const v = constantRespawn(e.gapsMs, e.display)
    if (v !== null && (best === null || v.agree > best.verdict.agree)) best = { evidence: e, verdict: v }
  }
  return best
}
