// One question through the assistant's source order (shared/aiSources.ts): the app's own data,
// then the player's trusted sources, then (only when the player asks for it) the open web. Every
// answer says which step it came from, and a web answer carries the citations the app tiered.

import type { AiChatTurn, AiPromptResult, AiStreamChunk } from '../../shared/aiChat'
import type { AiProvider } from '../../shared/aiProviders'
import {
  bareDomains,
  classify,
  NO_ANSWER_IN_SCOPE,
  NOT_IN_LOCAL_DATA,
  saysNotFound,
  SentinelGate,
  type AiCitation
} from '../../shared/aiSources'
import type { AiClient } from './AIClientFactory'
import { compendium } from './aiCompendium'
import { webSearch, WebSearchUnsupported, type WebSearchArgs } from './aiWebSearch'

type Emit = (c: Omit<AiStreamChunk, 'requestId'>) => void

export interface AnswerArgs {
  provider: AiProvider
  key: string
  model: string
  client: AiClient
  /** The app's own instructions: the game, the recap, the tools (ipc/ai.ts systemPrompt). */
  baseSystem: string
  text: string
  image?: string
  history: readonly AiChatTurn[]
  trusted: readonly string[]
  close: readonly string[]
  /** 'auto' runs local then trusted; 'web' is the player's yes to searching other sources. */
  scope: 'auto' | 'web'
  emit: Emit
}

export const NOT_FOUND_TEXT =
  "I couldn't find that in the app's wiki data or your trusted sources. Want me to search other sources? Answers from them may not match EverQuest Legends."
export const NOTHING_ANYWHERE_TEXT = "I couldn't find a reliable answer to that anywhere."

const LOCAL_RULE = `
SOURCE ORDER - STEP 1, THE APP'S OWN DATA:
Answer only from the tools and the recap above: they hold the app's copy of the EverQuest Legends wiki,
the EverQuest Legends Compendium (a community guide, search_guides) and the player's own log. For
how-to, strategy, grinding and endgame questions, check search_guides as well as the wiki tools, and
when you use it say the advice is from the Compendium. If answering needs a game fact they do not provide, reply with exactly
${NOT_IN_LOCAL_DATA} and nothing else: the app will then search the player's trusted sources. Never
answer game facts from general or classic EverQuest knowledge.`

function webRule(trusted: readonly string[], close: readonly string[], open: boolean): string {
  const list = (l: readonly string[]): string => (l.length ? l.map((e) => `  - ${e}`).join('\n') : '  (none set)')
  if (!open) {
    return `
SOURCE ORDER - STEP 2, TRUSTED SOURCES ONLY (the app's data did not have it):
1. Use web search, and use ONLY these EverQuest Legends sources:
${list(trusted)}
2. Base the answer solely on them. No other website, no general or classic-EQ knowledge.
3. If they do not have the answer, reply with exactly ${NO_ANSWER_IN_SCOPE} and nothing else.
4. Cite the pages you used. Never invent a source, URL or fact.`
  }
  return `
SOURCE ORDER - STEP 3, OTHER SOURCES (the player asked; the app's data and trusted sources had nothing):
1. You may search the whole web. Still prefer these EverQuest Legends sources when they have it:
${list(trusted)}
2. Classic EverQuest sources (${close.join(', ') || 'none set'}) and others may differ from Legends,
   especially drops, spawns and timers: say so plainly where an answer relies on them.
3. If nothing reliable turns up, reply with exactly ${NO_ANSWER_IN_SCOPE}.
4. Cite the pages you used. Never invent a source, URL or fact.`
}

/** Tokens through the sentinel gate; the inner client's own done/error chunks are the caller's. */
function gatedEmit(emit: Emit): { gate: SentinelGate; inner: Emit } {
  const gate = new SentinelGate([NOT_IN_LOCAL_DATA, NO_ANSWER_IN_SCOPE], (text) => emit({ kind: 'token', text }))
  const inner: Emit = (c) => {
    if (c.kind === 'token' && c.text) gate.push(c.text)
    else if (c.kind === 'tool') emit(c)
  }
  return { gate, inner }
}

/** The Compendium's link, credited on an answer whose local step searched it. */
export const COMPENDIUM_CITATION: AiCitation = {
  url: compendium.url,
  title: `${compendium.title} (${compendium.author})`,
  tier: 'trusted'
}

async function localStep(a: AnswerArgs): Promise<AiPromptResult | null> {
  const { inner } = gatedEmit(a.emit)
  let usedGuides = false
  const onChunk: Emit = (c) => {
    if (c.kind === 'tool' && c.tool === 'search_guides') usedGuides = true
    inner(c)
  }
  const r = await a.client.sendPrompt(`${a.baseSystem}\n${LOCAL_RULE}`, a.text, { model: a.model, image: a.image, history: a.history, onChunk })
  if (saysNotFound(r.text, NOT_IN_LOCAL_DATA) && r.drafts.length === 0) return null
  return usedGuides ? { ...r, source: 'local', citations: [COMPENDIUM_CITATION] } : { ...r, source: 'local' }
}

async function webStep(a: AnswerArgs, open: boolean): Promise<{ text: string; citations: AiCitation[] } | null> {
  a.emit({ kind: 'tool', tool: open ? 'web_open' : 'web_trusted' })
  const { gate } = gatedEmit(a.emit)
  const args: WebSearchArgs = {
    provider: a.provider,
    key: a.key,
    model: a.model,
    system: `${a.baseSystem}\n${webRule(a.trusted, a.close, open)}`,
    question: a.text,
    image: a.image,
    history: a.history,
    allowedDomains: open ? null : bareDomains(a.trusted),
    onToken: (t) => gate.push(t)
  }
  const r = await webSearch(args)
  if (saysNotFound(r.answer, NO_ANSWER_IN_SCOPE) || !r.answer) return null
  const citations = classify(r.citations, a.trusted, a.close, !open)
  // A trusted answer with no trusted citation was not grounded in the trusted sources.
  if (!open && citations.length === 0) return null
  return { text: r.answer, citations }
}

export async function answerQuestion(a: AnswerArgs): Promise<AiPromptResult> {
  if (a.scope === 'auto') {
    const local = await localStep(a)
    if (local) return local
  }
  try {
    const web = await webStep(a, a.scope === 'web')
    if (web) return { text: web.text, drafts: [], citations: web.citations, source: a.scope === 'web' ? 'web' : 'trusted' }
  } catch (e) {
    if (!(e instanceof WebSearchUnsupported)) throw e
    return { text: e.message, drafts: [], source: 'none' }
  }
  return a.scope === 'web'
    ? { text: NOTHING_ANYWHERE_TEXT, drafts: [], source: 'none' }
    : { text: NOT_FOUND_TEXT, drafts: [], source: 'none', askToWiden: true }
}
