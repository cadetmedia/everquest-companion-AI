// The assistant on Claude (cadetmedia fork): the same local tools and the same results as the
// OpenAI-format client (OpenRouterClient.ts), through Anthropic's own SDK and Messages API.
//
// A manual streaming tool loop: each round streams its text, `finalMessage()` gives the whole turn,
// tool_use blocks run locally and go back as tool_result blocks in ONE user message. Tool inputs
// stream eagerly, so the server no longer validates them: each is checked to be an object before
// it runs, and a refusal or a max_tokens cut never runs that turn's tools.

import Anthropic from '@anthropic-ai/sdk'
import type { AiChatTurn, AiPromptResult } from '../../shared/aiChat'
import { AI_PROVIDER_INFO } from '../../shared/aiProviders'
import type { AlertDef } from '../../shared/alertTypes'
import { executeToolCall } from './AiTools'
import { AI_TOOLS } from './aiToolDefs'
import { emptyMentions } from './aiMentions'
import { absorbMentions, draftFromToolResult, type OnChunk, type SendPromptOpts } from './OpenRouterClient'

type Msg = Anthropic.Beta.BetaMessageParam
type Tool = Anthropic.Beta.BetaTool

const TOOL_ROUND_CAP = 5
const MAX_TOKENS = 16000
/** Models that take the server-side refusal fallback ("default" routes by refusal category). */
const FALLBACK_MODELS = new Set(['claude-fable-5-1', 'claude-opus-5-5', 'claude-opus-5', 'claude-sonnet-5-5'])

const TOOLS: Tool[] = AI_TOOLS.map((t) => ({
  name: t.function.name,
  description: t.function.description,
  input_schema: t.function.parameters as Tool['input_schema'],
  eager_input_streaming: true
}))

/** `data:image/png;base64,...` as an image block, or null for anything else. */
function imageBlock(dataUrl: string): Anthropic.Beta.BetaImageBlockParam | null {
  const m = /^data:(image\/(?:png|jpeg|gif|webp));base64,(.+)$/.exec(dataUrl)
  if (!m) return null
  return { type: 'image', source: { type: 'base64', media_type: m[1] as 'image/png', data: m[2] } }
}

function seed(history: readonly AiChatTurn[], userMessage: string, image?: string): Msg[] {
  const messages: Msg[] = history.map((t) => ({ role: t.role === 'assistant' ? 'assistant' : 'user', content: t.text }))
  const img = image ? imageBlock(image) : null
  messages.push({ role: 'user', content: img ? [img, { type: 'text', text: userMessage }] : userMessage })
  return messages
}

function textOf(message: Anthropic.Beta.BetaMessage): string {
  return message.content.flatMap((b) => (b.type === 'text' ? [b.text] : [])).join('')
}

/** What a failed call means to a player, by the SDK's typed errors. */
export function claudeFail(e: unknown): Error {
  if (e instanceof Anthropic.AuthenticationError || e instanceof Anthropic.PermissionDeniedError) {
    return new Error('Claude rejected the key. Check it in Preferences > AI Assistant.')
  }
  if (e instanceof Anthropic.NotFoundError) return new Error('That Claude model is not available to this key. Pick another in Preferences.')
  if (e instanceof Anthropic.RateLimitError) return new Error('Claude rate-limited this key. Wait a bit and ask again.')
  if (e instanceof Anthropic.BadRequestError) return new Error(`Claude refused the request: ${e.message}`)
  if (e instanceof Anthropic.APIError) return new Error(`Claude API error ${String(e.status)}: ${e.message}`)
  return e instanceof Error ? e : new Error(String(e))
}

interface LoopState {
  drafts: AlertDef[]
  mentions: ReturnType<typeof emptyMentions>
  onChunk?: OnChunk
}

export class ClaudeClient {
  private client: Anthropic

  /** `options` is for tests (a stand-in `fetch`); the app passes only the key. */
  constructor(apiKey: string, options: Omit<NonNullable<ConstructorParameters<typeof Anthropic>[0]>, 'apiKey'> = {}) {
    this.client = new Anthropic({ ...options, apiKey })
  }

