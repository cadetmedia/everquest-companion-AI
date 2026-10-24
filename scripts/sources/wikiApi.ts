// wikiApi.ts — the ONE polite client every wiki scraper sends through (AGENTS.md scraper etiquette,
// owner ruling 2026-08-22: the wikis are fan-run, one request per second, the API's batching does
// the heavy lifting). Ten scrapers used to carry their own copy and the copies drifted: maxlag sent
// by some, 4 to 6 attempts, five User-Agent strings, error bodies on HTTP 200 read three ways, and
// one with no retry and 80 ms gaps. One copy now holds the whole contract:
//
//  - requests are serialized and at least MIN_GAP_MS apart, measured from the END of the previous
//    response (retries included), across every host this process talks to;
//  - every API call carries `maxlag=5`, MediaWiki's bot-courtesy contract: the server refuses the
//    request outright when replication lags, instead of straining to serve it;
//  - a 429, a 5xx, a network failure or a `maxlag` error body is retried, MAX_ATTEMPTS in all, after
//    the larger of the server's Retry-After and an exponential backoff (1 s, 2 s, 4 s, …);
//  - any other HTTP failure or API error body THROWS a WikiError, never reads as an empty answer;
//  - one User-Agent, which says who we are and where to reach us;
//  - every attempt is counted in the run's wiki ledger (wikiLedger.ts, fork-only).

import { hostOf, kindOf, recordWikiCall, type WikiCall } from './wikiLedger'

/** eqlwiki's API endpoint, the default for every call. */
export const EQL_API = 'https://eqlwiki.com/api.php'
/** Who is calling and where to reach them: the fork runs these scrapes, so the fork is the contact
 *  (fork-only line, kept here off the upstream PR branch wiki-scraper-fixes). */
export const USER_AGENT = 'everquest-companion/0.1 (+https://github.com/kaltinril/everquest-companion)'
/** The fork's address, on every request this process sends (owner, 2026-10-23: "make sure all our api
 *  calls always indicate they are coming from our github project"). */
export const FORK_URL = 'https://github.com/kaltinril/everquest-companion'
/** A caller's own User-Agent (scrape-bosses on the P99 wiki), with the fork's address added. */
export const withForkUrl = (ua: string): string => (ua.includes(FORK_URL) ? ua : `${ua} (+${FORK_URL})`)
/** The least time between one response and the next request. */
export const MIN_GAP_MS = 1000
/** Tries per request, the first included. */
export const MAX_ATTEMPTS = 6
/** The first retry's wait; it doubles per attempt. */
const BACKOFF_MS = 1000

/** A failure the wiki answered with: an HTTP status, or an API error body (`code`). */
export class WikiError extends Error {
  readonly status?: number
  readonly code?: string
  constructor(message: string, status?: number, code?: string) {
    super(message)
    this.name = 'WikiError'
    this.status = status
    this.code = code
  }
}

/** Time and waiting, swappable so a test can run the schedule without spending it. */
export interface WikiClock {
  now: () => number
  sleep: (ms: number) => Promise<void>
}

const realClock: WikiClock = {
  now: () => Date.now(),
  sleep: (ms) => new Promise((r) => setTimeout(r, ms))
}

let clock = realClock
let lastAt = Number.NEGATIVE_INFINITY
let sent = 0

/** Tests: run on `c` from a fresh gap and count. Returns the restore. */
export function useWikiClock(c: WikiClock): () => void {
  clock = c
  lastAt = Number.NEGATIVE_INFINITY
  sent = 0
  return () => {
    clock = realClock
    lastAt = Number.NEGATIVE_INFINITY
  }
}

/** Every request this process has sent, retries included, so a run can print its cost. */
export function wikiRequestCount(): number {
  return sent
}

/** One attempt's verdict: the value, or a failure worth another try (with the response that said so). */
type Outcome<T> = { ok: true; value: T } | { ok: false; res: Response | null; fail: unknown }

/** Before a retry: the server's Retry-After when it is the longer wait, else our backoff. */
function retryDelayMs(res: Response | null, backoff: number): number {
  const seconds = Number(res?.headers.get('retry-after'))
  return Number.isFinite(seconds) && seconds > 0 ? Math.max(seconds * 1000, backoff) : backoff
}

async function retrying<T>(once: (n: number) => Promise<Outcome<T>>): Promise<T> {
  let backoff = BACKOFF_MS
  for (let attempt = 1; ; attempt++) {
    const out = await once(attempt)
    if (out.ok) return out.value
    if (attempt >= MAX_ATTEMPTS) throw out.fail
    await clock.sleep(retryDelayMs(out.res, backoff))
    backoff *= 2
  }
}

