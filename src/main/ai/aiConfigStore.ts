// The AI assistant's settings, per provider (cadetmedia fork). Keys are encrypted at rest
// (SecureStorage, the OS keystore) and NEVER leave the main process: a renderer gets `hasKey`.
// The adopted PR's single OpenRouter key and model live on in their original fields.

import type { AiConfigPayload, AiConfigView } from '../../shared/aiChat'
import { resolveAiModel } from '../../shared/aiModels'
import { AI_DEFAULT_PROVIDER, AI_PROVIDER_INFO, AI_PROVIDERS, isAiProvider, nonEmpty, type AiProvider } from '../../shared/aiProviders'
import { settingsStore } from '../store'
import { decryptString, encryptString } from './SecureStorage'

type Stored = NonNullable<ReturnType<typeof readStored>>

function readStored() {
  return settingsStore.get('aiConfig')
}

export function aiProvider(cfg = readStored()): AiProvider {
  return cfg?.provider && isAiProvider(cfg.provider) ? cfg.provider : AI_DEFAULT_PROVIDER
}

function encryptedKey(cfg: Stored | undefined, p: AiProvider): string | undefined {
  return p === 'openrouter' ? cfg?.apiKey : cfg?.keys?.[p]
}

/** The decrypted key for a provider, or '' when there is none (or it no longer decrypts). */
export function aiKey(p: AiProvider, cfg = readStored()): string {
  const enc = encryptedKey(cfg, p)
  return enc ? (decryptString(enc) ?? '') : ''
}

export function aiModel(p: AiProvider, cfg = readStored()): string {
  if (p === 'openrouter') return resolveAiModel(cfg?.model)
  return cfg?.models?.[p] ?? AI_PROVIDER_INFO[p].defaultModel
}

export function aiConfigView(): AiConfigView {
  const cfg = readStored()
  const provider = aiProvider(cfg)
  const hasKey = {} as Record<AiProvider, boolean>
  const models = {} as Record<AiProvider, string>
  for (const p of AI_PROVIDERS) {
    hasKey[p] = Boolean(encryptedKey(cfg, p))
    models[p] = aiModel(p, cfg)
  }
  return {
    provider,
    hasKey,
    models,
    consent: cfg?.consent ?? false,
    personalStyle: cfg?.personalStyle,
    proactive: cfg?.proactive === true,
    captureHotkey: cfg?.captureHotkey !== false,
    vision: AI_PROVIDER_INFO[provider].vision
  }
}

/** The key and model fields for `provider`: OpenRouter's in the PR's own fields, the rest in maps. */
function keyAndModelFields(prev: Stored | undefined, provider: AiProvider, enc: string | undefined, model: string | undefined): Pick<Stored, 'apiKey' | 'model' | 'keys' | 'models'> {
  if (provider === 'openrouter') return { apiKey: enc, model: resolveAiModel(model), keys: prev?.keys, models: prev?.models }
  return {
    apiKey: prev?.apiKey,
    model: prev?.model,
    keys: { ...prev?.keys, [provider]: enc },
    models: model ? { ...prev?.models, [provider]: model } : prev?.models
  }
}

/** Save the pane's choices. A blank key keeps the saved one; a model is stored for its provider. */
export function saveAiConfig(payload: AiConfigPayload): void {
  const prev = readStored()
  const provider = isAiProvider(payload.provider) ? payload.provider : aiProvider(prev)
  const key = payload.apiKey.replace(/\s+/g, '')
  const enc = key ? encryptString(key) : encryptedKey(prev, provider)
  // A typed key that cannot be encrypted is refused, never stored in the clear or dropped silently.
  if (key && !enc) throw new Error('This PC has no secure key store available, so the key was not saved.')
  settingsStore.set('aiConfig', {
    authType: 'apikey',
    ...keyAndModelFields(prev, provider, enc ?? undefined, nonEmpty(payload.model)),
    provider,
    consent: payload.consent,
    personalStyle: payload.personalStyle,
    proactive: payload.proactive ?? prev?.proactive,
    captureHotkey: payload.captureHotkey ?? prev?.captureHotkey
  })
}
