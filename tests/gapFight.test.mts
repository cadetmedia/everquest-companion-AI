// A mob's fight numbers on its new page (owner, 2026-10-23: "can we estimate NPC HP attacks etc etc
// etc if we have 10 or more kills of the mob?"): base tier only, each past its count, marked estimates.
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { fightFields, fightLines, withFightFields, type FightTier } from '../src/shared/gapFight'
import { wikiPageText } from '../src/shared/wikiPage'
import type { GapDomain, GapRow } from '../src/shared/gaps'

const base: FightTier = { tier: 0, kills: 642, fights: 209, hp: 2301, hits: 1322, hitMin: 4, hitMax: 99, attacks: ['bash', 'cleave', 'slash'], swings: 3 }
const plus4: FightTier = { tier: 4, kills: 30, fights: 20, hp: 6146, hits: 400, hitMin: 4, hitMax: 111, attacks: ['backstab', 'slash'], swings: 4 }

function giant(fight: FightTier[], domain: GapDomain = 'mob', extra: Partial<GapRow> = {}): GapRow {
  const row: GapRow = { domain, name: 'a hill giant', kinds: ['killed'], count: 1, first: '', last: '', details: { samples: [] }, ...extra }
  return Object.assign(row, { fight })
}

/** The page's `| key = value` line for a field, as layoutBlock pads it. */
const field = (key: string, value: string): string => `| ${key.padEnd(17)} = ${value}\n`

test('a new mob page takes HP, damage_per_hit and attacks_per_round from the base tier, each marked an estimate', () => {
  const page = wikiPageText(giant([base, plus4]), [], {})
  assert.ok(page.includes(field('HP', '~2301 (estimate from 209 kills)')), page)
  assert.ok(page.includes(field('damage_per_hit', '4 - 99 (estimate from 642 kills)')), page)
  assert.ok(page.includes(field('attacks_per_round', 'up to 3 (estimate from 209 kills)')), page)
  // The log shows none of these: they stay blank for the player.
  for (const key of ['AC', 'attack_speed', 'agro_radius', 'run_speed', 'HP_regen', 'mana_regen']) assert.ok(page.includes(field(key, '')), key)
  // Attack kinds are no page field; +4's numbers never reach the base page.
  assert.ok(!page.includes('6146') && !page.includes('111') && !page.includes('backstab'), page)
})

test('a mob with 9 kills seen whole gets nothing, and one killed only at +4 gets nothing', () => {
  const nine: FightTier = { tier: 0, kills: 9, fights: 9, hp: 2300, hits: 90, hitMin: 4, hitMax: 99, attacks: ['slash'], swings: 3 }
  assert.deepEqual(fightFields(giant([nine])), {})
  assert.deepEqual(fightFields(giant([plus4])), {})
  // Many kills but only 9 seen whole: the hit range stands, HP and the round wait.
  assert.deepEqual(Object.keys(fightFields(giant([{ ...base, fights: 9 }]))), ['damage_per_hit'])
  // A mob that landed a blow or two on a high-level player has no range to give.
  assert.equal(fightFields(giant([{ ...base, hits: 1, hitMin: 1, hitMax: 1 }])).damage_per_hit, undefined)
})

test("a page that exists is never written over: a redirect's page and a merchant's take no fight numbers", () => {
  assert.deepEqual(fightFields(giant([base], 'mob', { viaRedirect: 'A Hill Giant' })), {})
  // A merchant row's NPC may have a page of its own: its text carries no estimate.
  const merchant = wikiPageText(giant([base], 'merchant'), [], {})
  assert.ok(merchant.includes(field('HP', '')) && !merchant.includes('estimate'), merchant)
  // Only a blank field is filled: a value the page states stays as it is.
  const stated = `${field('HP', '2477')}${field('damage_per_hit', '')}`
  assert.equal(withFightFields(stated, giant([base])), `${field('HP', '2477')}${field('damage_per_hit', '4 - 99 (estimate from 642 kills)')}`)
})

test('the details show every tier on its own line, base first', () => {
  assert.deepEqual(fightLines(giant([base, plus4])), [
    'Fights at +0: 642 kills, 209 seen whole · HP ~2301 · hits 4 - 99 · up to 3 a round · bash, cleave, slash',
    'Fights at +4: 30 kills, 20 seen whole · HP ~6146 · hits 4 - 111 · up to 4 a round · backstab, slash'
  ])
  assert.deepEqual(fightLines(giant([])), [])
})
