// The item window, as OCR read it, into the wiki's Item Page lines (src/shared/itemWindow.ts), and
// the page Copy wiki page builds from it (src/shared/wikiPage.ts `itemPage`). The OCR text below is
// real: the prototype's reads of the owner's and Malkil's screenshots (2026-10-21), junk and all.
// The target is the page the owner wrote for Ruined Robe the same night.

import { test } from 'node:test'
import assert from 'node:assert/strict'
import { checkRatio, cleanLine, readItemWindow, slotOf, valueCopper, weightValue } from '../src/shared/itemWindow.ts'
import { statValue } from '../src/shared/itemWindowNumbers.ts'
import { itemPage } from '../src/shared/wikiPage.ts'

const ROBE_OCR = `| Ruined Robe =
| /~ SPDesciption 3, © [[ 4" “Lore 7AM
++ Ruined Robe
Lore Equipped, No Trade, Temporary
Class: NEC WIZ MAG ENC
Race: ALL
Chest i
Size: MEDIUM AC: 1
Weight 20
Charisma: -20 SV. Magic: -15
SV. Fire: -15
SV. Cold: -15
SV._Disease: -15 :
SV. Poison: -15 N
PB Unmodified`.split('\n')

const WINDSTRIKER_OCR = `{e Fingstiker +10 (Augmented (a |
Description
Windstriker +10
1 Lore Equipped, No Trade, Placeable
| Class: RNG
Race: ALL
Range
Merge | Tier: 10/10 J
Rem This item cannot be upgraded. :
Size: MEDIUM HP: 100 Base Dmg: 920
| Weight 04 Accuracy. +25% Delay: 60
Skill: Archery Ratio: 15
Range: 300
Strength: 15 SV. Void: 10
Agility: 15
Dexterity: 15
| Modified Windstriker +10 +
| Omamentation: empty
i Focus Exaltation: Idol of the Underking (Exaltation)
Wom Exaltation: empty
Focus Effect Improved Healing lll
Click Effect Firestrike (Must Equip)
Cast Time: Instant
Required Level: 40
Cooldown: 120 seconds
This item is placeable in yards, guild yards, houses and guild halls.`.split('\n')

const SCALE_OCR = `| Black Lizard Scale [l=
Fa. > ~ Description
++ BlackLizard Scale
8 Quest
Class: None
Race: None
Size: MEDIUM |
Weight 20
PB Unmodified
|| Value: 3 silver 8 copper`.split('\n')

/**
 * The owner's own page for Ruined Robe (2026-10-21), its statsblock field, in the style the owner
 * ruled the same day (D1, "follow the wiki norm"): the flags as the window prints them, Size before WT.
 */
const ROBE_PAGE_STATS = [
  'Lore Equipped, No Trade, Temporary<br>',
  'Slot: CHEST<br>',
  'AC: 1<br>',
  'CHA: -20<br>',
  'SV MAGIC: -15  SV FIRE: -15  SV COLD: -15  SV DISEASE: -15  SV POISON: -15<br>',
  'Size: MEDIUM WT: 2.0<br>',
  'Class: NEC WIZ MAG ENC<br>',
  'Race: ALL<br>'
]

test('RUINED ROBE: THE OCR OF THE OWNER\'S WINDOW BECOMES THE STATSBLOCK THE OWNER WROTE, LINE FOR LINE', () => {
  const r = readItemWindow(ROBE_OCR)
  assert.equal(r.statsblock, `\n${ROBE_PAGE_STATS.join('\n')}`)
  assert.equal(r.name, 'Ruined Robe')
  assert.deepEqual(r.unread, [])
})