/** What one attempt asks, for the ledger: its kind and whether it is a retry. */
interface Ask {
  what: string
  kind: string
  n: number
}

/** One spaced request. A network failure, a 429 or a 5xx is retryable; any other non-2xx throws. */
async function attempt(url: string, init: RequestInit, ask: Ask): Promise<Outcome<Response> & { rec: WikiCall }> {
  const wait = lastAt + MIN_GAP_MS - clock.now()
  if (wait > 0) await clock.sleep(wait)
  sent++
  const t0 = clock.now()
  const note = (status: number | null, error: boolean): WikiCall =>
    recordWikiCall({ kind: ask.kind, host: hostOf(url), status, ms: clock.now() - t0, retry: ask.n > 1, error })
  const what = ask.what
  let res: Response
  try {
    res = await fetch(url, init)
  } catch (err) {
    lastAt = clock.now()
    return { ok: false, res: null, fail: err, rec: note(null, true) }
  }
  lastAt = clock.now()
  const rec = note(res.status, !res.ok)
  if (res.ok) return { ok: true, value: res, rec }
  const fail = new WikiError(`HTTP ${res.status} ${res.statusText} for ${what}`, res.status)
  if (res.status === 429 || res.status >= 500) return { ok: false, res, fail, rec }
  throw fail
}

/** A spaced, retried request whose JSON body is the answer; an error body throws (maxlag is retried). */
async function call<T>(url: string, init: RequestInit, what: string, kind: string): Promise<T> {
  return retrying(async (n): Promise<Outcome<T>> => {
    const r = await attempt(url, init, { what, kind, n })
    if (!r.ok) return r
    const body = await r.value.text()
    r.rec.bytes = Buffer.byteLength(body)
    const j = JSON.parse(body) as T & { error?: { code?: string; info?: string } }
    lastAt = clock.now()
    const error = j.error
    r.rec.error = error !== undefined
    if (!error) return { ok: true, value: j }
    const fail = new WikiError(`API error ${error.code ?? '?'}: ${error.info ?? ''} for ${what}`, r.value.status, error.code)
    if (error.code === 'maxlag') return { ok: false, res: r.value, fail }
    throw fail
  })
}

/** The request's parameters with the fixed ones: JSON, format version 2, and maxlag=5 always. */
function withDefaults(params: Record<string, string>): URLSearchParams {
  const q = new URLSearchParams({ format: 'json', formatversion: '2', maxlag: '5', ...params })
  q.set('maxlag', '5')
  return q
}

/** Which request failed, for the message: its action, its list or prop, and the page it named. */
function describe(p: Record<string, string>): string {
  const page = p.eititle ?? p.cmtitle ?? p.page ?? p.pageid ?? (p.pageids ?? p.titles ?? '').split('|')[0]
  return `${p.action ?? '?'} ${p.list ?? p.prop ?? ''} ${page.slice(0, 60)}`.replace(/\s+/g, ' ').trim()
}

/**
 * One API GET against `api` (eqlwiki by default). `userAgent` is for a caller whose wiki already
 * knows it by another name (scrape-bosses on the P99 wiki); everyone else sends USER_AGENT.
 */
export async function wikiGet<T>(params: Record<string, string>, api: string = EQL_API, userAgent: string = USER_AGENT): Promise<T> {
  return call<T>(`${api}?${withDefaults(params).toString()}`, { headers: { 'User-Agent': withForkUrl(userAgent) } }, describe(params), kindOf(params))
}

/** One API POST, for an endpoint that takes no GET or a list too long for a query string. */
export async function wikiPost<T>(params: Record<string, string>, api: string = EQL_API): Promise<T> {
  const init: RequestInit = {
    method: 'POST',
    headers: { 'User-Agent': USER_AGENT, 'Content-Type': 'application/x-www-form-urlencoded' },
    body: withDefaults(params).toString()
  }
  return call<T>(api, init, describe(params), kindOf(params))
}

/** A plain GET of a wiki file (an image), on the same schedule; the 2xx response is the caller's to read. */
export async function wikiFile(url: string, headers: Record<string, string> = {}): Promise<Response> {
  return retrying(async (n) => {
    const r = await attempt(url, { headers: { ...headers, 'User-Agent': USER_AGENT } }, { what: `GET ${url}`, kind: 'file', n })
    if (r.ok) r.rec.bytes = Number(r.value.headers.get('content-length')) || (await r.value.clone().arrayBuffer()).byteLength
    return r
  })
}
