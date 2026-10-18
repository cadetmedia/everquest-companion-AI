// deltaApi.ts — scrape-delta.mts's only network code. One serialized GET at a time, a gap after
// every request (failed ones included), 50 pages per content request, no retry on a 4xx.

import {
  emptyFeed,
  foldRcRow,
  readRevPages,
  type FeedChanges,
  type PageIds,
  type PageTexts,
  type RcRow,
  type RevPage
} from './deltaPages'

const API = 'https://eqlwiki.com/api.php'
const UA = 'eqcompanion-delta (+https://github.com/kaltinril/everquest-companion; one serialized req/s)'
const MAX_RETRIES = 5
const BATCH = 50

/** The gap between requests, and every request this process made (tests set the gap to 0). */
export const pacing = { delayMs: 1000, requests: 0 }

const sleep = (ms: number): Promise<void> => new Promise((r) => setTimeout(r, ms))

/** Wait before a retry: the server's Retry-After when it gave a usable one, else our backoff. */
function retryDelayMs(res: Response, backoff: number): number {
  const retryAfter = Number(res.headers.get('retry-after'))
  return Number.isFinite(retryAfter) && retryAfter > 0 ? retryAfter * 1000 : backoff
}

/** The response, or null for a network failure worth retrying (the last one is thrown). */
async function fetchOnce(url: string, lastTry: boolean): Promise<Response | null> {
  pacing.requests++
  try {
    return await fetch(url, { headers: { 'User-Agent': UA } })
  } catch (err) {
    if (lastTry) throw err
    return null
  }
}

/**
 * The body, or null to retry: 429/5xx, and a maxlag deferral (HTTP 200 with an error body).
 * A permanent 4xx throws at once. Any other error body throws too: a delta built on a
 * half-answered query is silently wrong.
 */
async function readBody<T>(res: Response, lastTry: boolean, what: string): Promise<T | null> {
  if (!res.ok) {
    if ((res.status === 429 || res.status >= 500) && !lastTry) return null
    throw new Error(`${res.status} ${res.statusText} for ${what}`)
  }
  const j = (await res.json()) as T & { error?: { code?: string } }
  if (j.error?.code === 'maxlag' && !lastTry) return null
  if (j.error) throw new Error(`wiki error ${j.error.code ?? '?'} for ${what}`)
  return j
}

/** One serialized GET: maxlag=5, the gap after every request, backoff honouring Retry-After. */
async function api<T>(params: Record<string, string>): Promise<T> {
  const query = { format: 'json', formatversion: '2', maxlag: '5', ...params }
  const url = `${API}?${new URLSearchParams(query).toString()}`
  const what = `${params.action} ${params.list ?? params.prop ?? ''}`
  let wait = Math.max(pacing.delayMs, 1)
  for (let attempt = 0; ; attempt++) {
    const lastTry = attempt >= MAX_RETRIES
    const res = await fetchOnce(url, lastTry)
    await sleep(pacing.delayMs)
    const j = res ? await readBody<T>(res, lastTry, what) : null
    if (j) return j
    await sleep(res ? retryDelayMs(res, wait) : wait)
    wait *= 2
  }
}

/**
 * The wiki keeps recentchanges for a limited age ($wgRCMaxAge, 90 days by default). If its
 * OLDEST row of any kind is newer than `sinceIso`, changes in the gap are gone from the feed and
 * a delta would silently miss them: refuse, and say a full scrape is due.
 */
export async function assertFeedReaches(sinceIso: string): Promise<void> {
  const j = await api<{ query?: { recentchanges?: { timestamp: string }[] } }>({
    action: 'query',
    list: 'recentchanges',
    rcdir: 'newer',
    rclimit: '1',
    rcprop: 'timestamp'
  })
  const oldest = j.query?.recentchanges?.[0]?.timestamp
  if (!oldest || Date.parse(oldest) > Date.parse(sinceIso)) {
    throw new Error(
      `recentchanges reaches back only to ${oldest ?? '(empty)'}, not to ${sinceIso}: ` +
        'the delta cannot see the gap. Run the full scrapers (npm run scrape:items, scrape:mobs, ' +
        'scrape:spells, scrape:quests).'
    )
  }
}