test('WINDSTRIKER: THREE COLUMNS, WEAPON LINES, EFFECTS; THE FOCUS GOES OUTSIDE THE STATSBLOCK; EXALTATION ROWS ARE NOT THE ITEM', () => {
  const r = readItemWindow(WINDSTRIKER_OCR)
  const lines = r.statsblock.split('\n').filter(Boolean)
  assert.deepEqual(lines, [
    'Lore Equipped, No Trade, Placeable<br>',
    'Slot: RANGE<br>',
    'Skill: Archery  Atk Delay: 60<br>',
    'DMG: 90<br>',
    'Range: 300<br>',
    'STR: +15  AGI: +15  DEX: +15  HP: +100  Accuracy: +25%<br>',
    'SV VOID: +10<br>',
    "Effect: [[Firestrike|<span class='itemeff'>Firestrike</span>]] (Clicky, Must Equip, Casting Time: Instant, Cooldown: 120 seconds) at Level 40<br>",
    'Size: MEDIUM WT: 0.4<br>',
    'Class: RNG<br>',
    'Race: ALL<br>'
  ])
  assert.equal(r.name, 'Windstriker')
  // The focus is the Focus Exaltation's (Idol of the Underking grants Improved Healing III, items.json):
  // a filled slot's kind of effect is never written as the item's own (owner, 2026-10-21).
  assert.equal(r.focusEffect, undefined)
  // DMG 920 is corrected by the window's own Ratio and Delay, and the player is told.
  // ... and the window is +10 (D3): Weight's ceiling keeps it from one +0 value, so no guess is offered.
  assert.deepEqual(r.checks, [
    "This window is +10: its numbers are the upgraded item's, not the page's. These do not take back to one +0 value: WT: 0.4.",
    'DMG read as 920; the window\'s Ratio (1.5) and Delay (60) say 90.',
    "Focus effect Improved Healing III not written: the item's Focus Exaltation slot holds Idol of the Underking (Exaltation), and the window cannot tell its effect from the item's own. Check the item's page."
  ])
  assert.equal(r.tier, 10)
  assert.deepEqual(r.unread, [])
})

test('BLACK LIZARD SCALE: A QUEST FLAG, NO SLOT, THE VALUE LINE IN COPPER', () => {
  const r = readItemWindow(SCALE_OCR)
  assert.equal(r.statsblock, '\nQuest<br>\nSize: MEDIUM WT: 2.0<br>\nClass: NONE<br>\nRace: NONE<br>')
  assert.equal(r.valueCopper, 38)
})

test('A LORE TAB (NO CLASS LINE) GIVES ITS TEXT AND NO STATSBLOCK', () => {
  const r = readItemWindow(['| Ruined Robe', 'Description Lore', 'The Cloth Seems To Be Moving'])
  assert.equal(r.statsblock, '')
  assert.equal(r.lore, 'The Cloth Seems To Be Moving')
})

test('JUNK AT LINE ENDS GOES, A ROMAN RANK AND A SIGNED NUMBER STAY', () => {
  assert.equal(cleanLine('++ Ruined Robe'), 'Ruined Robe')
  assert.equal(cleanLine('8 Quest'), 'Quest')
  assert.equal(cleanLine('S— Windstriker +10'), 'Windstriker +10')
  assert.equal(cleanLine('SV. Poison: -15 N'), 'SV. Poison: -15')
  assert.equal(cleanLine('Chest i'), 'Chest')
  assert.equal(cleanLine('Focus Effect: Spell Haste I'), 'Focus Effect: Spell Haste I')
})

test('WEIGHT GETS BACK THE ONE DECIMAL THE GAME ALWAYS PRINTS; A READ DECIMAL IS KEPT', () => {
  assert.equal(weightValue('20'), '2.0')
  assert.equal(weightValue('04'), '0.4')
  assert.equal(weightValue('125'), '12.5')
  assert.equal(weightValue('4.2'), '4.2')
  assert.equal(weightValue('2,0'), '2.0')
})

test('VALUE: EVERY COIN WORD TO COPPER; NO COIN WORD IS NO VALUE', () => {
  assert.equal(valueCopper('4 platinum'), 4000)
  assert.equal(valueCopper('1 platinum 2 gold 3 silver 4 copper'), 1234)
  assert.equal(valueCopper('none'), undefined)
})

