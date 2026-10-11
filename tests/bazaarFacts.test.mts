// The Bazaar's facts filters (src/shared/bazaarFacts.ts): Hide No Drop, Tradeskill and Quest, on
// what the item marks say, and the Quest box's choices.
import test from 'node:test'
import assert from 'node:assert/strict'
import { factsAsked, factsPass, questNamesOf, type BazaarFacts } from '../src/shared/bazaarFacts.ts'

const none = { hideNoTrade: false, tradeskill: '', quest: '' }
const meat: BazaarFacts = { noTrade: false, tradeskills: ['Baking'], quests: ['Gnome Kabobs for Grandma'] }
const sword: BazaarFacts = { noTrade: true, tradeskills: [], quests: ['Warrior · Test of Blood'] }

test('nothing asked keeps everything, known or not', () => {
  assert.equal(factsAsked(none), false)
  assert.equal(factsAsked({ ...none, quest: '  ' }), false)
  for (const f of [meat, sword, undefined]) assert.equal(factsPass(f, none), true)
})

test('Hide No Drop leaves out only what the wiki marks', () => {
  const f = { ...none, hideNoTrade: true }
  assert.equal(factsAsked(f), true)
  assert.equal(factsPass(sword, f), false)
  assert.equal(factsPass(meat, f), true)
  assert.equal(factsPass(undefined, f), true, 'an unknown item is not marked')
})

test('Tradeskill keeps what that skill uses or makes; an unknown item is not known to', () => {
  const f = { ...none, tradeskill: 'Baking' }
  assert.equal(factsPass(meat, f), true)
  assert.equal(factsPass(sword, f), false)
  assert.equal(factsPass(undefined, f), false)
  assert.equal(factsPass(meat, { ...none, tradeskill: 'Pottery' }), false)
})

test('Quest matches part of a quest name, any case, and stacks with the others', () => {
  assert.equal(factsPass(meat, { ...none, quest: 'grandma' }), true)
  assert.equal(factsPass(meat, { ...none, quest: ' Kabobs ' }), true)
  assert.equal(factsPass(sword, { ...none, quest: 'test of blood' }), true)
  assert.equal(factsPass(meat, { ...none, quest: 'blood' }), false)
  assert.equal(factsPass(undefined, { ...none, quest: 'blood' }), false)
  assert.equal(factsPass(sword, { hideNoTrade: true, tradeskill: '', quest: 'blood' }), false, 'No Drop still hides it')
})

test('the Quest box offers every quest of the listed items once, sorted', () => {
  const facts: Record<string, BazaarFacts> = { 'Gnome Meat': meat, 'A Sword': sword, Spices: { ...meat, quests: ['Gnome Kabobs for Grandma'] } }
  assert.deepEqual(questNamesOf(['Spices', 'A Sword', 'Gnome Meat', 'Unknown'], (n) => facts[n]), ['Gnome Kabobs for Grandma', 'Warrior · Test of Blood'])
  assert.deepEqual(questNamesOf([], () => undefined), [])
})
