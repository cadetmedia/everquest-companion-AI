// An item record's otherNames (the wiki redirects that land on its page) find it by name, filling
// only free keys (owner, 2026-10-22: Halfling Blood -> Vial of Halfling Blood).
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { itemsByAnyName } from '../src/main/itemOtherNames'

test('A REDIRECT NAME FINDS ITS PAGE; IT NEVER DISPLACES A RECORD OF ITS OWN; NO OTHER NAMES, THE SAME MAP', () => {
  const vial = { page: 'Vial of Halfling Blood', otherNames: ['Halfling Blood', 'Rusty Mace'] }
  const mace = { page: 'Rusty Mace' }
  const items = { 'vial of halfling blood': vial, 'rusty mace': mace }
  const any = itemsByAnyName(items)
  assert.equal(any['halfling blood'], vial)
  assert.equal(any['rusty mace'], mace)
  assert.equal(Object.keys(items).length, 2, 'the file map is not changed')
  assert.equal(itemsByAnyName(items), any, 'built once per map')
  const plain = { 'rusty mace': mace }
  assert.equal(itemsByAnyName(plain), plain)
})
