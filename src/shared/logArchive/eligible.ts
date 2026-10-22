// shared/logArchive/eligible.ts — WHICH SEALED SEGMENTS MAY BE SHOWN (step 1.2).
//
// This rule is the whole defence against counting anything twice. A segment is shown only when:
//
//   1. it belongs to the attached character, and is sealed;
//   2. the live log does not begin with it (the head fingerprints differ);
//   3. the live log's first line is not earlier than the segment's last line;
//   4. it was not sealed during the current engine attach (the engine still holds those lines);
//   5. no other shown segment already holds the same lines.
//
// Rule 5 is the one the plan did not spell out: two captures of the same log, taken a week apart,
// share a head. The later one contains the earlier, so only the longer is shown. Two segments
// that overlap in time but share no head are a stranger case (a log edited by hand); the later is
// held back and the player is told.
//
// Pure: the caller reads the live log's head and passes it in.

import type { Segment } from './segment'

/** Why a sealed segment of this character is not being shown. */
export type HeldReason =
  | 'live-log-contains-it'
  | 'overlaps-live-log'
  | 'sealed-this-attach'
  | 'contained-in-a-later-archive'
  | 'overlaps-another-archive'

export interface Held {
  id: string
  reason: HeldReason
}

export interface LiveLog {
  /** SHA-256 (hex) of the live log's first `n` bytes, or null when it is shorter than `n`. */
  headSha256: (n: number) => string | null
  /** The live log's first line stamp (`logStampKey`), or null for an empty log. */
  firstStamp: string | null
}

export interface EligibleInput {
  segments: readonly Segment[]
  character: string
  live: LiveLog
  sealedThisAttach: ReadonlySet<string>
}

export interface Eligible {
  /** Oldest first: the order every merge rule folds in. */
  shown: Segment[]
  held: Held[]
}

function byStart(a: Segment, b: Segment): number {
  return a.log.firstStamp.localeCompare(b.log.firstStamp) || a.log.bytes - b.log.bytes
}

/** Rules 2 to 4 for one segment, against the live log. */
function liveReason(s: Segment, input: EligibleInput): HeldReason | null {
  if (input.sealedThisAttach.has(s.id)) return 'sealed-this-attach'
  if (input.live.headSha256(s.log.headBytes) === s.log.headSha256) return 'live-log-contains-it'
  const first = input.live.firstStamp
  if (first !== null && first < s.log.lastStamp) return 'overlaps-live-log'
  return null
}

function sameLog(a: Segment, b: Segment): boolean {
  const n = Math.min(a.log.headBytes, b.log.headBytes)
  return n === a.log.headBytes && n === b.log.headBytes && a.log.headSha256 === b.log.headSha256
}

/** Rule 5: keep the longest capture of each log, then refuse what overlaps in time. */
function dedupe(candidates: Segment[], held: Held[]): Segment[] {
  const kept: Segment[] = []
  for (const s of candidates) {
    const twin = kept.findIndex((k) => sameLog(k, s))
    if (twin >= 0) {
      const [shorter, longer] = kept[twin].log.bytes <= s.log.bytes ? [kept[twin], s] : [s, kept[twin]]
      held.push({ id: shorter.id, reason: 'contained-in-a-later-archive' })
      kept[twin] = longer
      continue
    }
    kept.push(s)
  }
  kept.sort(byStart)
  const shown: Segment[] = []
  for (const s of kept) {
    const prev = shown[shown.length - 1]
    if (prev !== undefined && s.log.firstStamp < prev.log.lastStamp) {
      held.push({ id: s.id, reason: 'overlaps-another-archive' })
      continue
    }
    shown.push(s)
  }
  return shown
}

/** The segments to show for the attached character, and why each other sealed one is not. */
export function eligibleSegments(input: EligibleInput): Eligible {
  const held: Held[] = []
  const candidates: Segment[] = []
  const mine = input.segments.filter((s) => s.character === input.character && s.state === 'sealed')
  for (const s of [...mine].sort(byStart)) {
    const reason = liveReason(s, input)
    if (reason === null) candidates.push(s)
    else held.push({ id: s.id, reason })
  }
  return { shown: dedupe(candidates, held), held }
}
