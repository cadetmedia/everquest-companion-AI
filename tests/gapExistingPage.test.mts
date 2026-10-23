// A page that exists under other capitals or as free text is fixed, never made twice; links take the
// mob's page title (owner, 2026-10-22: Drake lava powder, A Fire Drake).
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { existingEditor, existingPage, existingPageAction, lookupVerdict } from '../src/shared/gapExistingPage'
import { mobPageFinder } from '../src/shared/mobPageTitle'
import { itemFacts, itemPage, withPageTitles } from '../src/shared/wikiPage'
import { gapActions, wikiEditUrl, type GapRow } from '../src/shared/gaps'
import type { LootEvent } from '../src/shared/types'

const row = (name: string): GapRow => ({ domain: 'item', name, kinds: ['looted'], count: 1, details: {} }) as unknown as GapRow

test('A CACHED LOOKUP NAMES THE PAGE THAT EXISTS: OTHER CAPITALS, FREE TEXT, THE SAME TITLE, NONE, OR A SEARCH FALLBACK', () => {
  assert.equal(lookupVerdict('Drake Lava Powder', { page: 'Drake lava powder', notItemPage: true }), 'freeText:Drake lava powder')
  assert.equal(lookupVerdict('Drake Lava Powder', { page: 'Drake lava powder' }), 'otherPage:Drake lava powder')
  assert.equal(lookupVerdict('drake Lava Powder', { page: 'Drake_Lava_Powder' }), 'hasPage', 'the first letter and underscores are free')
  assert.equal(lookupVerdict('Drake Lava Powder', { notFound: true }), 'noPage')
  assert.equal(lookupVerdict('Petamorph Wand: Gelatinous Cube', { page: 'Petamorph Wand: Murderbee' }), 'unchecked', "another name is the search's fallback, no proof")
  assert.equal(lookupVerdict('Old Entry', {}), 'hasPage', 'an older cache entry names no page')
})

test('SUCH A PAGE IS FIXED: THE ACTION AND THE ROW BUTTON OPEN ITS EDITOR, NEVER A NEW PAGE', () => {
  const v = lookupVerdict('Drake Lava Powder', { page: 'Drake lava powder', notItemPage: true })
  assert.deepEqual(existingPage(v), { title: 'Drake lava powder', freeText: true })
  const action = existingPageAction(v, wikiEditUrl)
  assert.equal(action?.label, 'Fix page')
  assert.equal(action?.href, wikiEditUrl('Drake lava powder'))
  assert.match(action?.why ?? '', /not an item or mob page yet/)
  assert.deepEqual(gapActions(row('Drake Lava Powder'), v).map((a) => a.label), ['Fix page'])
  assert.deepEqual(existingEditor(row('Drake Lava Powder'), v), { target: 'Drake lava powder', create: 'Edit existing page', existing: true })
  assert.deepEqual(existingEditor(row('Rusty Mace'), 'hasPage'), { target: 'Rusty Mace', create: 'Edit existing page', existing: true })
  assert.equal(existingEditor(row('Rusty Mace'), 'noPage'), undefined)
  assert.deepEqual(gapActions(row('Rusty Mace'), 'hasPage').map((a) => a.label), ['Re-scrape'])
})

test("A MOB'S LINK TAKES ITS PAGE TITLE; A NAME SEVERAL PAGES ANSWER, OR AN UNKNOWN ONE, STAYS AS THE LOG WROTE IT", () => {
  const find = mobPageFinder([
    { page: 'A Fire Drake', name: 'a fire drake' },
    { page: 'A bandit (Eastern Karana)', name: 'a bandit' },
    { page: 'A bandit (Lake Rathe)', name: 'a bandit' },
    { page: 'The Ghoul Lord', name: 'the ghoul lord', otherNames: ['Hoptor Thaggelum'] }
  ])
  assert.equal(find('a fire drake'), 'A Fire Drake')
  assert.equal(find('Hoptor Thaggelum'), 'The Ghoul Lord')
  assert.equal(find('a bandit'), undefined)
  assert.equal(find('a nobody'), undefined)
  const loot: LootEvent[] = [{ ts: 1, item: 'Drake Lava Powder', source: 'a fire drake', zone: 'Lavastorm Mountains' }]
  const page = itemPage(withPageTitles(itemFacts(row('Drake Lava Powder'), loot), find))
  assert.ok(page.includes('* [[A Fire Drake]]'), page)
  assert.ok(!page.includes('[[a fire drake]]'), page)
})
