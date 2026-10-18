// A KEY THE SCANNER LACKED (src/shared/itemStats.ts `repairWrappedStatKeys`).
//
// Owner report, 2026-10-11, with screenshots: Talisman of Kejaar Kerrath's page states one line,
// `HP Regen: 2 Mana Regen: 2 End Regen: 2`, and the Loot card drew "Regen 2", "Mana Regen 2 End",
// "Regen 2", "HP"; the Gear tab had HP REGEN (the bare REGEN folds to it) and no END REGEN. The
// scanner knew `Regen` and `Mana Regen` only, so the word before `Regen` became an extra and the
// one before the next key was swallowed into the value. Measured on the committed corpus: FIVE
// pages state such a key (the three regen spellings, and `ENDUR` on Kerasian Axe of Ire).
//
// The parser fix (the keys themselves) lives with the scraper fixes; this is the STORED parse,
// repaired at load like the elemental lines, so the shipped rows read right without a re-derive.

import assert from 'node:assert/strict'
import { test } from 'node:test'
import { itemKey, knowledgeFromDb, type ItemDbFile } from '../src/main/itemsDb'
import { buildGearIndex } from '../src/main/planner/gearIndex'
import { parseStatsBlock, repairWrappedStatKeys } from '../src/shared/itemStats'
import itemsJson from '../src/main/data/items.json'

const db = itemsJson as unknown as ItemDbFile
const entry = (page: string) => {
  const found = db.items[itemKey(page)]
  assert.ok(found, `${page} is in the corpus`)
  return found
}

test('THE TALISMAN: HP, Mana and End Regen 2, as the game window prints them', () => {
  const served = knowledgeFromDb(entry('Talisman of Kejaar Kerrath')).stats
  assert.deepEqual(served?.stats, [
    { key: 'HP REGEN', value: '2' },
    { key: 'MANA REGEN', value: '2' },
    { key: 'END REGEN', value: '2' }
  ])
  assert.deepEqual(served?.extras, [])
  // …and the Gear tab's index, which reads through the same load, has all three columns.
  const row = buildGearIndex(db).rows.find((r) => r.key === itemKey('Talisman of Kejaar Kerrath'))
  assert.ok(row, 'the Talisman is a gear row')
  assert.equal(row.stats.HP_REGEN, 2)
  assert.equal(row.stats.MANA_REGEN, 2)
  assert.equal(row.stats.END_REGEN, 2)
})

test('the stale rows are known by SHAPE, so the repair holds whichever parser is loaded', () => {
  // The Talisman as items.json stores it, written out so this cannot depend on the parser's keys:
  // the build that ships the fixed parser still loads this stored parse until a re-derive.
  const block = 'Lore Equipped, No Trade\n\nSlot: NECK\n\nHP Regen: 2 Mana Regen: 2 End Regen: 2 \n\nWT: 0.1 Size: TINY'
  const stale = {
    ...parseStatsBlock('Slot: NECK\n\nWT: 0.1 Size: TINY'),
    stats: [
      { key: 'REGEN', value: '2' },
      { key: 'MANA REGEN', value: '2 End' },
      { key: 'REGEN', value: '2' }
    ],
    extras: ['HP']
  }
  const repaired = repairWrappedStatKeys(stale, block)
  assert.deepEqual(repaired.stats, [
    { key: 'HP REGEN', value: '2' },
    { key: 'MANA REGEN', value: '2' },
    { key: 'END REGEN', value: '2' }
  ])
  assert.deepEqual(repaired.extras, [])
  assert.equal(repaired.slot, 'NECK')
  // …and a parse that already reads right passes through unchanged.
  assert.deepEqual(repairWrappedStatKeys(repaired, block), repaired)
})

test("the line's rows are replaced in place, and only on such a line", () => {
  const axe = entry('Kerasian Axe of Ire')
  // A stat list is a set: the page listing its stats in another order states the same item (the
  // in-place repair itself is pinned on the fixed block above).
  assert.deepEqual(
    knowledgeFromDb(axe).stats?.stats.map((s) => `${s.key}=${s.value}`).sort(),
    ['STR=+15', 'DEX=+15', 'STA=+20', 'HP=+125', 'ENDUR=+100', 'ATTACK=+40', 'HASTE=40%'].sort()
  )
  // New Sebilisian Bindings' one regen is ENDURANCE: the bare REGEN had folded it to HP regen.
  assert.deepEqual(knowledgeFromDb(entry('New Sebilisian Bindings')).stats?.stats, [{ key: 'END REGEN', value: '2' }])
  // Repairing twice adds nothing twice, and a block with no such line comes back the same object.
  const once = knowledgeFromDb(axe).stats
  assert.deepEqual(repairWrappedStatKeys(once!, axe.statsBlock), once)
  const plain = parseStatsBlock('STR: +5 Mana Regen: 1')
  assert.equal(repairWrappedStatKeys(plain, 'STR: +5 Mana Regen: 1'), plain)
  assert.equal(repairWrappedStatKeys(plain, undefined), plain)
})

test('CENSUS: every committed row stating such a line serves every pair the line states', () => {
  const pair = /(?:^|\s)([A-Za-z]+(?: Regen)?)\s*:\s*([+-]?\d+%?)/g
  let seen = 0
  for (const rec of Object.values(db.items)) {
    const lines = (rec.statsBlock ?? '').split('\n').filter((l) => /\bRegen\s*:|\bENDUR\s*:/i.test(l))
    if (lines.length === 0) continue
    seen++
    const served = knowledgeFromDb(rec).stats
    const rows = served?.stats.map((s) => `${s.key}=${s.value}`) ?? []
    for (const line of lines) {
      for (const m of line.matchAll(pair)) assert.ok(rows.includes(`${m[1].toUpperCase()}=${m[2]}`), `${rec.page}: ${m[0].trim()}`)
    }
    assert.ok(!rows.some((r) => r.startsWith('REGEN=')), `${rec.page}: a bare REGEN survives`)
    assert.ok(!served?.extras.some((e) => /^(HP|End|Endurance)$/i.test(e)), `${rec.page}: a stray key word survives`)
  }
  // A floor, not a frozen count: five on the 2026-08-22 and the 2026-10-11 corpus alike.
  assert.ok(seen >= 5, `only ${String(seen)} rows state a regen or ENDUR line`)
})
