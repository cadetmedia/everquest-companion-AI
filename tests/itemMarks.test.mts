// The list-row marks (2026-10-10): what a loot row needs about an item, read off the committed DB
// in one batched call instead of a full knowledge record per row. Pins the fold from a record to
// its marks, the notability rule on marks, and that the shipped DB answers a known item.
import test from 'node:test'
import assert from 'node:assert/strict'
import { isNotableKnowledge, isNotableMarks, marksOf, type ItemMarks } from '../src/shared/itemKnowledge.ts'
import { buildItemDbIndex, itemKey, knowledgeFromDb } from '../src/main/itemsDb.ts'
import { fetchItemMarks, itemMarksOf } from '../src/renderer/src/lib/itemMarks.ts'
import type { ItemDbFile, ItemKnowledge, LootEvent } from '../src/shared/types.ts'
import { buildDropRows } from '../src/renderer/src/features/overview/overviewData.ts'
import itemsJson from '../src/main/data/items.json' with { type: 'json' }

const record = (over: Partial<ItemKnowledge>): Omit<ItemKnowledge, 'cached'> => ({
  name: 'x',
  lore: false,
  quest: false,
  questUses: [],
  ...over
})

test('marksOf keeps the icon and reduces the lists to counts', () => {
  const m = marksOf(
    record({
      iconId: 804,
      lore: true,
      questUses: [{ quest: 'A', page: 'A', source: 'wiki' }],
      recipes: [{ recipe: 'R' }, { recipe: 'S' }],
      stats: { flags: ['Magic Item', 'No Drop'], stats: [], saves: [], effects: [], exaltationSlots: [], extras: [] }
    })
  )
  assert.deepEqual(m, { iconId: 804, lore: true, quest: false, questUses: 1, recipes: 2, noTrade: true })
  assert.deepEqual(marksOf(record({})), { lore: false, quest: false, questUses: 0, recipes: 0, noTrade: false })
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

/** A `window.eq` whose `itemMarks` answers off the shipped DB the way main does (by `itemKey`,
 *  which folds a ` +N` tier onto its base), recording every batch it is asked. */
function dbBridge(): string[][] {
  const index = buildItemDbIndex(itemsJson as unknown as ItemDbFile)
  const asked: string[][] = []
  const eq = {
    itemMarks(names: readonly string[]): Promise<Record<string, ItemMarks>> {
      asked.push([...names])
      const out: Record<string, ItemMarks> = {}
      for (const n of names) {
        const entry = index.get(itemKey(n))
        if (entry) out[n] = marksOf(knowledgeFromDb(entry))
      }
      return Promise.resolve(out)
    }
  }
  ;(globalThis as unknown as { window: unknown }).window = { eq }
  return asked
}

test('a non-notable item the probe asked for reads back with its icon, synchronously', async () => {
  // The notable-pickups probe asks `fetchItemMarks` for every recent item and fetches a record
  // only for the notable ones; the Overview's rows take the icon off the store by name, so an
  // ordinary drop (a potion: no lore, no quest) must be readable there with its id once the
  // batch lands (owner, 2026-10-12: the Recent drops card showed Arrow without one).
  const asked = dbBridge()
  const name = '10 Dose Adrenaline Tap'
  assert.equal(itemMarksOf(name), undefined, 'nothing is known before the batch')
  const got = await fetchItemMarks([name, 'Not An Item'])
  assert.equal(isNotableMarks(got[name]), false, 'ordinary: the probe fetches no record for it')
  assert.equal(itemMarksOf(name)?.iconId, 697)
  assert.equal(itemMarksOf('Not An Item'), undefined)
  assert.deepEqual(asked, [[name, 'Not An Item']], 'one batch, asked once')
  // A second ask of the same names is answered off the store, not main.
  await fetchItemMarks([name])
  assert.equal(asked.length, 1)
})

test('a `+N` tier the probe never sent still gets its icon once the surface asks its own spelling', async () => {
  // The probe sends ONE spelling per counting key (`Arrow +1` and `Arrow` fold to `arrow`) and
  // the store keys by raw name, so the Overview asks for the raw names of the rows it shows, as
  // every mounted Loot row does (owner, 2026-10-12: `Arrow +1` iconless beside an iconed `Arrow`).
  const asked = dbBridge()
  await fetchItemMarks(['Arrow']) // what the probe sent
  const history: LootEvent[] = [
    { ts: 1, item: 'Arrow' },
    { ts: 2, item: 'Arrow +1' }
  ]
  const iconOf = (item: string): number | undefined => itemMarksOf(item)?.iconId
  const before = buildDropRows(history, new Set(), new Map(), iconOf)
  assert.equal(before[1].iconId, 598)
  assert.equal(before[0].iconId, undefined, 'the tier was never asked, so the store has nothing')
  // The surface's own ask: only the spelling the store lacks goes to main.
  await fetchItemMarks(['Arrow', 'Arrow +1'])
  assert.deepEqual(asked, [['Arrow'], ['Arrow +1']])
  const after = buildDropRows(history, new Set(), new Map(), iconOf)
  assert.deepEqual(
    after.map((r) => [r.item, r.iconId]),
    [
      ['Arrow +1', 598],
      ['Arrow', 598]
    ]
  )
})
