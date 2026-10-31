// Where the AI assistant's answers may come from, in order (cadetmedia fork owner, 2026-10-31):
//
//   1. LOCAL   - the app's own data (the committed wiki corpus and the player's log) through the
//                assistant's tools. No network but the model itself.
//   2. TRUSTED - a web search limited to the player's trusted sources, only when (1) has nothing.
//   3. WEB     - any source, only after the player says yes to "Search other sources?".
//
// Each step answers or says one sentinel meaning "not here"; the next step runs only on that.
// Citations are classified HERE, by the app, against the player's lists, so "trusted" is a fact the
// app checked, not a claim the model made (EQAI's rule). Pure: shared by main, the renderer, tests.

/** How a question is sent: `auto` the app's own lookup, then the AI's source order; `ai` straight
 *  to the AI (the player's "Ask AI" after an instant answer); `web` the player's yes to other sources. */
export type AiScope = 'auto' | 'ai' | 'web'
/** The two follow-up buttons under an answer: "Ask AI" and "Search other sources". */
export type AiFollowScope = Exclude<AiScope, 'auto'>

/** What the thread shows for the player's question: a follow-up says which button was pressed. */
export function shownPrompt(prompt: string, image: string | undefined, scope: AiScope): string {
  if (scope === 'web') return `🌐 Search other sources: ${prompt}`
  if (scope === 'ai') return `🤖 Ask AI: ${prompt}`
  return image ? `📷 ${prompt}` : prompt
}

/** `instant`: the app's own lookup answered with no AI call (main/ai/aiLocalFirst.ts). */
export type AiAnswerSource = 'instant' | 'local' | 'trusted' | 'web' | 'none'
export type AiCitationTier = 'trusted' | 'close' | 'outside'

export interface AiCitation {
  url: string
  title: string
  tier: AiCitationTier
}

/** What the local step says when the app's data does not hold the answer. */
export const NOT_IN_LOCAL_DATA = 'NOT_IN_LOCAL_DATA'
/** What a web step says when its allowed sources do not hold the answer. */
export const NO_ANSWER_IN_SCOPE = 'NO_ANSWER_IN_SCOPE'

/** EverQuest Legends sources: an entry is a domain, or a domain with a path to trust only that part. */
export const DEFAULT_TRUSTED_SOURCES: readonly string[] = [
  'eqlwiki.com',
  'everquestlegends.com',
  'daybreakgames.com',
  'eqprogression.com',
  'reddit.com/r/EQLegends'
]
/** Classic EverQuest: usually right for Legends, but drops, spawns and timers may differ. */
export const DEFAULT_CLOSE_SOURCES: readonly string[] = ['wiki.project1999.com']

/** True when an answer is (only) a sentinel, so the next step should run. */
export function saysNotFound(answer: string, sentinel: string): boolean {
  const a = answer.trim()
  // A short preamble ("Let me check...") before the sentinel still means "not here".
  return a.startsWith(sentinel) || (a.length <= 400 && a.includes(sentinel))
}