  /** Claude reports no per-key spend through the API a player's key can call. */
  getUsageUsd(): Promise<number | null> {
    return Promise.resolve(null)
  }

  async listModels(): Promise<string[]> {
    const ids: string[] = []
    try {
      for await (const m of this.client.models.list()) ids.push(m.id)
    } catch (e) {
      throw claudeFail(e)
    }
    return ids
  }

  async sendPrompt(systemMessage: string, userMessage: string, opts: SendPromptOpts = {}): Promise<AiPromptResult> {
    const model = opts.model ?? AI_PROVIDER_INFO.claude.defaultModel
    const messages = seed(opts.history ?? [], userMessage, opts.image)
    const state: LoopState = { drafts: [], mentions: emptyMentions(), onChunk: opts.onChunk }
    try {
      const text = await this.loop(model, systemMessage, messages, state)
      opts.onChunk?.({ kind: 'done', text, drafts: state.drafts, mentions: state.mentions })
      return { text, drafts: state.drafts, mentions: state.mentions }
    } catch (e) {
      const err = claudeFail(e)
      opts.onChunk?.({ kind: 'error', error: err.message })
      throw err
    }
  }

  private async loop(model: string, system: string, messages: Msg[], state: LoopState): Promise<string> {
    let jsonRetries = 0
    for (let round = 0; round < TOOL_ROUND_CAP; round++) {
      let message: Anthropic.Beta.BetaMessage
      try {
        message = await this.oneTurn(model, system, messages, state.onChunk)
        jsonRetries = 0
      } catch (e) {
        // Only an unparseable streamed tool input is retried; API errors go to the caller.
        if (e instanceof Anthropic.APIError || jsonRetries++ >= 2) throw e
        round--
        continue
      }
      if (message.stop_reason === 'refusal') throw new Error('Claude declined to answer that one.')
      if (message.stop_reason === 'pause_turn') {
        messages.push({ role: 'assistant', content: message.content })
        continue
      }
      const uses = message.content.filter((b): b is Anthropic.Beta.BetaToolUseBlock => b.type === 'tool_use')
      if (uses.length === 0) return textOf(message)
      if (message.stop_reason === 'max_tokens') throw new Error('Claude ran out of room mid-lookup. Ask a narrower question.')
      messages.push({ role: 'assistant', content: message.content })
      messages.push({ role: 'user', content: await runTools(uses, state) })
    }
    throw new Error('Claude needed too many lookups for that one. Ask a narrower question.')
  }

  private oneTurn(model: string, system: string, messages: Msg[], onChunk?: OnChunk): Promise<Anthropic.Beta.BetaMessage> {
    const fallback = FALLBACK_MODELS.has(model)
    const stream = this.client.beta.messages.stream({
      model,
      max_tokens: MAX_TOKENS,
      system,
      tools: TOOLS,
      messages,
      ...(fallback ? { betas: ['server-side-fallback-2026-07-01'], fallbacks: 'default' as const } : {})
    })
    if (onChunk) stream.on('text', (text) => onChunk({ kind: 'token', text }))
    return stream.finalMessage()
  }
}

/** Run one turn's tool calls; every call gets a result, a malformed input an error result. */
async function runTools(uses: readonly Anthropic.Beta.BetaToolUseBlock[], state: LoopState): Promise<Anthropic.Beta.BetaToolResultBlockParam[]> {
  const results: Anthropic.Beta.BetaToolResultBlockParam[] = []
  for (const use of uses) {
    state.onChunk?.({ kind: 'tool', tool: use.name })
    const input = use.input
    if (!input || typeof input !== 'object' || Array.isArray(input)) {
      results.push({ type: 'tool_result', tool_use_id: use.id, is_error: true, content: JSON.stringify({ INVALID_JSON: JSON.stringify(input) }) })
      continue
    }
    const result = await executeToolCall(use.name, input as Record<string, unknown>)
    const draft = draftFromToolResult(result)
    if (draft) state.drafts.push(draft)
    absorbMentions(state.mentions, use.name, result)
    results.push({ type: 'tool_result', tool_use_id: use.id, content: result })
  }
  return results
}
