// logArchiveCarryOver.test.mts — the present across a rotation (shared/logArchive/carryOver.ts; owner,
// 2026-10-25: an automatic archive at 17:20 started a fresh log mid-fight in Nektropos Castle, and
// Zone I'm in went blank until the next zone line). The archived `character` state below is the one
// that archive kept.
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { CARRY_OVER, carriedValue, carryOverRule } from '../src/shared/logArchive/carryOver'
import { hasMergeRule, mergeModule } from '../src/shared/logArchive/mergeRules'
import { mergeRespawn } from '../src/shared/logArchive/mergeRespawn'

const ref = { name: 'Drywrought', server: 'oggok', logPath: 'C:/EQ/Logs/eqlog_Drywrought_oggok.txt' }
const ARCHIVED = { character: ref, level: { level: 50, source: 'who', ts: 1792972994000 }, zone: 'Nektropos Castle' }

test('A FRESH LOG WITH NO ZONE LINE SHOWS THE ZONE AND LEVEL THE ARCHIVE ENDED IN', () => {
  assert.ok(hasMergeRule('character'))
  const live = { character: { ...ref, lastPlayed: 5 } }
  const merged = mergeModule('character', [ARCHIVED], live).state as Record<string, unknown>
  assert.equal(merged.zone, 'Nektropos Castle')
  assert.deepEqual(merged.level, ARCHIVED.level)
  // Who you are is the live log's, last-played stamp and all.
  assert.deepEqual(merged.character, live.character)
})

test("THE LIVE LOG'S OWN ZONE LINE AND LEVEL WIN THE MOMENT IT HAS THEM", () => {
  const live = { character: ref, zone: 'Lake Nerius', level: { level: 51, source: 'ding', ts: 1793000000000 } }
  const merged = mergeModule('character', [ARCHIVED], live).state as Record<string, unknown>
  assert.equal(merged.zone, 'Lake Nerius')
  assert.equal((merged.level as { level: number }).level, 51)
})

test('THE NEWEST ARCHIVE THAT STATES A FIELD GIVES IT; NOTHING IS INVENTED', () => {
  const older = { character: ref, zone: 'Freeport' }
  const newer = { character: ref, zone: '' }
  const merged = mergeModule('character', [older, newer], { character: ref }).state as Record<string, unknown>
  assert.equal(merged.zone, 'Freeport')
  const none = mergeModule('character', [{ character: ref }], { character: ref }).state as Record<string, unknown>
  assert.equal(Object.hasOwn(none, 'zone'), false)
  assert.equal(Object.hasOwn(none, 'level'), false)
  assert.equal(carryOverRule('character')('not an object', { character: ref }), null)
})

test('ONE TABLE NAMES THE CARRIED FIELDS, AND THE TIMERS HEADER USES THE SAME RULE', () => {
  assert.deepEqual(CARRY_OVER.character, ['zone', 'level'])
  assert.deepEqual(CARRY_OVER.respawn, ['zone'])
  assert.equal(carriedValue('Nektropos Castle', ''), 'Nektropos Castle')
  assert.equal(carriedValue('Nektropos Castle', 'Lake Nerius'), 'Lake Nerius')
  const snap = (zone: string): unknown => ({ v: 4, zone, rows: [], recent: [] })
  assert.equal(mergeRespawn(snap('Nektropos Castle'), snap(''))?.zone, 'Nektropos Castle')
  assert.equal(mergeRespawn(snap('Nektropos Castle'), snap('Lake Nerius'))?.zone, 'Lake Nerius')
})
