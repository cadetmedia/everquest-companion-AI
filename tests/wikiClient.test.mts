// wikiClient.test.mts — the shared eqlwiki client behind itemLookup.ts and mobLookup.ts.
//
// The two services used to carry hand copies of this client; they share the spelling now and
// each creates its OWN instance. What is pinned here is the contract both copies had: a 429/5xx
// silences that client for the server's Retry-After, a missing page reads as '' and a network
// failure as null, and the queue runs jobs one at a time. And the one property the merge must not
// lose: two clients do not share a cooldown.

import { test, afterEach } from 'node:test'
import assert from 'node:assert/strict'
import { createWikiClient } from '../src/main/wikiClient'

const realFetch = globalThis.fetch
afterEach(() => {
  globalThis.fetch = realFetch
})

/** Replace `fetch` with a scripted responder; returns the list of URLs asked for. */
function stubFetch(respond: (url: string) => Response): string[] {
  const asked: string[] = []
  globalThis.fetch = ((input: string | URL | Request) => {
    const url = typeof input === 'string' ? input : input instanceof URL ? input.href : input.url
    asked.push(url)
    return Promise.resolve(respond(url))
  }) as typeof fetch
  return asked
}

test('a 429 silences THAT client for Retry-After — and only that client', async () => {
  const asked = stubFetch(() => new Response('', { status: 429, headers: { 'retry-after': '60' } }))
  const a = createWikiClient()
  const b = createWikiClient()
  assert.equal(await a.searchTitles('Fippy Darkpaw'), null)
  assert.equal(asked.length, 1)
  // a is cooling down: no request at all.
  assert.equal(await a.fetchWikitext('Fippy Darkpaw'), null)
  assert.equal(asked.length, 1)
  // b has its own state and still asks.
  assert.equal(await b.searchTitles('Fippy Darkpaw'), null)
  assert.equal(asked.length, 2)
})

test('search hits, a zero-hit search, a missing page and a page body read as before', async () => {
  stubFetch((url) => {
    const q = new URL(url).searchParams
    assert.equal(q.get('format'), 'json')
    assert.equal(q.get('formatversion'), '2')
    if (q.get('action') === 'query') {
      const hits = q.get('srsearch') === 'nothing' ? [] : [{ title: 'Rusty Dagger' }]
      assert.equal(q.get('srlimit'), '8')
      return Response.json({ query: { search: hits } })
    }
    if (q.get('page') === 'Missing') return Response.json({ error: { code: 'missingtitle' } })
    return Response.json({ parse: { wikitext: '{{Itempage}}' } })
  })
  const c = createWikiClient()
  assert.deepEqual(await c.searchTitles('rusty dagger'), [{ title: 'Rusty Dagger' }])
  assert.deepEqual(await c.searchTitles('nothing'), [])
  assert.equal(await c.fetchWikitext('Missing'), '')
  assert.equal(await c.fetchWikitext('Rusty Dagger'), '{{Itempage}}')
})

test('a network failure is null, never a negative', async () => {
  globalThis.fetch = (() => Promise.reject(new Error('offline'))) as typeof fetch
  const c = createWikiClient()
  assert.equal(await c.searchTitles('anything'), null)
  assert.equal(await c.fetchWikitext('anything'), null)
})

test('the queue runs one job at a time and survives a job that throws', async () => {
  const c = createWikiClient()
  const order: string[] = []
  const first = c.enqueue(async () => {
    order.push('first:start')
    await new Promise((r) => setTimeout(r, 5))
    order.push('first:end')
    throw new Error('boom')
  })
  const second = c.enqueue(() => {
    order.push('second')
    return Promise.resolve(2)
  })
  await assert.rejects(first, /boom/)
  assert.equal(await second, 2)
  assert.deepEqual(order, ['first:start', 'first:end', 'second'])
})

test('fetchPage names the page a redirect landed on, and reads a missing page as empty text', async () => {
  stubFetch((url) => {
    const q = new URL(url).searchParams
    assert.equal(q.get('redirects'), '1')
    if (q.get('page') === 'Missing') return Response.json({ error: { code: 'missingtitle' } })
    return Response.json({ parse: { title: "What's going on here", wikitext: '{{Classic Era}}' } })
  })
  const c = createWikiClient()
  assert.deepEqual(await c.fetchPage('What`s going on here?'), { title: "What's going on here", text: '{{Classic Era}}' })
  assert.deepEqual(await c.fetchPage('Missing'), { title: 'Missing', text: '' })
})
