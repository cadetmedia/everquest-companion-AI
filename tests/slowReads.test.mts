// The slow-read log (slowReads.ts): what a tester can send when the app feels slow (owner, 2026-10-20).
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { mkdtempSync, readFileSync, rmSync, writeFileSync, existsSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { appendSlowReads, createSlowReads, SLOW_READ_MS } from '../src/main/dataServer/slowReads'

const AT = new Date('2026-10-20T21:40:00.000Z')

test('fast served reads write nothing; slow and unserved ones are tallied per op, once', () => {
  const t = createSlowReads()
  t.record('module.snapshot', 3)
  assert.deepEqual(t.drain(AT), [])
  t.record('combat.snapshot', SLOW_READ_MS + 100)
  t.record('combat.snapshot', 1840)
  t.record('combat.snapshot', 2001, 'the engine did not answer in time')
  t.record('combat.snapshot', 0, 'the engine is still folding')
  t.record('module.snapshot', 900)
  assert.deepEqual(t.drain(AT), [
    '2026-10-20T21:40:00.000Z combat.snapshot: 2 slow, 2 unserved (the engine did not answer in time ×1, the engine is still folding ×1) (max 2001 ms)',
    '2026-10-20T21:40:00.000Z module.snapshot: 1 slow (max 900 ms)'
  ])
  assert.deepEqual(t.drain(AT), [], 'a drain empties the tally')
})

test('the file is appended to, and moved aside once it passes its cap', () => {
  const dir = mkdtempSync(join(tmpdir(), 'slowreads-'))
  try {
    appendSlowReads(dir, [])
    assert.equal(existsSync(join(dir, 'slow-reads.log')), false, 'nothing to say writes no file')
    appendSlowReads(dir, ['a', 'b'])
    assert.equal(readFileSync(join(dir, 'slow-reads.log'), 'utf8'), 'a\nb\n')
    writeFileSync(join(dir, 'slow-reads.log'), 'x'.repeat(300 * 1024))
    appendSlowReads(dir, ['c'])
    assert.equal(readFileSync(join(dir, 'slow-reads.log'), 'utf8'), 'c\n')
    assert.ok(existsSync(join(dir, 'slow-reads.old.log')))
  } finally {
    rmSync(dir, { recursive: true, force: true })
  }
})
