// The Gaps tab's one wiki read (Copy on a Quests row): through the shared client, with at most one
// more read on the same click for a `?` the wiki drops or a stub page that only links its own title's
// other spelling. `fetch` is stubbed: tests send the wiki nothing.
import { test, afterEach } from 'node:test'
import assert from 'node:assert/strict'
import { readQuestPage } from '../src/main/gapQuestLive'

const realFetch = globalThis.fetch
afterEach(() => {
  globalThis.fetch = realFetch
})

/** Pages by title; anything else is missing. Returns the titles asked for. */
function wikiOf(pages: Record<string, string>): string[] {
  const asked: string[] = []
  globalThis.fetch = ((input: string | URL | Request) => {
    const url = typeof input === 'string' ? input : input instanceof URL ? input.href : input.url
    const page = new URL(url).searchParams.get('page') ?? ''
    asked.push(page)
    const text = pages[page]
    return Promise.resolve(text === undefined ? Response.json({ error: { code: 'missingtitle' } }) : Response.json({ parse: { title: page, wikitext: text } }))
  }) as typeof fetch
  return asked
}

const STUB = '{| class="questTopTable"\n! Starts In:\n| ?\n|}\n\n[[Unfortunate News]]\n\n[[Category:Quests]]'

test('A STUB THAT ONLY LINKS ITS OTHER SPELLING IS FOLLOWED ONCE, AND NAMED', async () => {
  const asked = wikiOf({ 'Unfortunate news': STUB, 'Unfortunate News': '= Walkthrough =\nHand it in.' })
  assert.deepEqual(await readQuestPage('Unfortunate news'), { title: 'Unfortunate News', text: '= Walkthrough =\nHand it in.', stubOf: 'Unfortunate news' })
  assert.deepEqual(asked, ['Unfortunate news', 'Unfortunate News'])
})

test('A TRAILING ? THE WIKI DROPS IS ASKED ONCE WITHOUT IT; A PAGE IT LACKS EITHER WAY IS EMPTY', async () => {
  const asked = wikiOf({ "What's going on here": 'Talk to Nikko.' })
  assert.deepEqual(await readQuestPage("What's going on here?"), { title: "What's going on here", text: 'Talk to Nikko.' })
  assert.deepEqual(asked, ["What's going on here?", "What's going on here"])
  wikiOf({})
  assert.deepEqual(await readQuestPage('Nowhere Quest'), { title: 'Nowhere Quest', text: '' })
})
