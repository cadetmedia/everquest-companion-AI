// The web steps of the assistant's source order (shared/aiSources.ts): one grounded web search on
// the player's own provider, with the citations it used. The provider's servers do the searching;
// this app fetches no page itself (the only extra request is Gemini's redirect, below).
//
//   Claude  - the web_search server tool through the SDK, with allowed_domains when limited.
//   Gemini  - Google Search grounding (from EQAI). It cannot be limited to domains, so the app's own
//             citation check (classify) is what keeps a trusted answer trusted.
//   OpenAI  - the Responses API web search (from EQAI); limited by the same app-side check.
//   OpenRouter - no web search here: the caller says so instead of guessing.

import Anthropic from '@anthropic-ai/sdk'
import type { AiChatTurn } from '../../shared/aiChat'
import type { AiProvider } from '../../shared/aiProviders'
import { claudeFail } from './ClaudeClient'

export interface WebSearchArgs {
  provider: AiProvider
  key: string
  model: string
  system: string
  question: string
  image?: string
  history: readonly AiChatTurn[]
  /** Bare domains the search is limited to, or null for the open web. */
  allowedDomains: string[] | null
  onToken: (text: string) => void
}

export interface WebSearchResult {
  answer: string
  citations: { url: string; title?: string }[]
}

export class WebSearchUnsupported extends Error {}

const MAX_OUTPUT = 4096

function splitDataUrl(url: string): { mime: string; data: string } | null {
  const m = /^data:(image\/[a-z]+);base64,(.+)$/.exec(url)
  return m ? { mime: m[1], data: m[2] } : null
}

/** Each `data:` payload of a server-sent-events body, as it arrives. */
async function eachSseData(body: ReadableStream<Uint8Array>, on: (data: string) => void): Promise<void> {
  const reader = body.getReader()
  const dec = new TextDecoder()
  let rest = ''
  for (;;) {
    const { done, value } = await reader.read()
    rest += done ? dec.decode() : dec.decode(value, { stream: true })
    const lines = rest.split(/\r?\n/)
    rest = done ? '' : (lines.pop() ?? '')
    for (const line of lines) if (line.startsWith('data:')) on(line.slice(5).trim())
    if (done) return
  }
}

function parseJson(data: string): Record<string, unknown> | null {
  try {
    const v: unknown = JSON.parse(data)
    return v && typeof v === 'object' ? (v as Record<string, unknown>) : null
  } catch {
    return null
  }
}

// ---- Gemini -----------------------------------------------------------------------------------

/**
 * Grounding cites Google redirect links. Resolving with redirect: 'manual' asks only Google's
 * redirect host and reads the Location header, so the player's IP never reaches the cited site.
 */
async function resolveRedirect(url: string): Promise<string> {
  try {
    const res = await fetch(url, { redirect: 'manual', signal: AbortSignal.timeout(6000) })
    const loc = res.headers.get('location')
    return loc && /^https:\/\//i.test(loc) ? loc : url
  } catch {
    return url
  }
}

interface GeminiEvent {
  candidates?: {
    content?: { parts?: { text?: string }[] }
    groundingMetadata?: { groundingChunks?: { web?: { uri?: string; title?: string } }[] }
  }[]
}

/** One streamed Gemini event: its text (also sent on as tokens), and its grounding links into `raw`. */
function geminiEvent(data: string, onToken: (t: string) => void, raw: { url: string; title?: string }[]): string {
  const cand = (parseJson(data) as GeminiEvent | null)?.candidates?.[0]
  const texts = (cand?.content?.parts ?? []).flatMap((p) => (p.text ? [p.text] : []))
  for (const t of texts) onToken(t)
  for (const c of cand?.groundingMetadata?.groundingChunks ?? []) {
    if (c.web?.uri) raw.push({ url: c.web.uri, title: c.web.title })
  }
  return texts.join('')
}

async function geminiSearch(a: WebSearchArgs): Promise<WebSearchResult> {
  const parts: Record<string, unknown>[] = [{ text: a.question }]
  const img = a.image ? splitDataUrl(a.image) : null
  if (img) parts.push({ inline_data: { mime_type: img.mime, data: img.data } })
  const contents = a.history.map((h) => ({ role: h.role === 'assistant' ? 'model' : 'user', parts: [{ text: h.text }] }))
  contents.push({ role: 'user', parts: parts as { text: string }[] })
  const url = `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(a.model)}:streamGenerateContent?alt=sse`
  const res = await fetch(url, {
    method: 'POST',
    headers: { 'content-type': 'application/json', 'x-goog-api-key': a.key },
    body: JSON.stringify({
      system_instruction: { parts: [{ text: a.system }] },
      contents,
      tools: [{ google_search: {} }],
      generationConfig: { maxOutputTokens: MAX_OUTPUT }
    })
  })
  if (!res.ok || !res.body) throw new Error(`Gemini web search failed (${String(res.status)}).`)
  let answer = ''
  const raw: { url: string; title?: string }[] = []
  await eachSseData(res.body, (data) => {
    answer += geminiEvent(data, a.onToken, raw)
  })
  const citations = await Promise.all(raw.slice(0, 8).map(async (c) => ({ url: await resolveRedirect(c.url), title: c.title })))
  return { answer: answer.trim(), citations }
}

