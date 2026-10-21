// The Event log's Wiki Gaps marks (feedGapTags.ts): the KEEP row a merchant's offer for a gap item
// makes (owner ask, 2026-10-20: "just simply KEEP - Needed on wiki"), and the Done rule over it.
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { hiddenKeep, screenshotLabel } from '../src/renderer/src/overlay/feedGapTags'
import type { FeedEvent } from '../src/shared/types'

const keep: FeedEvent = { id: 'f1', kind: 'keep', ts: 1, title: 'Fungus Spores' }

test('a KEEP row for a gap item not marked Done is shown with the short mark and nothing else', () => {
  const none = new Set<string>()
  assert.equal(screenshotLabel(keep, none), 'KEEP · needed on wiki')
  assert.equal(hiddenKeep(keep, none), false)
  assert.equal(keep.detail, undefined, 'no price, no merchant')
})

test('a KEEP row whose item is marked Done, whatever the case, is hidden; another domain\'s mark does not hide it', () => {
  assert.equal(hiddenKeep(keep, new Set(['item:fungus spores'])), true)
  assert.equal(screenshotLabel(keep, new Set(['item:fungus spores'])), undefined)
  assert.equal(hiddenKeep(keep, new Set(['mob:fungus spores'])), false)
})

test('the other marks keep their rules, and a loot row is never hidden by the KEEP rule', () => {
  const loot: FeedEvent = { id: 'f2', kind: 'loot', ts: 1, title: 'Fungus Spores', unknown: true }
  assert.equal(hiddenKeep(loot, new Set(['item:fungus spores'])), false)
  assert.equal(screenshotLabel(loot, new Set()), 'missing · screenshot it')
  assert.equal(screenshotLabel(loot, new Set(['item:fungus spores'])), undefined)
  const con: FeedEvent = { id: 'f3', kind: 'con', ts: 1, title: 'a froglok', needsImage: true }
  assert.equal(screenshotLabel(con, new Set()), 'no picture · screenshot it')
  assert.equal(screenshotLabel({ id: 'f4', kind: 'loot', ts: 1, title: 'Bone Chips' }, new Set()), undefined, 'not a gap')
})
