// A +N window taken back to +0 by the planner's own upgrade rule (src/shared/itemDelevel.ts; owner,
// 2026-10-21, D3: "can't we use that same function/logic to 'delevel' an item to +0? If not, just
// warn."), only where every number inverts to exactly one base; a +N block never reaches the page.

import { test } from 'node:test'
import assert from 'node:assert/strict'
import { delevel } from '../src/shared/itemDelevel.ts'
import { scaleStatBlock } from '../src/shared/itemUpgrade.ts'
import { readItemWindow } from '../src/shared/itemWindow.ts'
import { itemPage } from '../src/shared/wikiPage.ts'
import { keptAfter } from '../src/shared/itemShotKeep.ts'

test('AT THE CAP EVERY STAT TAKES BACK TO ONE BASE; THE UPGRADE\'S OWN SV VOID GOES; WEIGHT (A CEILING) DOES NOT', () => {
  const plus10 = '\nSlot: RANGE<br>\nDMG: 90<br>\nSTR: +15  AGI: +15  DEX: +15  HP: +100<br>\nSV VOID: +10<br>\nClass: RNG<br>'
  const back = delevel(plus10, 10)
  assert.equal(back.block, '\nSlot: RANGE<br>\nDMG: 45<br>\nSTR: +5  AGI: +5  DEX: +5  HP: +50<br>\nClass: RNG<br>')
  const heavy = delevel('\nSTR: +15<br>\nSize: MEDIUM WT: 0.4<br>', 10)
  // Weight's ceiling maps many bases to one: that number is left `?` and named, the rest taken back (owner, 2026-10-25).
  assert.equal(heavy.block, '\nSTR: +5<br>\nSize: MEDIUM WT: ?<br>')
  assert.equal(heavy.exact, false)
  assert.deepEqual(heavy.inexact, ['WT: 0.4'])
  assert.deepEqual(heavy.notes, ['WT 0.4 at +10: any of 3.0 to 3.9 at +0 gives it, so it is left as ? for you to fill.'])
})

test('THE INVERSE AGREES WITH THE FORWARD RULE: A BASE SCALED UP AND TAKEN BACK IS ITSELF', () => {
  for (const tier of [1, 3, 10]) {
    const fwd = scaleStatBlock({ stats: [{ key: 'STR', value: '+12' }, { key: 'HP', value: '+40' }], saves: [{ key: 'SV FIRE', value: '-8' }], flags: [], effects: [], exaltationSlots: [], extras: [], ac: 25 } as never, { full: tier, fraction: 0 })
    const block = `\nAC: ${String(fwd.ac)}<br>\n${fwd.stats.map((s) => `${s.key}: ${s.value}`).join('  ')}<br>\n${fwd.saves.filter((s) => s.key !== 'SV VOID').map((s) => `${s.key}: ${s.value}`).join('  ')}<br>`
    // The Tier bar's progress read: one state, every number back exactly; at +10 the -8 penalty reads 0,
    // which every penalty of ten or less (and more) gives, so it alone is left `?`.
    const fire = tier === 10 ? '?' : '-8'
    assert.equal(delevel(block, tier, 0).block, `\nAC: 25<br>\nSTR: +12  HP: +40<br>\nSV FIRE: ${fire}<br>`, `tier ${String(tier)}`)
    // Unread below the cap: a stat over ten that another fraction explains as well is left `?`, never guessed.
    const back = delevel(block, tier)
    if (back.exact) assert.equal(back.block, `\nAC: 25<br>\nSTR: +12  HP: +40<br>\nSV FIRE: ${fire}<br>`, `tier ${String(tier)}`)
    else assert.ok(back.inexact.length > 0 && (back.block ?? '').includes('?'))
  }
})

test('A +N WINDOW: THE READ NOTES THE TIER AND OFFERS THE GUESS; THE PAGE KEEPS THE SKELETON UNTIL THE PLAYER TAKES IT', () => {
  const r = readItemWindow(['Windstriker +10', 'Lore Equipped, No Trade', 'Class: RNG', 'Race: ALL', 'Range', 'Base Dmg: 90 Delay: 60', 'Strength: 15 Agility: 15'])
  assert.equal(r.tier, 10)
  assert.equal(r.name, 'Windstriker')
  assert.ok(r.baseStatsblock?.includes('DMG: 45<br>'), r.baseStatsblock)
  assert.match(r.checks?.[0] ?? '', /\+10: its numbers are the upgraded item's/)
  const kept = keptAfter(undefined, { read: r, lines: [], icons: [], ms: 1 }, 'window')
  const facts = { name: 'Windstriker', drops: [], soldBy: [], crafted: false }
  assert.ok(!itemPage(facts, kept).includes('DMG: 90'), 'a +10 number never reaches the page')
  assert.ok(itemPage(facts, { ...kept, statsblock: kept.baseStatsblock, tier: undefined }).includes('DMG: 45'))
})

test('A +N RANGE TAKES BACK TEN A TIER: MITHRIL CHAMPION ARROWS +7 READ 220, BASE 150 (REVIEW, 2026-10-21)', () => {
  const r = readItemWindow(['Mithril Champion Arrows +7', 'Magic', 'Class: RNG', 'Race: ALL', 'Ammo', 'Skill: Archery', 'Range: 220', 'Size: TINY Weight: 0.0'])
  assert.equal(r.tier, 7)
  assert.ok(r.statsblock.includes('Range: 220<br>'))
  assert.ok(r.baseStatsblock?.includes('Range: 150<br>'), r.baseStatsblock)
  assert.equal(delevel('\nRange: 250<br>', 10).block, '\nRange: 150<br>')
})

test("A +N WEAPON TAKES BACKSTAB BACK AND DROPS THE UPGRADE'S ACCURACY (owner, 2026-10-24: Torturer's Signature +3)", async () => {
  const { delevel } = await import('../src/shared/itemDelevel')
  const plus3 = [
    'Lore Equipped, No Trade<br>',
    'Slot: PRIMARY SECONDARY<br>',
    'Skill: 1H Piercing  Atk Delay: 22<br>',
    'DMG: 13<br>',
    'Dmg Bon: 10<br>',
    'BACKSTAB: 17<br>',
    'STR: +13  STA: +8  DEX: +13  Accuracy: +7.5%<br>',
    'SV FIRE: +8  SV COLD: +8  SV VOID: +3<br>',
    'Class: WAR RNG BRD ROG<br>'
  ].join('\n')
  const back = delevel(plus3, 3)
  assert.ok(back.block?.includes('BACKSTAB: 15<br>'), JSON.stringify(back))
  assert.ok(back.block?.includes('STR: +10  STA: +5  DEX: +10<br>'), back.block)
  assert.ok(!(back.block ?? '').includes('Accuracy'), back.block)
})

test('AN SV VOID OF EXACTLY THE TIER IS THE UPGRADE\'S OWN, EVEN ON AN ITEM WITH NO ATTRIBUTES (owner, 2026-10-24: Bloodsoaked Gauntlets +1)', async () => {
  const { delevel } = await import('../src/shared/itemDelevel')
  const back = delevel(['Slot: HANDS<br>', 'AC: 18<br>', 'SV VOID: +1<br>', 'Size: SMALL WT: 3.2<br>'].join('\n'), 1)
  assert.ok(!(back.block ?? back.inexact.join(' ')).includes('SV VOID'), JSON.stringify(back))
})
