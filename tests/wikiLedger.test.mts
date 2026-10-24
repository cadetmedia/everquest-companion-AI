// The scripts' wiki ledger (scripts/sources/wikiLedger.ts): every attempt through wikiApi.ts and the
// delta's own client is counted, and a run writes one line. fetch is stubbed; nothing is sent.
import { test, type TestContext } from 'node:test'
import assert from 'node:assert/strict'
import { mkdtempSync, readFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { USER_AGENT, useWikiClock, wikiFile, wikiGet, withForkUrl } from '../scripts/sources/wikiApi'
import { changedPages, pacing } from '../scripts/sources/deltaApi'
import { flushWikiLedger, kindOf, ledgerTarget, resetWikiLedger, setWikiRun, wikiRunSummary } from '../scripts/sources/wikiLedger'

function quiet(t: TestContext): void {
  let now = 1_000_000
  t.after(useWikiClock({ now: () => now, sleep: async (ms) => void (now += ms) }))
  resetWikiLedger()
  t.after(resetWikiLedger)
}

function replies(t: TestContext, ...rs: (() => Response)[]): RequestInit[] {
  const inits: RequestInit[] = []
  t.mock.method(globalThis, 'fetch', async (_url: string, init: RequestInit) => {
    inits.push(init)
    return (rs[inits.length - 1] ?? rs[rs.length - 1])()
  })
  return inits
}

test('each attempt is counted with its kind, status and bytes; a retry is marked', async (t) => {
  quiet(t)
  const body = JSON.stringify({ parse: { title: 'Unfortunate News', wikitext: 'x' } })
  replies(t, () => new Response('', { status: 503 }), () => new Response(body, { status: 200 }))
  await wikiGet({ action: 'parse', page: 'Unfortunate News', prop: 'wikitext' })
  const s = wikiRunSummary()
  assert.equal(s.requests, 2)
  assert.equal(s.retries, 1)
  assert.equal(s.errors, 1)
  assert.equal(s.bytes, Buffer.byteLength(body))
  assert.deepEqual(s.statuses, { '200': 1, '503': 1 })
  assert.deepEqual(s.hosts, { 'eqlwiki.com': 2 })
  assert.equal(s.byKind['parse/wikitext'].n, 2)
})

test('an API error body counts as an error, and a file download counts its bytes', async (t) => {
  quiet(t)
  replies(
    t,
    () => new Response(JSON.stringify({ error: { code: 'missingtitle' } }), { status: 200 }),
    () => new Response(new Uint8Array([137, 80, 78, 71, 1, 2]), { status: 200 })
  )
  await assert.rejects(wikiGet({ action: 'parse', page: 'Nope' }))
  const res = await wikiFile('https://eqlwiki.com/images/a/ab/Npc_x.png')
  assert.equal(res.bodyUsed, false, 'the caller still reads the file')
  const s = wikiRunSummary()
  assert.equal(s.errors, 1)
  assert.deepEqual(s.byKind.file, { n: 1, bytes: 6 })
})

test("the delta's own client is counted too", async (t) => {
  quiet(t)
  pacing.delayMs = 0
  t.after(() => void (pacing.delayMs = 1000))
  replies(t, () => new Response(JSON.stringify({ query: { recentchanges: [] } }), { status: 200 }))
  await changedPages('2026-10-01T00:00:00Z', '2026-10-01T00:00:00Z')
  assert.equal(wikiRunSummary().byKind['query/recentchanges'].n, 1)
})

test('every call names the fork: a caller\'s own User-Agent gains its address', async (t) => {
  quiet(t)
  const inits = replies(t, () => new Response('{}', { status: 200 }))
  await wikiGet({ action: 'query', meta: 'siteinfo' }, 'https://wiki.project1999.com/api.php', 'Mozilla/5.0 everquest-companion/0.2 (personal raid tracker)')
  const ua = (inits[0].headers as Record<string, string>)['User-Agent']
  assert.match(ua, /github\.com\/kaltinril\/everquest-companion/)
  assert.match(USER_AGENT, /github\.com\/kaltinril\/everquest-companion/)
  assert.equal(withForkUrl(USER_AGENT), USER_AGENT, 'never added twice')
  assert.equal(kindOf({ action: 'query', meta: 'siteinfo' }), 'query/siteinfo')
})

test('a run writes one line, once, where WIKI_LEDGER says; tests and off write nothing', async (t) => {
  quiet(t)
  assert.equal(ledgerTarget({ NODE_TEST_CONTEXT: 'child' }), null)
  assert.equal(ledgerTarget({ WIKI_LEDGER: 'off' }), null)
  assert.match(ledgerTarget({}) ?? '', /docs[\\/]community[\\/]wiki-usage[\\/]ledger\.jsonl$/)
  const file = join(mkdtempSync(join(tmpdir(), 'wiki-ledger-')), 'ledger.jsonl')
  process.env.WIKI_LEDGER = file
  t.after(() => void delete process.env.WIKI_LEDGER)
  replies(t, () => new Response('{"query":{}}', { status: 200 }))
  setWikiRun('ad-hoc', 'checking the ledger')
  await wikiGet({ action: 'query', list: 'allimages' })
  assert.ok(flushWikiLedger())
  assert.equal(flushWikiLedger(), null, 'once')
  const lines = readFileSync(file, 'utf8').trim().split('\n')
  assert.equal(lines.length, 1)
  const line = JSON.parse(lines[0])
  assert.equal(line.script, 'ad-hoc')
  assert.equal(line.reason, 'checking the ledger')
  assert.equal(line.requests, 1)
})
