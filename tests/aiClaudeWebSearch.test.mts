// Claude's web step (cadetmedia fork): the web_search server tool limited to the trusted domains,
// the right tool version for the model, and the citations read back out of the answer's text.
import test, { mock } from 'node:test'
import assert from 'node:assert/strict'
import Anthropic from '@anthropic-ai/sdk'

mock.module('../src/main/ai/AiTools.ts', { namedExports: { executeToolCall: () => Promise.resolve('{}') } })
const { claudeSearchWith } = await import('../src/main/ai/aiWebSearch.ts')

function sse(events: Record<string, unknown>[]): Response {
  return new Response(events.map((e) => `event: ${String(e.type)}\ndata: ${JSON.stringify(e)}\n\n`).join(''), { status: 200, headers: { 'content-type': 'text/event-stream' } })
}
const cite = { type: 'web_search_result_location', url: 'https://eqlwiki.com/Bone_Chip', title: 'Bone Chip - EQL Wiki', encrypted_index: 'x', cited_text: 'drops from skeletons' }
const answer = [
  { type: 'message_start', message: { id: 'm', type: 'message', role: 'assistant', model: 'claude-opus-5-5', content: [], stop_reason: null, stop_sequence: null, usage: { input_tokens: 1, output_tokens: 1 } } },
  { type: 'content_block_start', index: 0, content_block: { type: 'text', text: '', citations: [] } },
  { type: 'content_block_delta', index: 0, delta: { type: 'citations_delta', citation: cite } },
  { type: 'content_block_delta', index: 0, delta: { type: 'text_delta', text: 'Skeletons drop them.' } },
  { type: 'content_block_stop', index: 0 },
  { type: 'message_delta', delta: { stop_reason: 'end_turn', stop_sequence: null }, usage: { output_tokens: 5 } },
  { type: 'message_stop' }
]

async function search(model: string, allowed: string[] | null) {
  const bodies: Record<string, unknown>[] = []
  const fetchFn = ((_u: unknown, init?: RequestInit) => {
    bodies.push(JSON.parse(String(init?.body)) as Record<string, unknown>)
    return Promise.resolve(sse(answer))
  }) as typeof fetch
  const tokens: string[] = []
  const r = await claudeSearchWith(
    { provider: 'claude', key: 'k', model, system: 'sys', question: 'bone chips?', history: [], allowedDomains: allowed, onToken: (t: string) => tokens.push(t) },
    new Anthropic({ apiKey: 'k', fetch: fetchFn, maxRetries: 0 })
  )
  return { r, body: bodies[0], tokens }
}

test('the trusted step limits Claude to the trusted domains, and the citation comes back', async () => {
  const { r, body, tokens } = await search('claude-opus-5-5', ['eqlwiki.com', 'reddit.com'])
  const tool = (body.tools as Record<string, unknown>[])[0]
  assert.equal(tool.type, 'web_search_20260209')
  assert.deepEqual(tool.allowed_domains, ['eqlwiki.com', 'reddit.com'])
  assert.equal(r.answer, 'Skeletons drop them.')
  assert.deepEqual(r.citations, [{ url: 'https://eqlwiki.com/Bone_Chip', title: 'Bone Chip - EQL Wiki' }])
  assert.equal(tokens.join(''), 'Skeletons drop them.')
})

test('the open step sends no domain limit; an older model gets the basic search tool', async () => {
  const { body } = await search('claude-haiku-4-5', null)
  const tool = (body.tools as Record<string, unknown>[])[0]
  assert.equal(tool.type, 'web_search_20250305')
  assert.equal(tool.allowed_domains, undefined)
})