test('RATIO CHECK: A DMG THAT FITS IS LEFT ALONE; ONE NO SINGLE DIGIT FIXES IS ONLY FLAGGED', () => {
  const ok = new Map([['DMG', '90'], ['Atk Delay', '60'], ['Ratio', '15']])
  assert.equal(checkRatio(ok), undefined)
  assert.equal(ok.get('DMG'), '90')
  const bad = new Map([['DMG', '77'], ['Atk Delay', '60'], ['Ratio', '15']])
  assert.match(checkRatio(bad) ?? '', /check DMG/)
  assert.equal(bad.get('DMG'), '77')
})

test('COPY WIKI PAGE: A SCREENSHOT FILLS lucy_img_ID, notes, statsblock IN THE OWNER\'S ORDER; WITHOUT ONE THE SKELETON STAYS', () => {
  const facts = { name: 'Ruined Robe', drops: [], soldBy: [], crafted: false }
  const page = itemPage(facts, { iconId: 1126, lore: 'The Cloth Seems To Be Moving', statsblock: readItemWindow(ROBE_OCR).statsblock })
  const order = ['|itemname = Ruined Robe', '|lucy_img_ID = 1126', '|notes = {{Item Lore|The Cloth Seems To Be Moving}}', '|statsblock = ']
  const at = order.map((l) => page.indexOf(l))
  assert.ok(at.every((i, k) => i >= 0 && (k === 0 || i > at[k - 1])), page)
  assert.ok(page.includes(ROBE_PAGE_STATS.join('\n')), page)
  assert.ok(!itemPage(facts).includes('lucy_img_ID'))
  assert.ok(itemPage(facts).includes('Size:   WT: <br>'))
})

test("COPY WIKI PAGE: THE WINDOW'S VALUE LINE WINS OVER THE LOG'S ESTIMATE", () => {
  const facts = { name: 'Black Lizard Scale', drops: [], soldBy: [], crafted: false, merchantValue: 40 }
  assert.ok(itemPage(facts, { valueCopper: 38 }).includes('|merchant_value = 3s 8c'))
  assert.ok(itemPage(facts).includes('|merchant_value = 4s'))
})

test('A LORE THAT WRAPS JOINS INTO ONE LINE; THE TITLE ABOVE THE TAB ROW IS NOT LORE (SICKLY MAIDEN\'S HAIR, OWNER 2026-10-21)', () => {
  const r = readItemWindow(["Sickly Maiden's Hair", '- Description Lore ¥ s', 'This sample of long, golden |', 'grass is tinged with disease'])
  assert.equal(r.lore, 'This sample of long, golden grass is tinged with disease')
  assert.equal(readItemWindow(['Shrubbe', '- Description Lore ¥ s', 'Ordinary Plant t |', 'IR', 'EE']).lore, 'Ordinary Plant')
})

test('A LORE TAB ON THE WINDOW IS NOTED (THE ITEM HAS LORE); NO TAB, NO NOTE', () => {
  assert.equal(readItemWindow(ROBE_OCR).loreTab, true)
  assert.equal(readItemWindow(WINDSTRIKER_OCR).loreTab, undefined)
  assert.equal(readItemWindow(SCALE_OCR).loreTab, undefined)
})

test('COPY WIKI PAGE: A LORE TAB NOT YET PASTED IS {{Item Lore Missing}}; THE PASTED LORE REPLACES IT; NO TAB, NO NOTES', () => {
  const facts = { name: 'Ruined Robe', drops: [], soldBy: [], crafted: false }
  assert.ok(itemPage(facts, { statsblock: 's', loreTab: true }).includes('|notes = {{Item Lore Missing}}'))
  const pasted = itemPage(facts, { statsblock: 's', loreTab: true, lore: 'The Cloth Seems To Be Moving' })
  assert.ok(pasted.includes('|notes = {{Item Lore|The Cloth Seems To Be Moving}}') && !pasted.includes('Missing'))
  assert.ok(!itemPage(facts, { statsblock: 's' }).includes('|notes'))
})

