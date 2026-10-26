// The message overlay, served apart from the buffs snapshot (perf review 2026-10-20, second pass
// item 3): put back for what a segment keeps on disk, never brought back by the archive merge.
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { buffsWithOverlay, MESSAGE_OVERLAY_MODULE, withMessageOverlay } from '../src/shared/buffsMessageOverlay'
import { capturedState } from '../src/shared/logArchive/capturedShape'
import { mergeModule } from '../src/shared/logArchive/mergeRules'

const overlay = { version: 1, updatedAt: '', messages: [{ text: 'You feel different.', role: 'landing', verdict: 'shared', spells: [], total: 2 }], stats: { verified: 0, shared: 1, contradictions: 0, unknown: 0 } }
const stat = { n: 1, medianMs: 60_000 }
const slim = { active: [], stats: { bramblecoat: stat } }

test('a captured buffs state gets the overlay back; one that carries an overlay keeps it; no module, no change', async () => {
  assert.deepEqual(withMessageOverlay(slim, overlay), { ...slim, overlay })
  const carried = { ...slim, overlay: { ...overlay, messages: [] } }
  assert.equal(withMessageOverlay(carried, overlay), carried)
  assert.equal(withMessageOverlay(slim, null), slim)
  assert.equal(withMessageOverlay(slim, []), slim)
  assert.equal(withMessageOverlay(null, overlay), null)
  assert.equal(await buffsWithOverlay(slim, () => Promise.reject(new Error('an engine from before'))), slim)
})

test('a capture asks the module each served-apart part lives in, and only for those', async () => {
  const asked: string[] = []
  const read = (m: string): Promise<unknown> => {
    asked.push(m)
    return Promise.resolve(m === MESSAGE_OVERLAY_MODULE ? overlay : [])
  }
  assert.deepEqual(await capturedState('buffs', slim, read), { ...slim, overlay })
  const gaps = { rows: [], totals: {}, seen: {}, killFactions: [] }
  assert.equal(await capturedState('gaps', gaps, read), gaps)
  assert.equal(await capturedState('loot', slim, read), slim)
  assert.deepEqual(asked, [MESSAGE_OVERLAY_MODULE, 'killFactionSamples'])
})

test("the archive merge keeps the stats and never brings an archived overlay back", () => {
  const archived = { active: [], stats: { 'spirit of wolf': stat }, overlay }
  const merged = mergeModule('buffs', [archived], slim)
  assert.equal(merged.used, 1)
  assert.deepEqual(merged.state, { active: [], stats: { 'spirit of wolf': stat, bramblecoat: stat } })
})
