// ============================================================================
// knowledgeMissFetch.ts — THE HALF OF BOUNDARY VERDICT 5 THE APP OWNS (JOS-499 item 1).
// ============================================================================
//
// The engine ships without a network stack, so a name no committed corpus holds is a question it
// can state but not answer. JOS-486 built the engine's whole side of that conversation: the
// `knowledgeMiss` stream frame (connection-wide, no id, no epoch, each name announced at most once
// per process) and the `knowledge.define` command that takes the answer back. THIS IS THE MIDDLE —
// the app hearing the frame, answering it from what it already holds, and pushing the record in.
//
// ── NO WIKI REQUEST, EVER (owner, 2026-10-26) ──────────────────────────────────────────────────
//
// "the app should not be hitting the WIKI ever except (delta refresh before build, user clicks
// COPY on an item and it does the lookup)". A miss used to run the wiki lookup; it is now answered
// by `knownItem`/`knownMob` alone: the committed corpora plus whatever a Copy click's lookup cached
// in userData. A name nothing local holds is left UNANSWERED: no define, and the engine keeps
// answering `found: false` for it. The corpus grows from the delta scrape before each build, not from play.
//
// ── THE ONE-SLOT INJECTION, AND WHY THE LOOKUPS COME THROUGH IT TOO ────────────────────────────
//
// `serveMirrors.installMirrors(deps)` and `definePush.ts` are the pattern: a leaf that main-side
// code imports gets its capability handed to it, because a leaf that imported `engineClientHost`
// back would be a cycle between two modules that boot each other. The REQUESTER is here for that
// reason.
//
// The LOOKUPS are injected for a second, different reason: `itemLookup.ts` and `mobLookup.ts` both
// `import { app } from 'electron'` at module scope, which no node unit suite can load. Keeping
// this file electron-free is what makes the decision it holds — which domain goes to which lookup,
// what happens to a rejection, what happens when nobody armed it — pinnable at all
// (tests/knowledgeMissFetch.test.mts). The concrete types live at the call site in
// `engineClientHost.ts`, which is also where the `KnowledgeRecord` widening belongs: a record's
// field set is the SCRAPER's, and the protocol says so by declaring it an open map.
//
// ── SPELL IS EXCLUDED BY SHAPE, NOT BY A CHECK ─────────────────────────────────────────────────
//
// `KnowledgePushDomain` is `item | mob` — strictly smaller than `KnowledgeDomain`, which also has
// `spell`. The schema states the reason: the spell catalog has no live fallback, being regenerated
// by `npm run scrape:spells` and committed, so a spell the DB lacks is not a miss and a
// `knowledge.define` naming one would be asking the engine to take an answer nothing produced.
// The switch below is exhaustive over the two, and a third domain would fail to compile rather
// than fall into a default that invented a fetch for it.

import type {
  KnowledgeDefineParams,
  KnowledgeMissMessage,
  KnowledgePushDomain,
  KnowledgeRecord
} from '../../shared/dataServer/protocol.generated'

/**
 * WHAT THIS FILE NEEDS FROM THE WORLD. Filled by `engineClientHost.installEngineClient`, and by
 * nothing else — one slot, on `installMirrors`'s rule.
 */
export interface KnowledgeMissDeps {
  /** `main/itemLookup.ts knownItem`, widened: what the app already holds, or null when it holds
   *  nothing (or only an offline miss). Never reaches the network; this file does not rely on it
   *  never throwing. */
  readonly lookupItem: (name: string) => Promise<KnowledgeRecord | null>
  /** `main/mobLookup.ts knownMob`, widened. Same contract. */
  readonly lookupMob: (name: string) => Promise<KnowledgeRecord | null>
  /** `knowledge.define`, sent back over the same connection the miss arrived on. */
  readonly define: (params: KnowledgeDefineParams) => Promise<void>
  /** The dev-log line. */
  readonly note: (line: string) => void
}

let deps: KnowledgeMissDeps | null = null