function normEntry(entry: string): { dom: string; path: string } | null {
  const e = entry.trim().toLowerCase().replace(/^https?:\/\//, '').replace(/^www\./, '').replace(/\/+$/, '')
  if (!e) return null
  const slash = e.indexOf('/')
  return slash === -1 ? { dom: e, path: '' } : { dom: e.slice(0, slash), path: e.slice(slash) }
}

/** The URL is on the entry's domain (or a subdomain) and, when the entry has a path, under it. */
export function matchesSource(url: string, entry: string): boolean {
  let u: URL
  try {
    u = new URL(url)
  } catch {
    return false
  }
  const e = normEntry(entry)
  if (!e) return false
  const host = u.hostname.replace(/^www\./, '').toLowerCase()
  if (host !== e.dom && !host.endsWith(`.${e.dom}`)) return false
  if (!e.path) return true
  const path = u.pathname.toLowerCase()
  return path === e.path || path.startsWith(`${e.path}/`)
}

export function tierOf(url: string, trusted: readonly string[], close: readonly string[]): AiCitationTier {
  if (trusted.some((e) => matchesSource(url, e))) return 'trusted'
  if (close.some((e) => matchesSource(url, e))) return 'close'
  return 'outside'
}

/** Bare domains for a provider's allowed-domains filter (paths are enforced by `classify`). */
export function bareDomains(entries: readonly string[]): string[] {
  return [...new Set(entries.flatMap((e) => (normEntry(e) ? [normEntry(e)?.dom ?? ''] : [])).filter(Boolean))]
}

/**
 * Dedupe and tier the citations a web step returned. In the trusted step every citation off the
 * trusted list is DROPPED, so a trusted answer never shows a blended-in outside source; a trusted
 * answer left with no citation at all was not grounded in the trusted sources and counts as not found.
 */
export function classify(
  raw: readonly { url: string; title?: string }[],
  trusted: readonly string[],
  close: readonly string[],
  trustedOnly: boolean
): AiCitation[] {
  const seen = new Set<string>()
  const out: AiCitation[] = []
  for (const c of raw) {
    if (!/^https:\/\//i.test(c.url) || seen.has(c.url)) continue
    seen.add(c.url)
    const tier = tierOf(c.url, trusted, close)
    if (trustedOnly && tier !== 'trusted') continue
    let host = c.url
    try {
      host = new URL(c.url).hostname.replace(/^www\./, '')
    } catch {
      /* kept as the URL */
    }
    out.push({ url: c.url, title: c.title?.trim() ? c.title.trim() : host, tier })
  }
  return out
}

/** The source list a player typed: one entry per line, blanks and duplicates dropped. */
export function parseSourceList(text: string): string[] {
  return [...new Set(text.split(/\r?\n/).map((l) => l.trim()).filter(Boolean))]
}

/**
 * Holds streamed tokens back while they could still be the start of a sentinel, so "NOT_IN_LOCAL_DATA"
 * never flashes on screen; everything else passes through as it arrives.
 */
export class SentinelGate {
  private buf = ''
  private open = false

  constructor(
    private readonly sentinels: readonly string[],
    private readonly emit: (text: string) => void
  ) {}

  push(token: string): void {
    if (this.open) {
      this.emit(token)
      return
    }
    this.buf += token
    const t = this.buf.trimStart()
    if (t === '' || this.sentinels.some((s) => s.startsWith(t) || t.startsWith(s))) return
    this.open = true
    this.emit(this.buf)
  }
}

/** The source fields of a stored chat row, validated: localStorage is read back as untrusted. */
export function parseSourceFields(raw: { source?: unknown; citations?: unknown; widenPrompt?: unknown; askAiPrompt?: unknown }): {
  source?: AiAnswerSource
  citations?: AiCitation[]
  widenPrompt?: string
  askAiPrompt?: string
} {
  const out: { source?: AiAnswerSource; citations?: AiCitation[]; widenPrompt?: string; askAiPrompt?: string } = {}
  if (raw.source === 'instant' || raw.source === 'local' || raw.source === 'trusted' || raw.source === 'web' || raw.source === 'none') out.source = raw.source
  if (Array.isArray(raw.citations)) {
    const list = raw.citations.flatMap((c: unknown): AiCitation[] => {
      if (!c || typeof c !== 'object') return []
      const r = c as { url?: unknown; title?: unknown; tier?: unknown }
      if (typeof r.url !== 'string' || !/^https:\/\//i.test(r.url)) return []
      const tier = r.tier === 'trusted' || r.tier === 'close' ? r.tier : 'outside'
      return [{ url: r.url, title: typeof r.title === 'string' ? r.title : r.url, tier }]
    })
    if (list.length > 0) out.citations = list.slice(0, 12)
  }
  if (typeof raw.widenPrompt === 'string' && raw.widenPrompt.trim()) out.widenPrompt = raw.widenPrompt
  if (typeof raw.askAiPrompt === 'string' && raw.askAiPrompt.trim()) out.askAiPrompt = raw.askAiPrompt
  return out
}
