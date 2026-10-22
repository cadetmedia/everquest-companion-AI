// What a paste in a Gaps item row's screenshot box keeps (src/shared/itemShotKeep.ts; owner, 2026-10-21,
// after testing): a nonsense image keeps nothing, another item's window waits, a window paste replaces
// every window field, a Lore paste only the lore, each part clears on its own.

import { test } from 'node:test'
import assert from 'node:assert/strict'
import { cleared, hasWindowPart, keptAfter, otherItemNote, sameItem, shotKind, shotProblem } from '../src/shared/itemShotKeep.ts'
import { readItemWindow, type ItemShotReply } from '../src/shared/itemWindow.ts'
import { nameInLines } from '../src/shared/mobPicture.ts'
import { isNearSolid } from '../src/main/shot/pixels.ts'

const reply = (lines: string[], icons: { id: number; score: number }[] = []): ItemShotReply => ({ read: readItemWindow(lines), lines, icons, ms: 1 })

const WINDOW = ['| Ruined Robe', 'Ruined Robe', 'Lore Equipped, No Trade, Temporary', 'Class: NEC WIZ MAG ENC', 'Race: ALL', 'Chest', 'Size: MEDIUM AC: 1', 'Weight: 2.0']
const LORE_TAB = ['| Ruined Robe', '| /~ SPDesciption 3, © [[ 4" “Lore 7AM', 'The Cloth Seems To Be Moving']

test('A CAT IS NOT AN ITEM: NO CLASS LINE, NO LORE TAB, NO ICON THAT FITS -> NOTHING IS KEPT', () => {
  assert.equal(shotKind(reply(['meow', 'a soft orange cat sitting on a warm windowsill in the sun'])), null)
  // a small picture is tried as an icon alone, and a poor fit is refused
  assert.equal(shotKind(reply([], [{ id: 1126, score: 1900 }])), null)
  assert.equal(shotKind({ ...reply(WINDOW), error: 'Not a picture.' }), null)
})

test('THE ITEM WINDOW, ITS LORE TAB AND AN ICON ALONE ARE EACH TOLD APART', () => {
  assert.equal(shotKind(reply(WINDOW)), 'window')
  assert.equal(shotKind(reply(LORE_TAB)), 'lore')
  assert.equal(reply(LORE_TAB).read.lore, 'The Cloth Seems To Be Moving')
  assert.equal(shotKind(reply([], [{ id: 1126, score: 146 }])), 'icon')
  // a sentence without the Lore tab around it is not a Lore tab (a chat snip)
  assert.equal(shotKind(reply(['Malkil tells you, that sword looks great on you'])), null)
})

test('A SHORT LORE UNDER THE TAB ROW IS A LORE TAB (SHRUBBERY: "ORDINARY PLANT"); WITHOUT THE ROW IT IS NOT', () => {
  // The OCR of the owner's Shrubbery Lore tab (2026-10-21), refused before by the sentence rule.
  const shrub = ['Shrubbe', '. - — -', '- Description Lore ¥ s', 'Ordinary Plant t |', 'IR', 'EE']
  assert.equal(shotKind(reply(shrub)), 'lore')
  assert.equal(reply(shrub).read.lore, 'Ordinary Plant')
  assert.equal(shotKind(reply(['Shrubbery', 'Lore', 'Ordinary Plant'])), null)
  // the Description tab with its Class line missed is not lore
  assert.equal(shotKind(reply(['Ruined Robe', 'Description Lore', 'Lore Equipped, No Trade, Temporary'])), null)
})

test("THE WINDOW'S NAME MATCHES THE ROW THROUGH OCR'S SMALL SLIPS, NOT ANOTHER ITEM", () => {
  assert.ok(sameItem('BlackLizard Scale', 'Black Lizard Scale'))
  assert.ok(sameItem('Windstiker', 'Windstriker'))
  assert.ok(sameItem(undefined, 'Anything'))
  assert.ok(!sameItem('Ruined Robe', 'Black Lizard Scale'))
  assert.ok(!sameItem('Windstriker', 'Bow of the Huntsman'))
})

test('A WINDOW PASTE REPLACES EVERY WINDOW FIELD (A FIELD IT LACKS IS CLEARED); THE LORE STAYS', () => {
  const before = { statsblock: 'old', iconId: 999, valueCopper: 4000, focusEffect: 'Old Focus', lore: 'Kept lore' }
  const after = keptAfter(before, reply(WINDOW, [{ id: 1126, score: 146 }]), 'window')
  assert.equal(after.iconId, 1126)
  assert.equal(after.lore, 'Kept lore')
  assert.equal(after.valueCopper, undefined)
  assert.equal(after.focusEffect, undefined)
  assert.ok(after.statsblock?.includes('Slot: CHEST'))
})

test('A LORE PASTE CHANGES ONLY THE LORE; AN ICON PASTE ONLY THE ICON', () => {
  const before = { statsblock: 'kept', iconId: 1126, valueCopper: 38 }
  assert.deepEqual(keptAfter(before, reply(LORE_TAB), 'lore'), { ...before, lore: 'The Cloth Seems To Be Moving' })
  assert.deepEqual(keptAfter(before, reply([], [{ id: 1225, score: 300 }]), 'icon'), { ...before, iconId: 1225 })
})

