// The AI assistant's providers and screen capture (cadetmedia fork): the pure model-choice rules,
// and source pins for the security-relevant choices in the Electron-bound files (which, like the
// rest of the AI main process, are not importable under node:test).
import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import {
  AI_DEFAULT_PROVIDER,
  AI_PROVIDER_INFO,
  AI_PROVIDERS,
  chatModelsOnly,
  isAiProvider,
  nonEmpty,
  pickModel
} from '../src/shared/aiProviders'
import { allowedExternalUrl } from '../src/main/security'

const src = (rel: string): string => readFileSync(new URL(rel, import.meta.url), 'utf8')

test('four providers; an install from before the fork keeps OpenRouter', () => {
  assert.deepEqual([...AI_PROVIDERS].sort(), ['claude', 'gemini', 'openai', 'openrouter'])
  assert.equal(AI_DEFAULT_PROVIDER, 'openrouter')
  assert.ok(isAiProvider('gemini'))
  assert.ok(!isAiProvider('grok'))
  assert.ok(!isAiProvider(undefined))
})

test('pickModel keeps a live choice, swaps a retired one, and trusts the choice without a list', () => {
  const live = ['gemini-3.0-flash', 'gemini-3.0-pro']
  assert.equal(pickModel('gemini', 'gemini-3.0-pro', live), 'gemini-3.0-pro')
  assert.equal(pickModel('gemini', 'gemini-2.0-flash', live), 'gemini-3.0-flash', 'a retired model becomes a current flash')
  assert.equal(pickModel('gemini', 'gemini-2.0-flash', []), 'gemini-2.0-flash', 'no list: nothing to correct against')
  assert.equal(pickModel('claude', '', ['claude-haiku-5-5', 'claude-opus-5-5']), 'claude-opus-5-5', 'blank means the default')
  assert.equal(pickModel('openai', 'gpt-old', ['o9', 'gpt-6']), 'gpt-6')
  assert.equal(pickModel('openai', 'gpt-old', ['o9']), 'o9', 'nothing preferred: the first live model')
})

test('a blank model field is "not chosen"', () => {
  assert.equal(nonEmpty('  '), undefined)
  assert.equal(nonEmpty(undefined), undefined)
  assert.equal(nonEmpty(' gpt-6 '), 'gpt-6')
})

test('model lists keep chat models only', () => {
  assert.deepEqual(chatModelsOnly('openai', ['gpt-6', 'text-embedding-4', 'whisper-2', 'o9-mini', 'dall-e-4', 'babbage-002']), ['gpt-6', 'o9-mini'])
  assert.deepEqual(chatModelsOnly('gemini', ['models/gemini-3.0-flash', 'models/text-embedding-005', 'models/imagen-4']), ['gemini-3.0-flash'])
  assert.deepEqual(chatModelsOnly('claude', ['claude-opus-5-5', 'claude-haiku-5-5']), ['claude-opus-5-5', 'claude-haiku-5-5'])
})

test('every "get a key" link opens, and only that page on its host', () => {
  for (const p of AI_PROVIDERS) {
    const url = AI_PROVIDER_INFO[p].keyUrl
    assert.equal(allowedExternalUrl(url), url, `${p} key link`)
  }
  assert.equal(allowedExternalUrl('https://aistudio.google.com/app/prompts'), null)
  assert.equal(allowedExternalUrl('https://console.anthropic.com/settings/billing'), null)
  assert.equal(allowedExternalUrl('https://platform.openai.com/account/billing'), null)
})

test('a window never receives a key: the config view carries hasKey, not keys', () => {
  const store = src('../src/main/ai/aiConfigStore.ts')
  const view = store.slice(store.indexOf('export function aiConfigView'), store.indexOf('/** The key and model fields'))
  assert.match(view, /hasKey/)
  assert.doesNotMatch(view, /aiKey\(|decryptString|apiKey/)
  assert.doesNotMatch(src('../src/preload/ai.ts'), /apiKey\?: string/)
})

test('Claude goes through the Anthropic SDK with a guarded streaming tool loop', () => {
  const claude = src('../src/main/ai/ClaudeClient.ts')
  assert.match(claude, /from '@anthropic-ai\/sdk'/)
  assert.doesNotMatch(claude, /chat\/completions/, 'no OpenAI-compatible shim for Claude')
  assert.match(claude, /eager_input_streaming: true/)
  assert.match(claude, /stop_reason === 'refusal'/)
  assert.match(claude, /stop_reason === 'max_tokens'/)
  assert.match(claude, /is_error: true/, 'a malformed tool input gets an error result, never a run')
})

test('a capture is cropped from the frozen picture and sent small, and the hotkey lives with the overlay', () => {
  const cap = src('../src/main/ai/aiCapture.ts')
  assert.match(cap, /const MAX_SIDE = 1600/)
  assert.match(cap, /toJPEG\(85\)/)
  assert.match(cap, /e\.sender !== w\.webContents/, 'only the selector window may answer')
  assert.match(cap, /captureHotkey !== false/)
  const session = src('../src/renderer/src/overlay/useAiOverlaySession.ts')
  assert.match(session, /armAiHotkey\(true\)/)
  assert.match(session, /armAiHotkey\(false\)/)
  const ipc = src('../src/main/ipc/ai.ts')
  assert.match(ipc, /data:image\\\/\(png\|jpeg\);base64/, 'only a PNG or JPEG data URL reaches a model')
})
