// The Event log reads the Gaps tab's Done marks (doneMarksStore.ts; owner, 2026-10-20: "if i've
// marked it done, don't tell me it needs a screenshot still").
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { isMarkedDone } from '../src/renderer/src/features/gaps/doneMarksStore'

test('a mark matches its domain and name whatever the case; another domain does not', () => {
  const done = new Set(['image:a froglok gaz warrior', 'item:moccasin eggs'])
  assert.equal(isMarkedDone(done, 'image', 'A froglok gaz warrior'), true, 'a con sentence-cases the article')
  assert.equal(isMarkedDone(done, 'item', 'Moccasin Eggs'), true)
  assert.equal(isMarkedDone(done, 'mob', 'A froglok gaz warrior'), false, 'a Mobs mark is not an Images mark')
  assert.equal(isMarkedDone(done, 'image', 'A froglok tad'), false)
})
