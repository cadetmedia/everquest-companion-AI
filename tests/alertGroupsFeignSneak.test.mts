// The failed-feign and failed-sneak alert sets (owner, 2026-10-25, fork issue #3): each fires on
// its measured line, as the engine tests a raw trigger (the whole line, timestamp included,
// case-insensitive), and on nothing that only looks like it.
//
// Run: `npm test`.

import { test } from 'node:test'
import assert from 'node:assert/strict'
import { ALERT_GROUPS, VERIFIED_ALERT_GROUPS, alertGroupDefs } from '../src/shared/alertGroups'
import { REFUSED_ALERT_GROUPS } from '../src/shared/alertGroupsRefused'

const TS = '[Sat Oct 10 15:21:08 2026] '

/** Whether a group's one def fires on `line`, the way alerts_rules.rs tests `ev.raw`. */
function fires(groupId: string, line: string): boolean {
  const group = VERIFIED_ALERT_GROUPS.find((g) => g.id === groupId)
  assert.ok(group, `${groupId} is offered`)
  const [def] = alertGroupDefs(group)
  assert.equal(def.trigger.type, 'raw')
  if (def.trigger.type !== 'raw') return false
  return new RegExp(def.trigger.regex, 'i').test(line)
}

test('a failed feign fires on the player and on a groupmate (owner log, 2026-10-25)', () => {
  assert.equal(fires('feignDeath', `${TS}Drywrought has fallen to the ground.`), true)
  assert.equal(fires('feignDeath', `${TS}Kamas has fallen to the ground.`), true)
})

test('a failed feign does not fire on chat quoting it or on a two-word name', () => {
  assert.equal(fires('feignDeath', `${TS}Kamas tells the group, 'Drywrought has fallen to the ground.'`), false)
  assert.equal(fires('feignDeath', `${TS}a gnoll pup has fallen to the ground.`), false)
  assert.equal(fires('feignDeath', `${TS}You are no longer feigning death, because a spell hit you.`), false)
})

test('a failed sneak fires on the elephants line and not on the success line', () => {
  assert.equal(fires('sneak', `${TS}You are as quiet as a herd of running elephants.`), true)
  assert.equal(fires('sneak', `${TS}You are as quiet as a cat stalking its prey.`), false)
  assert.equal(fires('sneak', `${TS}Kamas tells the group, 'You are as quiet as a herd of running elephants.'`), false)
})

test('feign death left the refusal register, and no group id appears twice', () => {
  assert.equal(REFUSED_ALERT_GROUPS.some((g) => g.id === 'feignDeath'), false)
  const ids = ALERT_GROUPS.map((g) => g.id)
  assert.equal(new Set(ids).size, ids.length)
  const defIds = ALERT_GROUPS.flatMap((g) => g.defs.map((d) => d.id))
  assert.equal(new Set(defIds).size, defIds.length)
})
