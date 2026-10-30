// The Claude client's tool loop, end to end against a stand-in Messages API (cadetmedia fork): a
// tool_use turn runs the local tool and sends ONE tool_result message back, the final text comes
// back as the answer and as streamed tokens, a picture rides as a base64 image block, a refusal
// stops the loop, and a bad key reads as a sentence. The local tools are mocked: they need the
// Electron main process.
import test, { mock } from 'node:test'
import assert from 'node:assert/strict'

const calls: { name: string; args: unknown }[] = []
mock.module('../src/main/ai/AiTools.ts', {
  namedExports: {
    executeToolCall: (name: string, args: unknown) => {
      calls.push({ name, args })
      return Promise.resolve(JSON.stringify({ items: [{ name: 'Bone Chip', summary: 'a chip of bone' }] }))
    }
  }
})
const { ClaudeClient } = await import('../src/main/ai/ClaudeClient.ts')

type Ev = Record<string, unknown>
function sse(events: Ev[]): Response {
  const body = events.map((e) => `event: ${String(e.type)}\ndata: ${JSON.stringify(e)}\n\n`).join('')
  return new Response(body, { status: 200, headers: { 'content-type': 'text/event-stream' } })
}
const start = (id: string): Ev => ({ type: 'message_start', message: { id, type: 'message', role: 'assistant', model: 'claude-opus-5-5', content: [], stop_reason: null, stop_sequence: null, usage: { input_tokens: 1, output_tokens: 1 } } })
const stop = (reason: string): Ev[] => [{ type: 'message_delta', delta: { stop_reason: reason, stop_sequence: null }, usage: { output_tokens: 1 } }, { type: 'message_stop' }]
const textTurn = (text: string, reason = 'end_turn'): Ev[] => [
  start('m2'),
  { type: 'content_block_start', index: 0, content_block: { type: 'text', text: '' } },
  { type: 'content_block_delta', index: 0, delta: { type: 'text_delta', text } },
  { type: 'content_block_stop', index: 0 },
  ...stop(reason)
]
const toolTurn: Ev[] = [
  start('m1'),
  { type: 'content_block_start', index: 0, content_block: { type: 'tool_use', id: 'tu1', name: 'search_items', input: {} } },
  { type: 'content_block_delta', index: 0, delta: { type: 'input_json_delta', partial_json: '{"query":"bone chip"}' } },
  { type: 'content_block_stop', index: 0 },
  ...stop('tool_use')
]

function fakeApi(turns: (Ev[] | Response)[]): { fetch: typeof fetch; bodies: Record<string, unknown>[] } {
  const bodies: Record<string, unknown>[] = []
  const f = (_url: unknown, init?: RequestInit): Promise<Response> => {
    bodies.push(JSON.parse(String(init?.body)) as Record<string, unknown>)
    const next = turns.shift()
    if (!next) throw new Error('no more turns')
    return Promise.resolve(next instanceof Response ? next : sse(next))
  }
  return { fetch: f as typeof fetch, bodies }
}

test('a tool turn runs the local tool and the next turn answers', async () => {
  calls.length = 0
  const api = fakeApi([toolTurn, textTurn('Bone Chips drop from skeletons.')])
  const client = new ClaudeClient('sk-test', { fetch: api.fetch, maxRetries: 0 })
  const tokens: string[] = []
  const r = await client.sendPrompt('system', 'what is a bone chip', {
    model: 'claude-opus-5-5',
    onChunk: (c) => { if (c.kind === 'token') tokens.push(c.text) }
  })
  assert.equal(r.text, 'Bone Chips drop from skeletons.')
  assert.deepEqual(calls, [{ name: 'search_items', args: { query: 'bone chip' } }])
  assert.equal(api.bodies.length, 2)
  const second = api.bodies[1].messages as { role: string; content: unknown }[]
  const last = second[second.length - 1] as { role: string; content: { type: string; tool_use_id: string }[] }
  assert.equal(last.role, 'user')
  assert.deepEqual(last.content.map((b) => [b.type, b.tool_use_id]), [['tool_result', 'tu1']])
  assert.ok(tokens.join('').includes('Bone Chips'))
  // Refusal fallback rides on the models that take it; every tool streams its input eagerly.
  assert.equal(api.bodies[0].fallbacks, 'default')
  assert.ok((api.bodies[0].tools as { eager_input_streaming?: boolean }[]).every((t) => t.eager_input_streaming === true))
})

test('a picture goes as a base64 image block before the question', async () => {
  const api = fakeApi([textTurn('That is a rusty sword.')])
  const client = new ClaudeClient('sk-test', { fetch: api.fetch, maxRetries: 0 })
  await client.sendPrompt('system', 'what is this', { model: 'claude-haiku-5-5', image: 'data:image/jpeg;base64,QUJD' })
  const msgs = api.bodies[0].messages as { content: { type: string; source?: { media_type: string; data: string } }[] }[]
  const content = msgs[msgs.length - 1].content
  assert.equal(content[0].type, 'image')
  assert.deepEqual(content[0].source, { type: 'base64', media_type: 'image/jpeg', data: 'QUJD' })
  assert.equal(content[1].type, 'text')
  assert.equal(api.bodies[0].fallbacks, undefined, 'no fallback on a model that does not take it')
})

test('a refusal stops the loop with a sentence', async () => {
  const api = fakeApi([textTurn('', 'refusal')])
  const client = new ClaudeClient('sk-test', { fetch: api.fetch, maxRetries: 0 })
  await assert.rejects(client.sendPrompt('system', 'x', { model: 'claude-opus-5-5' }), /declined/)
})

test('a bad key reads as a sentence, not a status code', async () => {
  const bad = new Response(JSON.stringify({ type: 'error', error: { type: 'authentication_error', message: 'invalid x-api-key' } }), { status: 401, headers: { 'content-type': 'application/json' } })
  const api = fakeApi([bad])
  const client = new ClaudeClient('sk-bad', { fetch: api.fetch, maxRetries: 0 })
  await assert.rejects(client.sendPrompt('system', 'x', { model: 'claude-opus-5-5' }), /rejected the key/)
})
