// The assistant's source order (cadetmedia fork owner, 2026-10-31): the app's own wiki data, then
// the trusted sources, then other sources only on the player's yes. The pure rules, then the order
// itself with a stand-in model and a stand-in web search.
import test, { mock } from 'node:test'
import assert from 'node:assert/strict'
import {
  bareDomains,
  classify,
  DEFAULT_TRUSTED_SOURCES,
  matchesSource,
  NO_ANSWER_IN_SCOPE,
  NOT_IN_LOCAL_DATA,
  parseSourceFields,
  parseSourceList,
  saysNotFound,
  SentinelGate,
  tierOf
} from '../src/shared/aiSources'

test('a source entry is a site, or a site with a path; subdomains count, look-alikes do not', () => {
  assert.ok(matchesSource('https://eqlwiki.com/Crushbone', 'eqlwiki.com'))
  assert.ok(matchesSource('https://www.eqlwiki.com/x', 'eqlwiki.com'))
  assert.ok(matchesSource('https://old.reddit.com/r/EQLegends/comments/1', 'reddit.com/r/EQLegends'))
  assert.ok(!matchesSource('https://reddit.com/r/EQLegendsFakes', 'reddit.com/r/EQLegends'), 'path boundary')
  assert.ok(!matchesSource('https://reddit.com/r/everquest', 'reddit.com/r/EQLegends'))
  assert.ok(!matchesSource('https://eqlwiki.com.evil.net/x', 'eqlwiki.com'))
  assert.ok(!matchesSource('not a url', 'eqlwiki.com'))
  assert.equal(tierOf('https://wiki.project1999.com/Orc', ['eqlwiki.com'], ['wiki.project1999.com']), 'close')
  assert.equal(tierOf('https://example.com', ['eqlwiki.com'], []), 'outside')
  assert.deepEqual(bareDomains(['eqlwiki.com', 'reddit.com/r/EQLegends', 'https://www.Reddit.com/r/x']), ['eqlwiki.com', 'reddit.com'])
})

test('the trusted step keeps trusted citations only; the open step tiers them all', () => {
  const raw = [
    { url: 'https://eqlwiki.com/A', title: 'A' },
    { url: 'https://eqlwiki.com/A', title: 'dupe' },
    { url: 'https://wiki.project1999.com/B' },
    { url: 'https://example.com/C', title: 'C' },
    { url: 'http://eqlwiki.com/plain-http' }
  ]
  const trusted = classify(raw, DEFAULT_TRUSTED_SOURCES, ['wiki.project1999.com'], true)
  assert.deepEqual(trusted, [{ url: 'https://eqlwiki.com/A', title: 'A', tier: 'trusted' }])
  const open = classify(raw, DEFAULT_TRUSTED_SOURCES, ['wiki.project1999.com'], false)
  assert.deepEqual(open.map((c) => c.tier), ['trusted', 'close', 'outside'])
  assert.equal(open[1].title, 'wiki.project1999.com', 'an untitled page is named by its host')
})

test('a sentinel, even after a short preamble, means "not here"; an answer that mentions none does not', () => {
  assert.ok(saysNotFound('NOT_IN_LOCAL_DATA', NOT_IN_LOCAL_DATA))
  assert.ok(saysNotFound('Let me check the data. NOT_IN_LOCAL_DATA', NOT_IN_LOCAL_DATA))
  assert.ok(!saysNotFound('Bone Chips drop from skeletons in Crushbone.', NOT_IN_LOCAL_DATA))
  assert.ok(!saysNotFound(`${'x'.repeat(500)} ${NO_ANSWER_IN_SCOPE}`, NO_ANSWER_IN_SCOPE), 'a long real answer is not a sentinel')
})

test('the gate never lets a sentinel reach the screen, and passes everything else', () => {
  const out: string[] = []
  const gate = new SentinelGate([NOT_IN_LOCAL_DATA, NO_ANSWER_IN_SCOPE], (t) => out.push(t))
  for (const t of ['NOT_', 'IN_LOCAL', '_DATA']) gate.push(t)
  assert.deepEqual(out, [])
  const out2: string[] = []
  const g2 = new SentinelGate([NOT_IN_LOCAL_DATA], (t) => out2.push(t))
  for (const t of ['No', 'pe, Bone', ' Chips']) g2.push(t)
  assert.equal(out2.join(''), 'Nope, Bone Chips')
})

test('stored source fields are validated: only https links, known tiers and sources survive', () => {
  const f = parseSourceFields({
    source: 'trusted',
    citations: [{ url: 'https://eqlwiki.com/A', title: 'A', tier: 'trusted' }, { url: 'javascript:alert(1)', tier: 'trusted' }, { url: 'https://x.com', tier: 'bogus' }],
    widenPrompt: 'where is it'
  })
  assert.equal(f.source, 'trusted')
  assert.deepEqual(f.citations?.map((c) => [c.url, c.tier]), [['https://eqlwiki.com/A', 'trusted'], ['https://x.com', 'outside']])
  assert.equal(f.widenPrompt, 'where is it')
  assert.deepEqual(parseSourceFields({ source: 'mars' }), {})
  assert.deepEqual(parseSourceList(' eqlwiki.com \n\n eqlwiki.com\nreddit.com/r/EQLegends '), ['eqlwiki.com', 'reddit.com/r/EQLegends'])
})

