// wikiUsage.test.mts — the app's own wiki requests are counted (owner, 2026-10-23: "Tie any and all API
// calls into that"), written to this machine's ledger, and every one names the fork. fetch is stubbed.

import { test, afterEach } from 'node:test'
import assert from 'node:assert/strict'
import { mkdtempSync, readFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { createWikiClient } from '../src/main/wikiClient'
import { resetWikiUsage, setWikiUsageFile, WIKI_UA, wikiKindOf, wikiUsageSummary } from '../src/main/wikiUsage'

const realFetch = globalThis.fetch
afterEach(() => {
  globalThis.fetch = realFetch
  setWikiUsageFile(null)
  resetWikiUsage()
})

function stubFetch(respond: () => Response): string[] {
  const agents: string[] = []
  globalThis.fetch = ((_input: string | URL | Request, init?: RequestInit) => {
    agents.push((init?.headers as Record<string, string>)['User-Agent'])
    return Promise.resolve(respond())
  }) as typeof fetch
  return agents
}

test('each request is counted under its feature, with its bytes, and written to the ledger', async () => {
  const file = join(mkdtempSync(join(tmpdir(), 'wiki-usage-')), 'wiki-requests.jsonl')
  setWikiUsageFile(file)
  const body = JSON.stringify({ parse: { title: 'A Nektulos spiderling', wikitext: '{{Namedmobpage}}' } })
  const agents = stubFetch(() => new Response(body, { status: 200 }))
  const page = await createWikiClient('mob lookup').fetchPage('A Nektulos spiderling')
  assert.equal(page?.text, '{{Namedmobpage}}')
  assert.match(agents[0], /github\.com\/kaltinril\/everquest-companion/)
  assert.equal(agents[0], WIKI_UA)
  const lines = readFileSync(file, 'utf8').trim().split('\n').map((l) => JSON.parse(l))
  assert.equal(lines.length, 1)
  assert.equal(lines[0].feature, 'mob lookup')
  assert.equal(lines[0].kind, 'parse/wikitext')
  assert.equal(lines[0].host, 'eqlwiki.com')
  assert.equal(lines[0].bytes, Buffer.byteLength(body))
  assert.match(wikiUsageSummary() ?? '', /wiki requests this session: 1 .*mob lookup 1/)
})

test('a refused or failed request still counts, as an error', async () => {
  stubFetch(() => new Response('', { status: 429, headers: { 'retry-after': '60' } }))
  assert.equal(await createWikiClient('item lookup').fetchWikitext('X'), null)
  globalThis.fetch = (() => Promise.reject(new Error('offline'))) as typeof fetch
  assert.equal(await createWikiClient('item lookup').searchTitles('X'), null)
  assert.match(wikiUsageSummary() ?? '', /: 2 \(0\.0 KB, 2 errors\): item lookup 2/)
})

test('nothing sent, nothing said; kinds read as the scripts\' ledger writes them', () => {
  assert.equal(wikiUsageSummary(), null)
  assert.equal(wikiKindOf({ action: 'query', list: 'search' }), 'query/search')
  assert.equal(wikiKindOf({ action: 'parse' }), 'parse')
})