/**
 * NAMES THIS PROCESS IS CURRENTLY ANSWERING, so a second frame for one of them does not start a
 * second answer. (From when an answer was a wiki request; the answer is local now, so the window
 * is short, and the set costs nothing.)
 *
 * IT IS BELT AND BRACES AND IS SAID TO BE. The engine already announces each name at most once per
 * process — the schema states it as a law and the Rust side's miss ledger enforces it — so on the
 * shipped path this set never has two frames for one name to catch. It earns its place on the
 * paths the law does not cover: an engine RESPAWN is a fresh process with an empty ledger, and the
 * app's own `lookupItem` has a serialized queue whose in-flight window is long enough for a
 * relaunch to land inside it. Cheap, bounded by what is in flight, and it clears itself.
 *
 * A NAME LEAVES THE SET WHEN THE FETCH SETTLES, never on a timer. The point is not to remember
 * what was fetched — the engine's overlay is that memory, and `knowledge.define` is what writes
 * it — only to avoid two simultaneous requests for one page.
 */
const inFlight = new Set<string>()

/**
 * Arm the handler. Null lets go, and clears what was in flight: the fetches themselves keep
 * running (a promise cannot be recalled) but their answers will find no requester and be dropped,
 * which is right — the connection they were an answer FOR is gone.
 */
export function installKnowledgeMissFetch(d: KnowledgeMissDeps | null): void {
  deps = d
  if (d === null) inFlight.clear()
}

/** Widen a lookup's concrete record to the open map the protocol declares. See the header: the
 *  field set belongs to the scraper, and a typed mirror's only job would be to lose a field. */
export function asKnowledgeRecord(value: object): KnowledgeRecord {
  // A SPREAD RATHER THAN A CAST, and it needs no assertion: the protocol declares the record an
  // open map, and a fresh object literal satisfies it structurally. The copy is the point — the
  // record crosses a socket, so handing over the caller's live object would let a later mutation
  // change what was already sent.
  return { ...value }
}

/** What one miss turned into. Returned for the tests and for the dev line; nothing branches on it. */
export type MissOutcome = 'defined' | 'unknown' | 'refused' | 'duplicate' | 'unarmed'

/** The key the in-flight set uses. Domain-qualified because an item and a mob may share a name and
 *  are two different pages. */
function flightKey(domain: KnowledgePushDomain, name: string): string {
  return `${domain}:${name}`
}

/**
 * ONE MISS, ANSWERED FROM WHAT THE APP HOLDS AND PUSHED BACK; LEFT UNANSWERED WHEN IT HOLDS NOTHING.
 *
 * IT NEVER THROWS, and that is a contract rather than a courtesy: the caller runs inside the
 * client's frame dispatch, where a throw surfaces as a TRANSPORT FAULT — a missing wiki page would
 * take the connection down and with it every subscription in the app. Every failure below becomes
 * a line and a `'refused'`.
 *
 * NOTHING HELD DEFINES NOTHING, deliberately. The schema allows a real negative — a record
 * carrying `notFound: true` is the app saying "I looked and the wiki has no page" (a Copy lookup
 * cached it), and it stops the engine ever announcing that name again — but "the app holds
 * nothing" is not that statement, and neither is a cached offline miss; the wiring answers null for
 * both. What reaches `define` is the held record, unedited.
 */
export async function fetchAndDefine(miss: KnowledgeMissMessage): Promise<MissOutcome> {
  const d = deps
  if (d === null) return 'unarmed'
  const key = flightKey(miss.domain, miss.name)
  if (inFlight.has(key)) return 'duplicate'
  inFlight.add(key)
  try {
    // EXHAUSTIVE OVER THE TWO PUSHABLE DOMAINS — see the header. A third would not compile.
    const entry =
      miss.domain === 'item' ? await d.lookupItem(miss.name) : await d.lookupMob(miss.name)
    if (entry === null) {
      d.note(`data-server knowledge: ${miss.domain} ${miss.name} is in no local data; left unanswered (no wiki request)`)
      return 'unknown'
    }
    await d.define({ domain: miss.domain, name: miss.name, entry })
    d.note(`data-server knowledge: defined ${miss.domain} ${miss.name} from local data`)
    return 'defined'
  } catch (err) {
    const why = err instanceof Error ? err.message : String(err)
    d.note(`data-server knowledge: ${miss.domain} ${miss.name} could not be answered (${why})`)
    return 'refused'
  } finally {
    inFlight.delete(key)
  }
}

/**
 * THE LISTENER'S SHAPE — synchronous, because the client's frame dispatch is.
 *
 * The promise is voided rather than awaited for that reason, and `fetchAndDefine` is total, so
 * there is no rejection to lose.
 */
export function onKnowledgeMiss(miss: KnowledgeMissMessage): void {
  void fetchAndDefine(miss)
}
