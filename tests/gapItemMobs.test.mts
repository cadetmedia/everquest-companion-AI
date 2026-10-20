// The Drops domain's item-page side, read off the real committed corpus (owner ask, 2026-10-18).
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { itemPageMobs } from '../src/main/gapItemMobs'

test('an item page names its mobs once each; an item the corpus lacks is null', () => {
  const out = itemPageMobs(['Undead Froglok Tongue', 'No Such Item Anywhere'])
  assert.ok(out['Undead Froglok Tongue']?.includes('a wan ghoul knight'))
  assert.equal(new Set(out['Undead Froglok Tongue']).size, out['Undead Froglok Tongue']?.length)
  assert.equal(out['No Such Item Anywhere'], null)
})
