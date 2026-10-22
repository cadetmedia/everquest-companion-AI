// The Gaps save asks the engine only for what moved (gapSourceMoves.ts; perf audit, 2026-10-20).
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { noteModuleMoved, takeMoved } from '../src/main/gapSourceMoves'

test('a moved source is taken once; other modules moving do not count', () => {
  const ids = ['gaps', 'loot', 'kills']
  assert.equal(takeMoved(ids), false)
  noteModuleMoved('combo')
  assert.equal(takeMoved(ids), false, 'a module the save does not read is not a reason to save')
  noteModuleMoved('loot')
  noteModuleMoved('kills')
  assert.equal(takeMoved(ids), true)
  assert.equal(takeMoved(ids), false, 'taking clears')
})
