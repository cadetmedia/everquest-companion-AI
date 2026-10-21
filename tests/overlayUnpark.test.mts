// Overlays come back on top after a long time away, never on a quick alt-tab (overlayUnpark.ts;
// owner, 2026-10-20: after a screenshot pasted into Paint "the overlays don't reappear").
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { RAISE_AFTER_AWAY_MS, raiseOnUnpark } from '../src/shared/overlayUnpark'

test('a quick alt-tab is a pure opacity flip; a long absence re-raises', () => {
  assert.equal(raiseOnUnpark(1_000, 1_000 + 1_500), false, 'the 1-3 s alt-tabs of the report stay unraised')
  assert.equal(raiseOnUnpark(1_000, 1_000 + RAISE_AFTER_AWAY_MS), true)
  assert.equal(raiseOnUnpark(1_000, 1_000 + 90_000), true, 'the 90 s screenshot-and-Paint trip of the report')
  assert.equal(raiseOnUnpark(null, 99_999), false, 'never parked, nothing to restore')
})