export interface FeedRead {
  feed: FeedChanges
  requests: number
  /** requests spent only on rows older than `newerThan` (the older files' extra window) */
  extra: number
}

/**
 * Every ns0 page edited or created since `sinceIso` (by id), every title a log row names. The
 * feed walks backward in time, so the requests after the first row older than `newerThan` are
 * the price of the oldest file's window alone.
 */
export async function changedPages(sinceIso: string, newerThan: string): Promise<FeedRead> {
  const read: FeedRead = { feed: emptyFeed(), requests: 0, extra: 0 }
  let rccontinue: string | undefined
  let crossed = false
  for (;;) {
    const params: Record<string, string> = {
      action: 'query',
      list: 'recentchanges',
      rcend: sinceIso, // rc walks backward in time; end = oldest bound
      rclimit: '500',
      rcprop: 'title|ids|loginfo|timestamp',
      rctype: 'edit|new|log',
      rcnamespace: '0'
    }
    if (rccontinue) params.rccontinue = rccontinue
    if (crossed) read.extra++
    read.requests++
    const j = await api<{
      query?: { recentchanges?: RcRow[] }
      continue?: { rccontinue?: string }
    }>(params)
    for (const rc of j.query?.recentchanges ?? []) {
      foldRcRow(rc, read.feed)
      if ((rc.timestamp ?? '') < newerThan) crossed = true
    }
    rccontinue = j.continue?.rccontinue
    if (!rccontinue) return read
  }
}

/** Everything the run read: wikitext by title, what could not be read, ids and revids. */
export interface Reads extends PageIds {
  pages: PageTexts
  unapplied: string[]
}

export const emptyReads = (): Reads => ({
  pages: new Map(),
  unapplied: [],
  pageids: new Map(),
  revids: new Map()
})

/**
 * Wikitext and revid of `ids` (pageids or titles), 50 per request. A `continue` here means the
 * wiki cut the batch short and some pages came back without content: refuse rather than drop
 * their edits without a word.
 */
export async function fetchWikitext(
  by: 'pageids' | 'titles',
  ids: string[],
  reads: Reads
): Promise<void> {
  for (let i = 0; i < ids.length; i += BATCH) {
    const j = await api<{ query?: { pages?: RevPage[] }; continue?: unknown }>({
      action: 'query',
      prop: 'revisions',
      rvprop: 'ids|content',
      rvslots: 'main',
      [by]: ids.slice(i, i + BATCH).join('|')
    })
    if (j.continue) {
      throw new Error(`revisions batch at ${i} came back continued; content would be missing`)
    }
    readRevPages(j.query?.pages ?? [], reads.pages, reads.unapplied, reads)
    console.log(`  content by ${by} ${Math.min(i + BATCH, ids.length)}/${ids.length}`)
  }
}

/** scrape-spells.ts's page universe: every ns0 page embedding Template:Spellpage, 500 a request. */
export async function listSpellPages(): Promise<{ pageid: number; title: string }[]> {
  const out: { pageid: number; title: string }[] = []
  let eicontinue: string | undefined
  for (let page = 0; page < 200; page++) {
    const j = await api<{
      query?: { embeddedin?: { pageid: number; title: string }[] }
      continue?: { eicontinue?: string }
    }>({
      action: 'query',
      list: 'embeddedin',
      eititle: 'Template:Spellpage',
      einamespace: '0',
      eilimit: '500',
      ...(eicontinue ? { eicontinue } : {})
    })
    if (!j.query) throw new Error('embeddedin came back without a query block')
    for (const p of j.query.embeddedin ?? []) out.push({ pageid: p.pageid, title: p.title })
    eicontinue = j.continue?.eicontinue
    if (!eicontinue) break
  }
  return out.sort((a, b) => a.pageid - b.pageid)
}
