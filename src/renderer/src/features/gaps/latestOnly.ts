// latestOnly — a ticket per request, so an answer that arrives after a newer request is dropped (review,
// 2026-10-21: a slow nameplate check for picture A landed after picture B replaced it, warned against
// B, and its "Delete it" deleted B).

export interface LatestOnly {
  /** A new request: its ticket. Every earlier ticket is stale from now on. */
  start: () => number
  /** Whether this ticket is still the newest request's. */
  isLatest: (ticket: number) => boolean
}

export function latestOnly(): LatestOnly {
  let latest = 0
  return {
    start: () => ++latest,
    isLatest: (ticket) => ticket === latest
  }
}
