// The OpenAI-format client on Gemini and OpenAI (cadetmedia fork): each provider's own endpoint,
// no OpenRouter headers outside OpenRouter, a picture as an image_url part, the stored model
// passed through (OpenRouter alone keeps its pinned list), and a failure said as what to do.
import test, { mock } from 'node:test'
import assert from 'node:assert/strict'

mock.module('../src/main/ai/AiTools.ts', {
  namedExports: { executeToolCall: () => Promise.resolve('{}') }
})
const { OpenRouterClient } = await import('../src/main/ai/OpenRouterClient.ts')

interface Seen { url: string; headers: Record<string, string>; body: Record<string, unknown> }
function stubFetch(status = 200): Seen[] {
  const seen: Seen[] = []
  globalThis.fetch = ((url: string, init: RequestInit) => {
    seen.push({ url, headers: init.headers as Record<string, string>, body: JSON.parse(String(init.body)) as Record<string, unknown> })
    const ok = { choices: [{ message: { content: 'An answer.' } }] }
    return Promise.resolve(new Response(JSON.stringify(status === 200 ? ok : {}), { status }))
  }) as typeof fetch
  return seen
}

test('Gemini: its own endpoint, the stored model, a picture as image_url, no OpenRouter headers', async () => {
  const seen = stubFetch()
  const r = await new OpenRouterClient('k', 'gemini').sendPrompt('sys', 'what is this', { model: 'gemini-3.0-flash', image: 'data:image/jpeg;base64,QUJD' })
  assert.equal(r.text, 'An answer.')
  assert.match(seen[0].url, /generativelanguage\.googleapis\.com\/v1beta\/openai\/chat\/completions$/)
  assert.equal(seen[0].body.model, 'gemini-3.0-flash')
  assert.equal(seen[0].headers['X-Title'], undefined)
  const msgs = seen[0].body.messages as { role: string; content: unknown }[]
  assert.deepEqual(msgs[msgs.length - 1].content, [
    { type: 'text', text: 'what is this' },
    { type: 'image_url', image_url: { url: 'data:image/jpeg;base64,QUJD' } }
  ])
})

test('OpenAI: its own endpoint; a rejected key reads as a sentence', async () => {
  const seen = stubFetch(401)
  await assert.rejects(new OpenRouterClient('k', 'openai').sendPrompt('sys', 'q', { model: 'gpt-6' }), /rejected the key/)
  assert.equal(seen[0].url, 'https://api.openai.com/v1/chat/completions')
})

test('OpenRouter keeps its pinned list and its referer, now this fork', async () => {
  const seen = stubFetch()
  await new OpenRouterClient('k').sendPrompt('sys', 'q', { model: 'not/a-listed-model' })
  assert.equal(seen[0].body.model, 'deepseek/deepseek-chat')
  assert.equal(seen[0].headers['HTTP-Referer'], 'https://github.com/cadetmedia/everquest-companion-AI')
})

test('only OpenRouter reports spend', async () => {
  assert.equal(await new OpenRouterClient('k', 'gemini').getUsageUsd(), null)
})
