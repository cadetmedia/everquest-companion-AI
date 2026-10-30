// The AI assistant's providers (cadetmedia fork): which account answers. OpenRouter is the adopted
// PR's (one key, many vendors, two free models); Gemini, Claude and OpenAI come from EQAI, each with
// the player's own key. Pure data, imported by main (clients, IPC) and the Preferences pane.

import { AI_DEFAULT_MODEL } from './aiModels'

export type AiProvider = 'openrouter' | 'gemini' | 'claude' | 'openai'

export const AI_PROVIDERS: readonly AiProvider[] = ['gemini', 'claude', 'openai', 'openrouter']

export const AI_DEFAULT_PROVIDER: AiProvider = 'openrouter'

export interface AiProviderInfo {
  label: string
  /** Where a player gets a key. Each is in security.ts's external-link allowlist. */
  keyUrl: string
  keyHint: string
  /** The model a fresh setup uses until the live list says otherwise. */
  defaultModel: string
  /** Picks a sensible current model out of a live list when the stored one is gone. */
  prefer: RegExp
  /** Accepts images (screen captures) on every model it lists. OpenRouter varies by model. */
  vision: boolean
}

export const AI_PROVIDER_INFO: Record<AiProvider, AiProviderInfo> = {
  gemini: {
    label: 'Google Gemini (free tier)',
    keyUrl: 'https://aistudio.google.com/apikey',
    keyHint: 'A free key from Google AI Studio: sign in with a Google account, no card needed.',
    defaultModel: 'gemini-2.5-flash',
    prefer: /flash/i,
    vision: true
  },
  claude: {
    label: 'Claude (Anthropic)',
    keyUrl: 'https://console.anthropic.com/settings/keys',
    keyHint: 'A pay-as-you-go key from the Claude Console.',
    defaultModel: 'claude-opus-5-5',
    prefer: /^claude-opus/i,
    vision: true
  },
  openai: {
    label: 'OpenAI',
    keyUrl: 'https://platform.openai.com/api-keys',
    keyHint: 'A pay-as-you-go key from the OpenAI platform.',
    defaultModel: 'gpt-4o',
    prefer: /^gpt-/i,
    vision: true
  },
  openrouter: {
    label: 'OpenRouter (many models, two free)',
    keyUrl: 'https://openrouter.ai/keys',
    keyHint: 'One key for many vendors. [Free] models cost $0 but are rate-limited.',
    defaultModel: AI_DEFAULT_MODEL,
    prefer: /deepseek/i,
    vision: false
  }
}

export function isAiProvider(v: unknown): v is AiProvider {
  return typeof v === 'string' && (AI_PROVIDERS as readonly string[]).includes(v)
}

/** The OpenAI-format chat endpoint and model list for the three providers that speak it. Claude
 *  goes through Anthropic's own SDK instead (main/ai/ClaudeClient.ts). */
export const OPENAI_COMPAT: Record<Exclude<AiProvider, 'claude'>, { chat: string; models: string }> = {
  openrouter: {
    chat: 'https://openrouter.ai/api/v1/chat/completions',
    models: 'https://openrouter.ai/api/v1/models'
  },
  gemini: {
    chat: 'https://generativelanguage.googleapis.com/v1beta/openai/chat/completions',
    models: 'https://generativelanguage.googleapis.com/v1beta/openai/models'
  },
  openai: {
    chat: 'https://api.openai.com/v1/chat/completions',
    models: 'https://api.openai.com/v1/models'
  }
}

/** Chat models only: drop embeddings, speech, image generation and the like from a live list. */
export function chatModelsOnly(provider: AiProvider, ids: readonly string[]): string[] {
  const noise = /(embed|whisper|tts|audio|image|dall-e|moderation|realtime|transcribe|search|imagen|veo|aqa)/i
  const keep = ids.map((id) => id.replace(/^models\//, '')).filter((id) => !noise.test(id))
  if (provider === 'openai') return keep.filter((id) => /^(gpt-|o\d|chatgpt-)/i.test(id))
  if (provider === 'gemini') return keep.filter((id) => /^gemini-/i.test(id))
  if (provider === 'claude') return keep.filter((id) => /^claude-/i.test(id))
  return keep
}

/** The trimmed text, or undefined when there is none: a blank field is "not chosen". */
export function nonEmpty(s: string | undefined): string | undefined {
  const t = s?.trim()
  return t === undefined || t === '' ? undefined : t
}

/**
 * The model to use: the stored one while the live list still has it (or when there is no list to
 * check against), else a current model the provider prefers, else the list's first. A retired
 * default is how EQAI's Gemini setup broke once; this keeps a saved choice from going stale.
 */
export function pickModel(provider: AiProvider, stored: string | undefined, live: readonly string[]): string {
  const info = AI_PROVIDER_INFO[provider]
  const want = nonEmpty(stored) ?? info.defaultModel
  if (live.length === 0 || live.includes(want)) return want
  if (live.includes(info.defaultModel)) return info.defaultModel
  return live.find((m) => info.prefer.test(m)) ?? live[0] ?? want
}
