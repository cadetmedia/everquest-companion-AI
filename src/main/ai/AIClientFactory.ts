import { chatModelsOnly, OPENAI_COMPAT, type AiProvider } from '../../shared/aiProviders'
import type { AiPromptResult } from '../../shared/aiChat'
import { ClaudeClient } from './ClaudeClient'
import { OpenRouterClient, type SendPromptOpts } from './OpenRouterClient'

/** What the IPC layer needs from any provider's client. */
export interface AiClient {
  sendPrompt(systemMessage: string, userMessage: string, opts?: SendPromptOpts): Promise<AiPromptResult>
  getUsageUsd(): Promise<number | null>
}

export function getAiClient(provider: AiProvider, credential: string): AiClient {
  if (!credential) throw new Error('The AI key is missing. Add one in Preferences > AI Assistant.')
  if (provider === 'claude') return new ClaudeClient(credential)
  return new OpenRouterClient(credential, provider)
}

/** The adopted PR's entry point, kept for its callers. */
export function getOpenRouterClient(credential: string): OpenRouterClient {
  if (!credential) throw new Error('OpenRouter API key is missing.')
  return new OpenRouterClient(credential)
}

/** The provider's current chat models for this key, newest first where the provider says so. */
export async function listAiModels(provider: AiProvider, credential: string): Promise<string[]> {
  if (!credential) return []
  if (provider === 'claude') return chatModelsOnly(provider, await new ClaudeClient(credential).listModels())
  const ctrl = new AbortController()
  const timer = setTimeout(() => ctrl.abort(), 10_000)
  try {
    const res = await fetch(OPENAI_COMPAT[provider].models, {
      headers: { Authorization: `Bearer ${credential}` },
      signal: ctrl.signal
    })
    if (res.status === 401 || res.status === 403) throw new Error('the key was rejected. Check it and save again.')
    if (!res.ok) throw new Error(`the provider answered ${String(res.status)}.`)
    const json = (await res.json()) as { data?: { id?: unknown }[] }
    const ids = (json.data ?? []).flatMap((m) => (typeof m.id === 'string' ? [m.id] : []))
    return chatModelsOnly(provider, ids)
  } finally {
    clearTimeout(timer)
  }
}
