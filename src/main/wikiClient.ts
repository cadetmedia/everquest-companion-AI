// wikiClient.ts — the eqlwiki.com MediaWiki client behind the two live knowledge services
// (itemLookup.ts, mobLookup.ts). Electron-free: `fetch` and timers, nothing else.
//
// ONE SPELLING, SEPARATE STATE. Both services used to carry this client as a hand copy — the same
// request, the same Retry-After cooldown, the same serialized queue with the same spacing. The
// SPELLING is shared now; the STATE is not, and that is deliberate (mobLookup.ts's header, "WHY ITS
// OWN QUEUE AND COOLDOWN"): each service calls `createWikiClient()` once and owns the cooldown and
// queue it gets back. Two serialized queues each spaced 150ms is still two requests in flight at
// most, and a cooldown honoured twice independently can only make the app quieter, never louder.
//
// AGENTS.md "Scraper etiquette" is a LAW here: a 429/5xx silences the whole queue of the client
// that received it until the server's cooldown expires.

const API = 'https://eqlwiki.com/api.php'
const UA = 'everquest-companion/0.1 (personal quest tracker)'
const REQUEST_SPACING_MS = 150 // polite inter-request delay (wiki)
const REQUEST_TIMEOUT_MS = 8000
const RETRY_AFTER_FALLBACK_MS = 60_000

export interface WikiClient {
  /** A page's raw wikitext. '' when the page doesn't exist, null on network error. */
  fetchWikitext(title: string): Promise<string | null>
  /** The search hits for a query (up to 8), or null on network error. An EMPTY array is a real
   *  zero-hit search — a negative worth caching — and distinct from null ('offline'). */
  searchTitles(query: string): Promise<{ title: string }[] | null>
  /** Run `job` on this client's serialized queue, spaced politely from the job before it whatever
   *  that job's outcome. Resolves/rejects with the job's own result. */
  enqueue<T>(job: () => Promise<T>): Promise<T>
}

/** One service's wiki client, with its OWN cooldown and queue (see the header). */
export function createWikiClient(): WikiClient {
  /**
   * Server-asked-us-to-back-off state. When the wiki answers 429 (or any 5xx), its Retry-After
   * (seconds; falls back to 60s when absent/unparseable) is honoured by refusing to issue ANY
   * request until the cooldown passes — the whole serialized queue goes quiet, not just the one
   * lookup. During the cooldown `apiFetch` returns null, which callers already treat as "offline":
   * the key caches as a short-TTL miss and is retried later, so being polite costs nothing.
   */
  let cooldownUntil = 0
  let queue: Promise<unknown> = Promise.resolve()

  async function apiFetch(params: Record<string, string>): Promise<unknown> {
    if (Date.now() < cooldownUntil) return null // server asked for quiet — stay quiet
    const url = API + '?' + new URLSearchParams({ format: 'json', formatversion: '2', ...params }).toString()
    const ctrl = new AbortController()
    const t = setTimeout(() => ctrl.abort(), REQUEST_TIMEOUT_MS)
    try {
      const res = await fetch(url, { headers: { 'User-Agent': UA }, signal: ctrl.signal })
      if (res.status === 429 || res.status >= 500) {
        const retryAfter = Number(res.headers.get('retry-after'))
        const waitMs =
          Number.isFinite(retryAfter) && retryAfter > 0 ? retryAfter * 1000 : RETRY_AFTER_FALLBACK_MS
        cooldownUntil = Date.now() + waitMs
        return null
      }
      if (!res.ok) return null
      return await res.json()
    } catch {
      return null // offline / abort / parse error — caller distinguishes null via the throw path
    } finally {
      clearTimeout(t)
    }
  }

  async function fetchWikitext(title: string): Promise<string | null> {
    const j = (await apiFetch({ action: 'parse', page: title, prop: 'wikitext', redirects: '1' })) as
      | { parse?: { wikitext?: string }; error?: { code?: string } }
      | null
    if (j === null) return null // network error (offline)
    if (j.error) return '' // missingtitle etc. — a real negative
    return j.parse?.wikitext ?? ''
  }

  async function searchTitles(query: string): Promise<{ title: string }[] | null> {
    const j = (await apiFetch({
      action: 'query',
      list: 'search',
      srsearch: query,
      srlimit: '8'
    })) as { query?: { search?: { title: string }[] } } | null
    if (j === null) return null
    return j.query?.search ?? []
  }

  function enqueue<T>(job: () => Promise<T>): Promise<T> {
    const run = queue.then(job)
    // Keep the queue serialized + spaced regardless of this call's outcome.
    queue = run.then(
      () => new Promise((r) => setTimeout(r, REQUEST_SPACING_MS)),
      () => new Promise((r) => setTimeout(r, REQUEST_SPACING_MS))
    )
    return run
  }

  return { fetchWikitext, searchTitles, enqueue }
}
