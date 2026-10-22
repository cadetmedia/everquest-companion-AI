// shared/logArchive/searchFights.ts — fight search over archived summaries (step 4.8).
//
// THE SECOND COPY OF A RULE THAT LIVES IN THE ENGINE. `engine/crates/engined/src/search.rs` ranks
// the live log's fights; the archived ones are app-side, so the same ranking is written here and
// the two result lists are joined. The scorer itself is `shared/fuzzy.ts`, which `search.rs` already
// mirrors; what is restated here is the rest of `search.rs`: the haystack (name, plus the zone when
// it has one), the order (score, then newer first, then id) and the empty-query answer.
//
// `tests/logArchiveFights.test.mts` runs `search.rs`'s own test fixtures through this file, read
// out of the Rust source, so an edit to either side that the other does not share fails there.

import type { FightSearchHit, FightSearchResult, SegmentSummary } from '../combat'
import { scoreQuery, tokenize } from '../fuzzy'

/** The hits a request that named no limit gets, `ops.rs DEFAULT_FIGHT_HITS`. */
export const DEFAULT_FIGHT_HITS = 50

/** `search.rs haystack`: the name, plus the zone when it has one. */
function haystack(s: SegmentSummary): string[] {
  return s.zone !== undefined && s.zone !== '' ? tokenize(`${s.name} ${s.zone}`) : tokenize(s.name)
}

/** `search.rs search`'s order: score desc, then newer `startTs` first, then `id`. */
function rank(a: FightSearchHit, b: FightSearchHit): number {
  if (a.score !== b.score) return b.score - a.score
  if (a.summary.startTs !== b.summary.startTs) return b.summary.startTs - a.summary.startTs
  return a.summary.id < b.summary.id ? -1 : a.summary.id > b.summary.id ? 1 : 0
}

/** `search.rs search`, over app-side summaries. An empty query is no hits rather than everything. */
export function searchSummaries(corpus: readonly SegmentSummary[], query: string, limit: number): FightSearchHit[] {
  const terms = tokenize(query)
  if (terms.length === 0) return []
  const hits = corpus.flatMap((summary) => {
    const score = scoreQuery(terms, haystack(summary))
    return score === null ? [] : [{ summary, score }]
  })
  return hits.sort(rank).slice(0, limit)
}

/**
 * The engine's answer joined with the archived summaries': one ranking under one limit, and the
 * archived fights added to the corpus count. Without archived rows the same object comes back.
 */
export function withArchivedHits(
  live: FightSearchResult,
  rows: readonly SegmentSummary[],
  query: string,
  limit: number | undefined
): FightSearchResult {
  if (rows.length === 0) return live
  const n = limit ?? DEFAULT_FIGHT_HITS
  const hits = [...live.hits, ...searchSummaries(rows, query, n)].sort(rank).slice(0, n)
  return { hits, corpus: live.corpus + rows.length }
}