test('SLOT: EVERY SLOT THE WINDOW LISTS, AS THE WIKI WRITES THEM; A WRAPPED LIST JOINS', () => {
  assert.equal(slotOf('Primary, Secondary'), 'PRIMARY SECONDARY')
  assert.equal(slotOf('Fingers'), 'FINGER')
  assert.equal(slotOf('Ear, Neck, Face'), 'EAR NECK FACE')
  assert.equal(slotOf('Power Source'), 'POWER SOURCE')
  assert.equal(slotOf('Range: 300'), undefined)
  const r = readItemWindow(['Some Ring', 'Magic', 'Class: ALL', 'Race: ALL', 'Fingers, Ear', 'Wrist', 'Size: TINY', 'Weight: 0.1'])
  assert.ok(r.statsblock.includes('Slot: FINGER EAR WRIST<br>'), r.statsblock)
})

test("THE WINDOW'S OTHER LABELS (THE CLIENT'S OWN STRINGS): End, End Regen, Dmg Bon, Rec/Req Level, Charges, Deity", () => {
  const r = readItemWindow([
    'Test Blade', 'Magic', 'Class: WAR PAL', 'Race: ALL', 'Deity: Karana', 'Primary',
    'Size: MEDIUM Base Dmg: 9 Delay: 30', 'Weight: 7.5 Dmg Bon: 7', 'End: 15 End Regen: 2', 'Rec Level: 30 Req Level: 20', 'Charges: 5'
  ])
  const lines = r.statsblock.split('\n').filter(Boolean)
  assert.deepEqual(lines, [
    'Magic<br>', 'Slot: PRIMARY<br>', 'Atk Delay: 30<br>', 'DMG: 9<br>', 'Dmg Bon: 7<br>', 'END: +15  End Regen: +2<br>',
    'Recommended level of 30.<br>', 'Required level of 20.<br>', 'Charges: 5<br>', 'Size: MEDIUM WT: 7.5<br>', 'Class: WAR PAL<br>', 'Race: ALL<br>', 'Deity: Karana<br>'
  ])
  assert.deepEqual(r.unread, [])
})

test('AN (AUGMENTED) TITLE IS THE +N PATH; A FILLED EXALTATION SLOT KEEPS ITS KIND OF EFFECT OFF THE PAGE, AN EMPTY ONE DOES NOT', () => {
  const r = readItemWindow([
    "Wu's Fist of Mastery +10 (Augmented)",
    'No Trade, Placeable',
    'Class: MNK',
    'Race: ALL',
    'Primary Secondary',
    'Size: TINY Accuracy: +25% Base Dmg: 32',
    'Weight 0.1 Delay: 22',
    'Skill: Hand to Hand Dmg Bon: 10',
    'Ornamentation: empty',
    'Focus Exaltation: empty',
    'Click Exaltation: Golem Metal Wand (Exaltation)',
    'Worn Exaltation: empty',
    "Proc Exaltation: Cherista's Fangs (Exaltation)",
    'Click Effect Pillage Enchantment (Must Equip)',
    'Cast Time: 4.0 seconds',
    'Cooldown: 240 seconds',
    'Combat Effect Lifebite',
    'Worn Effect: Spirit of Wolf'
  ])
  assert.equal(r.name, "Wu's Fist of Mastery")
  assert.equal(r.tier, 10)
  const lines = r.statsblock.split('\n').filter(Boolean)
  // The Worn slot is empty: a worn effect is the item's own.
  assert.ok(lines.includes("Effect: [[Spirit of Wolf|<span class='itemeff'>Spirit of Wolf</span>]] (Worn)<br>"), JSON.stringify(lines))
  assert.ok(!lines.some((l) => /Pillage|Lifebite|Exaltation/.test(l)), JSON.stringify(lines))
  assert.equal(r.checks?.filter((c) => / not written: /.test(c)).length, 2)
})