// ---- the order, end to end with stand-ins ----------------------------------------------------------

interface Search { allowedDomains: string[] | null; onToken: (t: string) => void }
const searches: Search[] = []
let nextSearch: (a: Search) => { answer: string; citations: { url: string; title?: string }[] } = () => ({ answer: NO_ANSWER_IN_SCOPE, citations: [] })
class WebSearchUnsupported extends Error {}
mock.module('../src/main/ai/aiWebSearch.ts', {
  namedExports: {
    WebSearchUnsupported,
    webSearch: (a: Search & { provider: string }) => {
      if (a.provider === 'openrouter') return Promise.reject(new WebSearchUnsupported('Searching the web needs Gemini, Claude or OpenAI.'))
      searches.push(a)
      const r = nextSearch(a)
      for (const ch of r.answer.match(/.{1,6}/g) ?? []) a.onToken(ch)
      return Promise.resolve(r)
    }
  }
})
mock.module('../src/main/ai/ClaudeClient.ts', { namedExports: { claudeFail: (e: unknown) => e } })
const { answerQuestion, NOT_FOUND_TEXT } = await import('../src/main/ai/aiAnswer.ts')

function fakeClient(localAnswer: string) {
  return {
    getUsageUsd: () => Promise.resolve(null),
    sendPrompt: (_s: string, _t: string, o: { onChunk?: (c: { kind: string; text?: string }) => void }) => {
      for (const ch of localAnswer.match(/.{1,5}/g) ?? []) o.onChunk?.({ kind: 'token', text: ch })
      o.onChunk?.({ kind: 'done', text: localAnswer })
      return Promise.resolve({ text: localAnswer, drafts: [] })
    }
  }
}

function run(local: string, scope: 'auto' | 'web' = 'auto', provider = 'gemini') {
  const shown: string[] = []
  searches.length = 0
  const p = answerQuestion({
    provider: provider as 'gemini',
    key: 'k',
    model: 'm',
    client: fakeClient(local),
    baseSystem: 'sys',
    text: 'where do bone chips drop',
    history: [],
    trusted: ['eqlwiki.com', 'reddit.com/r/EQLegends'],
    close: ['wiki.project1999.com'],
    scope,
    emit: (c) => { if (c.kind === 'token' && c.text) shown.push(c.text) }
  })
  return p.then((r) => ({ r, shown: shown.join('') }))
}

test('1. the app data answers: no web search at all', async () => {
  const { r, shown } = await run('Bone Chips drop from skeletons.')
  assert.equal(r.source, 'local')
  assert.equal(searches.length, 0)
  assert.equal(shown, 'Bone Chips drop from skeletons.')
})

test('2. not in the app data: the trusted sources, limited to their domains, answer with trusted pages only', async () => {
  nextSearch = () => ({ answer: 'Skeletons in Crushbone drop them.', citations: [{ url: 'https://eqlwiki.com/Bone_Chip' }, { url: 'https://example.com/spam' }] })
  const { r, shown } = await run(NOT_IN_LOCAL_DATA)
  assert.deepEqual(searches[0].allowedDomains, ['eqlwiki.com', 'reddit.com'])
  assert.equal(r.source, 'trusted')
  assert.deepEqual(r.citations?.map((c) => c.url), ['https://eqlwiki.com/Bone_Chip'])
  assert.ok(!shown.includes(NOT_IN_LOCAL_DATA), 'the local sentinel never reaches the screen')
})

test('3. neither has it: no outside search, the player is asked', async () => {
  nextSearch = () => ({ answer: NO_ANSWER_IN_SCOPE, citations: [] })
  const { r, shown } = await run(NOT_IN_LOCAL_DATA)
  assert.equal(searches.length, 1, 'only the trusted search ran')
  assert.equal(r.askToWiden, true)
  assert.equal(r.text, NOT_FOUND_TEXT)
  assert.ok(!shown.includes(NO_ANSWER_IN_SCOPE))
})

test('a trusted-step answer that cites no trusted page was not grounded there: ask, do not show it', async () => {
  nextSearch = () => ({ answer: 'Probably skeletons.', citations: [{ url: 'https://example.com/guess' }] })
  const { r } = await run(NOT_IN_LOCAL_DATA)
  assert.equal(r.askToWiden, true)
})

test("4. the player's yes: the open web, every page tiered", async () => {
  nextSearch = () => ({ answer: 'Classic EQ says skeletons.', citations: [{ url: 'https://wiki.project1999.com/Bone_Chips' }, { url: 'https://example.com/x' }] })
  const { r } = await run('unused', 'web')
  assert.equal(searches[0].allowedDomains, null)
  assert.equal(r.source, 'web')
  assert.deepEqual(r.citations?.map((c) => c.tier), ['close', 'outside'])
})

test('OpenRouter answers from the app data, and says plainly that web search needs another provider', async () => {
  const { r } = await run(NOT_IN_LOCAL_DATA, 'auto', 'openrouter')
  assert.equal(r.source, 'none')
  assert.match(r.text, /needs Gemini, Claude or OpenAI/)
})
