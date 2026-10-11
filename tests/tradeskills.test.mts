// One spelling per tradeskill (src/shared/tradeskills.ts): the fold from items.json's spellings.
import test from 'node:test'
import assert from 'node:assert/strict'
import { TRADESKILLS, tradeskillOf } from '../src/shared/tradeskills.ts'

test('every canonical name folds to itself, any case, with a stray colon or space', () => {
  for (const t of TRADESKILLS) {
    assert.equal(tradeskillOf(t), t)
    assert.equal(tradeskillOf(t.toUpperCase()), t)
    assert.equal(tradeskillOf(` :${t} `), t)
  }
})

test('the wiki spellings fold to the one name', () => {
  assert.equal(tradeskillOf('Jewelry Making'), 'Jewelcrafting')
  assert.equal(tradeskillOf('Research'), 'Spell Research')
  assert.equal(tradeskillOf('Skill Research'), 'Spell Research')
  assert.equal(tradeskillOf('Spell Research - Necromancer'), 'Spell Research')
  assert.equal(tradeskillOf('Make Poison'), 'Poison Making')
  assert.equal(tradeskillOf('Brew Barrel'), 'Brewing')
  assert.equal(tradeskillOf('Skill Fletching'), 'Fletching')
})

test('what names no tradeskill folds to nothing', () => {
  for (const raw of [undefined, '', 'Non-Tradeskill', 'Non Tradeskill', 'None', 'Various Dark Elf Recipes', 'Wooly Fungus Quest', 'Cobalt drake armor']) {
    assert.equal(tradeskillOf(raw), undefined, String(raw))
  }
})