test('A CLASS OR RACE LIST THE WINDOW WRAPPED ONTO A SECOND LINE IS READ WHOLE, NOT LEFT IN NOT PLACED', () => {
  const r = readItemWindow(['Leather Tunic', 'Magic', 'Class: WAR CLR PAL RNG SHD DRU MNK', 'BRD ROG SHM BST', 'Race: HUM BAR ERU ELF HIE DEF HEF DWF', 'TRL OGR HFL GNM', 'Chest', 'AC: 10', 'Size: MEDIUM', 'Weight: 5.0'])
  const lines = r.statsblock.split('\n').filter(Boolean)
  assert.ok(lines.includes('Class: WAR CLR PAL RNG SHD DRU MNK BRD ROG SHM BST<br>'), JSON.stringify(lines))
  assert.ok(lines.includes('Race: HUM BAR ERU ELF HIE DEF HEF DWF TRL OGR HFL GNM<br>'), JSON.stringify(lines))
  assert.ok(lines.includes('Slot: CHEST<br>'), JSON.stringify(lines))
  assert.deepEqual(r.unread, [])
})

test("A NAME'S OWN FIRST WORD IS KEPT: A ONE-LETTER ARTICLE OR A NUMBER IS NOT THE ICON'S JUNK", () => {
  assert.equal(readItemWindow(["A Faded Salil's Writ Page", 'Lore, No Trade', 'Class: ALL', 'Race: ALL', 'Size: SMALL', 'Weight: 0.1']).name, "A Faded Salil's Writ Page")
  assert.equal(readItemWindow(['5 Dose Potion of Cold', 'Magic', 'Class: ALL', 'Race: ALL', 'Size: SMALL', 'Weight: 0.1']).name, '5 Dose Potion of Cold')
  assert.equal(readItemWindow(['++ Ruined Robe', 'Magic', 'Class: ALL', 'Race: ALL']).name, 'Ruined Robe')
  assert.equal(cleanLine("A Faded Salil's Writ Page", true), "A Faded Salil's Writ Page")
  assert.equal(cleanLine('| Ruined Robe', true), 'Ruined Robe')
})

test('THE NAME LINE IS NEVER THE FLAG LINE: LORE OF MALIGNANCY HAS NO LORE FLAG; ITS FLAG LINE UNDER IT IS READ', () => {
  const r = readItemWindow(['| Lore of Malignancy', 'Description', 'Lore of Malignancy', 'Class: ALL', 'Race: ALL', 'Size: TINY', 'Weight: 0.0'])
  assert.equal(r.name, 'Lore of Malignancy')
  assert.ok(!r.statsblock.includes('Lore<br>'), r.statsblock)
  const flagged = readItemWindow(['Lore of Malignancy', 'Lore, No Trade', 'Class: ALL', 'Race: ALL'])
  assert.equal(flagged.name, 'Lore of Malignancy')
  assert.ok(flagged.statsblock.includes('Lore, No Trade<br>'), flagged.statsblock)
})

test("AN EXALTATION SLOT WITH NO VALUE READ, OR EMPTY WITH AN OCR SLIP, IS EMPTY: THE ITEM'S OWN CLICK IS WRITTEN", () => {
  for (const slot of ['Click Exaltation:', 'Click Exaltation: empty', 'Click Exaltation: Empty |', 'Click Exaltation: emply']) {
    const r = readItemWindow(['Ring of Gates', 'Magic', 'Class: ALL', 'Race: ALL', 'Fingers', 'Size: TINY Weight: 0.1', slot, 'Click Effect: Gate (Any Slot)', 'Cast Time: 10.0 seconds'])
    assert.ok(r.statsblock.includes('[[Gate|'), `${slot}: ${r.statsblock}`)
    assert.ok(!(r.checks ?? []).some((c) => /not written/.test(c)), `${slot}: ${JSON.stringify(r.checks)}`)
  }
})

