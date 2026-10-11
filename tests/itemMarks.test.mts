// The list-row marks (2026-10-10): what a loot row needs about an item, read off the committed DB
// in one batched call instead of a full knowledge record per row. Pins the fold from a record to
// its marks, the notability rule on marks, and that the shipped DB answers a known item.
import test from 'node:test'
import assert from 'node:assert/strict'
import { isNotableKnowledge, isNotableMarks, marksOf } from '../src/shared/itemKnowledge.ts'
import { buildItemDbIndex, knowledgeFromDb } from '../src/main/itemsDb.ts'
import type { ItemDbFile, ItemKnowledge } from '../src/shared/types.ts'
import itemsJson from '../src/main/data/items.json' with { type: 'json' }

const record = (over: Partial<ItemKnowledge>): Omit<ItemKnowledge, 'cached'> => ({
  name: 'x',
  lore: false,
  quest: false,
  questUses: [],
  ...over
})

test('marksOf keeps the icon, reduces the lists to counts, and names the quests and tradeskills once each', () => {
  const m = marksOf(
    record({
      iconId: 804,
      lore: true,
      questUses: [
        { quest: 'A', page: 'A', source: 'wiki' },
        { quest: 'A', source: 'quests', role: 'required' }
      ],
      recipes: [{ recipe: 'R', tradeskill: 'Baking' }, { recipe: 'S', tradeskill: 'Baking' }, { recipe: 'T' }],
      craftedBy: [{ tradeskill: 'Jewelry Making', ingredients: [] }],
      stats: { flags: ['Magic Item', 'No Drop'], stats: [], saves: [], effects: [], exaltationSlots: [], extras: [] }
    })
  )
  assert.deepEqual(m, { iconId: 804, lore: true, quest: false, questUses: 2, quests: ['A'], recipes: 3, tradeskills: ['Baking', 'Jewelcrafting'], noTrade: true })
  assert.deepEqual(marksOf(record({})), { lore: false, quest: false, questUses: 0, quests: [], recipes: 0, tradeskills: [], noTrade: false })
})

test('notability on marks is the same rule as on records', () => {
  for (const over of [{}, { lore: true }, { quest: true }, { questUses: [{ quest: 'A', page: 'A', source: 'wiki' as const }] }, { recipes: [{ recipe: 'R' }] }]) {
    const k = record(over)
    assert.equal(isNotableMarks(marksOf(k)), isNotableKnowledge({ ...k, cached: true }), JSON.stringify(over))
  }
})

test('the shipped DB answers a known item with its icon', () => {
  const index = buildItemDbIndex(itemsJson as unknown as ItemDbFile)
  const entry = index.get('bone chips')
  assert.ok(entry, 'bone chips is in the DB')
  const m = marksOf(knowledgeFromDb(entry))
  assert.equal(m.iconId, 804)
  assert.equal(m.noTrade, false)
})