test('EACH PART CLEARS ON ITS OWN; CLEARING THE LAST PART FORGETS THE ITEM', () => {
  const both = { statsblock: 's', iconId: 1, lore: 'L' }
  assert.deepEqual(cleared(both, 'window'), { lore: 'L' })
  assert.deepEqual(cleared(both, 'lore'), { statsblock: 's', iconId: 1 })
  assert.equal(cleared({ lore: 'L' }, 'lore'), null)
  assert.equal(cleared({ iconId: 1 }, 'window'), null)
  assert.ok(hasWindowPart({ iconId: 1 }))
  assert.ok(!hasWindowPart({ lore: 'L' }))
  assert.ok(!hasWindowPart(undefined))
})

test("A MOB'S NAMEPLATE IS FOUND LOOSELY: LETTERS ONLY, NO (ZONE), WITH OR WITHOUT ITS ARTICLE, A SLIP IN A LONG NAME", () => {
  assert.ok(nameInLines('a lesser kobold', ['  A Lesser Kobold  ', 'some chat']))
  assert.ok(nameInLines('Orc Centurion (Crushbone)', ['[45] Orc Centurion']))
  assert.ok(nameInLines('a fire giant warrior', ['Fire Giant Warrior']))
  assert.ok(nameInLines('Hoptor Thaggelum', ['Hoptor Thagge1um']))
  assert.ok(!nameInLines('a lesser kobold', ['a decaying skeleton', 'You have slain a gnoll!']))
  assert.ok(!nameInLines('Marda', []))
})

test('A BLANK OR ONE-COLOUR PICTURE IS NEAR SOLID; A REAL SCENE IS NOT', () => {
  const pic = (at: (x: number, y: number) => number): { w: number; h: number; data: Uint8Array } => {
    const data = new Uint8Array(100 * 80 * 4)
    for (let y = 0; y < 80; y++) for (let x = 0; x < 100; x++) data.set([at(x, y), at(x, y), at(x, y), 255], (y * 100 + x) * 4)
    return { w: 100, h: 80, data }
  }
  assert.ok(isNearSolid(pic(() => 0)))
  assert.ok(isNearSolid(pic((x) => 120 + (x % 3))))
  assert.ok(!isNearSolid(pic((x, y) => ((x >> 3) + (y >> 3)) % 2 === 0 ? 30 : 200)))
})

test("A TWO-LINE LORE IS ONE LORE (SICKLY MAIDEN'S HAIR); A WINDOW PASTE KEEPS WHETHER THE WINDOW HAS A LORE TAB", () => {
  const two = reply(["Sickly Maiden's Hair", '- Description Lore', 'This sample of long, golden', 'grass is tinged with disease'])
  assert.equal(shotKind(two), 'lore')
  assert.equal(keptAfter(undefined, two, 'lore').lore, 'This sample of long, golden grass is tinged with disease')
  const robe = ['| Ruined Robe', '| Description Lore', ...WINDOW.slice(1)]
  assert.equal(keptAfter(undefined, reply(robe), 'window').loreTab, true)
  assert.equal(keptAfter(undefined, reply(WINDOW), 'window').loreTab, undefined)
})

test("ANOTHER ITEM'S PART, OR ONE WITH NO NAME READ, WAITS FOR THE PLAYER (OWNER, 2026-10-21: TUNIC FACTS ON GRAY WOLF SKULL)", () => {
  // A snip below the title reads the window but no name: it was kept on whatever row it was pasted on.
  const noTitle = reply(['Lore Equipped, No Trade', 'Class: WAR', 'Race: ALL', 'Chest', 'Size: MEDIUM AC: 4', 'Weight: 1.6'])
  assert.equal(shotKind(noTitle), 'window')
  assert.equal(noTitle.read.name, undefined)
  assert.equal(otherItemNote(noTitle.read.name, 'Gray Wolf Skull', 'item window'), "No name was found in this item window: is it Gray Wolf Skull's?")
  // The window's `*` is not part of the name.
  const tunic = reply(['Mud Stained Skin Tunic*', 'Lore Equipped, No Trade', 'Class: WAR', 'Race: ALL', 'Chest'])
  assert.equal(tunic.read.name, 'Mud Stained Skin Tunic')
  assert.equal(otherItemNote(tunic.read.name, 'Gray Wolf Skull', 'item window'), "This is Mud Stained Skin Tunic's item window, not Gray Wolf Skull's.")
  // A Lore tab is checked too: Shrubbery's (its title cut to `Shrubbe`) is not Gray Wolf Skull's, and is Shrubbery's.
  assert.equal(otherItemNote('Shrubbe', 'Gray Wolf Skull', 'Lore tab'), "This is Shrubbe's Lore tab, not Gray Wolf Skull's.")
  assert.equal(otherItemNote('Shrubbe', 'Shrubbery', 'Lore tab'), undefined)
})

test('A PASTE THAT KEEPS NOTHING SAYS WHY, IN WORDS, WITH WHAT TO DO (OWNER, 2026-10-21: "JUST SAYS ERROR WITHOUT A REASON")', () => {
  assert.match(shotProblem({ ...reply([]), error: 'Not a picture.' }), /^Not a picture\. Paste a screenshot/)
  assert.match(shotProblem(reply([])), /^No text was found in this picture/)
  assert.match(shotProblem(reply([], [{ id: 1126, score: 1900 }])), /icon alone, but no game icon matches it closely \(the nearest is 1126\)/)
  assert.match(shotProblem(reply(['meow', 'a soft orange cat sitting on a warm windowsill'])), /^Text was read \("a soft orange cat sitting on a warm wind…"\), but no item window/)
})