// ---- OpenAI -----------------------------------------------------------------------------------

interface OpenAiEvent {
  type?: string
  delta?: unknown
  annotation?: { type?: string; url?: string; title?: string }
}

async function openaiSearch(a: WebSearchArgs): Promise<WebSearchResult> {
  const user: Record<string, unknown>[] = [{ type: 'input_text', text: a.question }]
  if (a.image) user.push({ type: 'input_image', image_url: a.image })
  const input: Record<string, unknown>[] = [{ role: 'system', content: [{ type: 'input_text', text: a.system }] }]
  for (const h of a.history) {
    input.push(h.role === 'assistant'
      ? { role: 'assistant', content: [{ type: 'output_text', text: h.text }] }
      : { role: 'user', content: [{ type: 'input_text', text: h.text }] })
  }
  input.push({ role: 'user', content: user })
  const res = await fetch('https://api.openai.com/v1/responses', {
    method: 'POST',
    headers: { 'content-type': 'application/json', authorization: `Bearer ${a.key}` },
    body: JSON.stringify({ model: a.model, max_output_tokens: MAX_OUTPUT, tools: [{ type: 'web_search_preview' }], stream: true, input })
  })
  if (!res.ok || !res.body) throw new Error(`OpenAI web search failed (${String(res.status)}).`)
  let answer = ''
  const citations: { url: string; title?: string }[] = []
  await eachSseData(res.body, (data) => {
    const ev = parseJson(data) as OpenAiEvent | null
    if (ev?.type === 'response.output_text.delta' && typeof ev.delta === 'string') {
      answer += ev.delta
      a.onToken(ev.delta)
    } else if (ev?.type === 'response.output_text.annotation.added' && ev.annotation?.type === 'url_citation' && ev.annotation.url) {
      citations.push({ url: ev.annotation.url, title: ev.annotation.title })
    }
  })
  return { answer: answer.trim(), citations }
}

// ---- Claude -----------------------------------------------------------------------------------

/** The dynamic-filtering web search runs on these models; older ones take the basic variant. */
const DYNAMIC_SEARCH = /^claude-(opus-(5|4-[678])|sonnet-(5|4-6))/

function claudeTool(model: string, allowed: string[] | null): Anthropic.Beta.BetaToolUnion {
  const limit = allowed ? { allowed_domains: allowed } : {}
  return DYNAMIC_SEARCH.test(model)
    ? { type: 'web_search_20260209', name: 'web_search', max_uses: 5, ...limit }
    : { type: 'web_search_20250305', name: 'web_search', max_uses: 5, ...limit }
}

function claudeCitations(message: Anthropic.Beta.BetaMessage): { url: string; title?: string }[] {
  const out: { url: string; title?: string }[] = []
  for (const block of message.content) {
    if (block.type !== 'text') continue
    for (const c of block.citations ?? []) {
      if (c.type === 'web_search_result_location') out.push({ url: c.url, title: c.title ?? undefined })
    }
  }
  return out
}

async function claudeSearch(a: WebSearchArgs, client = new Anthropic({ apiKey: a.key })): Promise<WebSearchResult> {
  const img = a.image ? splitDataUrl(a.image) : null
  const messages: Anthropic.Beta.BetaMessageParam[] = a.history.map((h) => ({ role: h.role === 'assistant' ? 'assistant' : 'user', content: h.text }))
  messages.push({
    role: 'user',
    content: img
      ? [{ type: 'image', source: { type: 'base64', media_type: img.mime as 'image/jpeg', data: img.data } }, { type: 'text', text: a.question }]
      : a.question
  })
  let answer = ''
  const citations: { url: string; title?: string }[] = []
  try {
    // pause_turn: a long server-tool turn is resumed by sending it back, a few times at most.
    for (let turn = 0; turn < 4; turn++) {
      const stream = client.beta.messages.stream({ model: a.model, max_tokens: MAX_OUTPUT, system: a.system, tools: [claudeTool(a.model, a.allowedDomains)], messages })
      stream.on('text', (t) => a.onToken(t))
      const message = await stream.finalMessage()
      if (message.stop_reason === 'refusal') throw new Error('Claude declined to answer that one.')
      answer += message.content.flatMap((b) => (b.type === 'text' ? [b.text] : [])).join('')
      citations.push(...claudeCitations(message))
      if (message.stop_reason !== 'pause_turn') break
      messages.push({ role: 'assistant', content: message.content })
    }
  } catch (e) {
    throw claudeFail(e)
  }
  return { answer: answer.trim(), citations }
}

export function webSearch(a: WebSearchArgs): Promise<WebSearchResult> {
  if (a.provider === 'claude') return claudeSearch(a)
  if (a.provider === 'gemini') return geminiSearch(a)
  if (a.provider === 'openai') return openaiSearch(a)
  return Promise.reject(new WebSearchUnsupported('Searching the web needs Gemini, Claude or OpenAI. Pick one in Preferences > AI Assistant.'))
}

/** For tests: the Claude search with a stand-in client. */
export const claudeSearchWith = claudeSearch