test("THE ICON READ AS A CHARACTER BEFORE THE NAME GOES WHEN THE TITLE BAR NAMES THE ITEM WITHOUT IT (OWNER'S SCREENSHOTS, 2026-10-22)", () => {
  const read = (title: string, name: string): string | undefined => readItemWindow([title, 'Description', name, 'No Trade', 'Class: ALL', 'Race: ALL']).name
  assert.equal(read('Halfling Blood =', 'S Halfling Blood'), 'Halfling Blood')
  assert.equal(read('Robe of the Betrayed [EE', '1 Robe of the Betrayed'), 'Robe of the Betrayed')
  // A name that starts so keeps it: the title has it too.
  assert.equal(read('5 Dose Potion of Cold [=', '5 Dose Potion of Cold'), '5 Dose Potion of Cold')
  assert.equal(read('A Faded Page', 'A Faded Page'), 'A Faded Page')
})

test("A LEGENDS CLICK EFFECT WITH ITS CASTING TIME IN ITS OWN BRACKETS IS ONE CLEAN EFFECT LINE (OWNER'S PETAMORPH WAND, 2026-10-22)", () => {
  // The window prints `Click Effect: Summon Familiar: Werewolf (Casting Time: 5.0)(Can Equip)`; the page
  // had `Effect: [[Summon Familiar: Werewolf (]] (Casting Time: 5.0)`. Lines as the window shows them.
  const read = readItemWindow([
    'Petamorph Wand: Werewolf',
    'No Trade, Attunable, Heirloom',
    'Class: ALL',
    'Race: ALL',
    'Ammo',
    'Size: SMALL',
    'Weight: 0.9',
    'Click Effect: Summon Familiar: Werewolf (Casting Time: 5.0)(Can Equip)',
    'Cast Time: 5.0 seconds',
    'Cooldown: 10 seconds'
  ])
  assert.ok(read.statsblock.includes("Effect: [[Summon Familiar: Werewolf|<span class='itemeff'>Summon Familiar: Werewolf</span>]] (Clicky, Can Equip, Casting Time: 5.0"), read.statsblock)
})

test('A STAT IS A NUMBER: A LOOK-ALIKE BECOMES ITS DIGIT WITH A CHECK; ANYTHING ELSE IS FLAGGED, NEVER GUESSED (owner, 2026-10-24: Stamina 7 read PT, Mana 15 read a5)', () => {
  assert.deepEqual(statValue('STA', '7'), { value: '+7' })
  assert.deepEqual(statValue('STA', '-3'), { value: '-3' })
  assert.equal(statValue('HP', '1O').value, '+10')
  assert.match(statValue('HP', '1O').note ?? '', /HP read "1O", taken as \+10: check it/)
  for (const bad of ['PT', 'a5', 'Fire']) {
    assert.equal(statValue('MANA', bad).value, bad)
    assert.match(statValue('MANA', bad).note ?? '', /not a number: fix it/)
  }
  // The Wristwrap's reading: the misread stat is flagged in the window's checks.
  const r = readItemWindow(["Handmaiden's Wristwrap", 'Lore Equipped, No Trade', 'Class: DRU MNK SHM BST', 'Race: ALL', 'Wrist', 'Size: SMALL HP: 10', 'Weight: 1.0', 'Stamina: PT SV. Fire: 5', 'Wisdom: 7', 'Agility: 7'])
  assert.ok((r.checks ?? []).some((c) => c.includes('STA read "PT", not a number')), JSON.stringify(r.checks))
})

test('A WEAPON NUMBER IS A NUMBER: % READ FOR 5, LOOK-ALIKES, A CHECK; TEXT LINES AS READ (owner, 2026-10-24: Handwrap DMG 5 read %)', async () => {
  const { weaponValue } = await import('../src/shared/itemWindowNumbers.ts')
  assert.deepEqual(weaponValue('DMG', '5'), { value: '5' })
  assert.equal(weaponValue('DMG', '%').value, '5')
  assert.match(weaponValue('DMG', '%').note ?? '', /DMG read "%", taken as 5/)
  assert.equal(weaponValue('Atk Delay', '3O').value, '30')
  assert.deepEqual(weaponValue('Bane DMG', 'Undead +25'), { value: 'Undead +25' })
  assert.deepEqual(weaponValue('Skill', 'Hand to Hand'), { value: 'Hand to Hand' })
})
