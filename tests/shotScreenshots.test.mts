// Screenshot to wiki on real screenshots (tests/fixtures/shots; owner ask, 2026-10-21: "use the ones
// i gave you"): the owner's Ruined Robe window and its icon alone, Black Lizard Scale, Shrubbery's Lore tab, and Malkil's
// Windstriker on his custom UI over the ground and over the sky. The text is read with the real OCR
// (tesseract.js, local). The icon checks need the game's icon sheets, which are never committed: they
// run where an EverQuest install is found (EQ_ROOT, else the default install path) and skip elsewhere.

import { after, test } from 'node:test'
import assert from 'node:assert/strict'
import { existsSync, readFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { decodeTga } from '../src/main/shot/gameTextures.ts'
import { buildIconIndex, iconSheets, readIconIndex, sheetsFingerprint, SheetCells, writeIconIndex, type IconIndex } from '../src/main/shot/iconIndex.ts'
import { readLines, stopOcr } from '../src/main/shot/ocr.ts'
import { readItemShot, type ItemShot, type ShotReaders } from '../src/main/shot/readItemShot.ts'
import { shotKind } from '../src/shared/itemShotKeep.ts'
import { readSpellWindow } from '../src/shared/spellWindow.ts'
import { readPng } from './shotPng.mts'
import { imageGaps } from '../src/shared/gapImages.ts'
import { pictureFile } from '../src/shared/mobPicture.ts'
import { showsName } from '../src/main/shot/nameplate.ts'

const SHOTS = join(import.meta.dirname, 'fixtures', 'shots')
const EQ_ROOT = process.env.EQ_ROOT ?? 'C:/Users/Public/Daybreak Game Company/Installed Games/EverQuest Legends'
const UI = join(EQ_ROOT, 'uifiles')
const HAS_INSTALL = iconSheets(join(UI, 'default')).length > 0
const NO_INSTALL = HAS_INSTALL ? false : 'no EverQuest install with icon sheets here (set EQ_ROOT)'

let index: Promise<IconIndex | null> | null = null
function installIndex(): Promise<IconIndex | null> {
  index ??= (async () => {
    const sheets = iconSheets(join(UI, 'default'))
    if (sheets.length === 0) return null
    const fp = sheetsFingerprint(sheets)
    const cache = join(tmpdir(), 'eq-companion-test-icon-index.bin')
    const cached = readIconIndex(cache, fp)
    if (cached !== null) return cached
    const built = await buildIconIndex(sheets)
    writeIconIndex(cache, fp, built)
    return built
  })()
  return index
}

const cells = new SheetCells(join(UI, 'default'))
const textures = ['default/wnd_bg_dark_rock.tga', 'default/wnd_bg_mid_rock.tga', 'default/wnd_bg_light_rock.tga'].flatMap((f) => {
  const p = join(UI, f)
  const t = existsSync(p) ? decodeTga(readFileSync(p)) : null
  return t === null ? [] : [t]
})
const readers: ShotReaders = { index: installIndex, cell: (id) => cells.cell(id), textures: () => textures }
/** Text only: no icon index, so the text tests run anywhere. */
const textOnly: ShotReaders = { index: () => Promise.resolve(null), cell: () => null, textures: () => [] }

const read = (file: string, r: ShotReaders): Promise<ItemShot> => readItemShot(readPng(join(SHOTS, file)), r)
const lines = (s: ItemShot): string[] => s.read.statsblock.split('\n').filter(Boolean)

after(() => stopOcr())

test("RUINED ROBE (THE OWNER'S WINDOW): THE STATSBLOCK IS THE OWNER'S PAGE, LINE FOR LINE", async () => {
  const s = await read('ruined-robe.png', textOnly)
  assert.deepEqual(lines(s), [
    'Lore Equipped, No Trade, Temporary<br>',
    'Slot: CHEST<br>',
    'AC: 1<br>',
    'CHA: -20<br>',
    'SV MAGIC: -15  SV FIRE: -15  SV COLD: -15  SV DISEASE: -15  SV POISON: -15<br>',
    'Size: MEDIUM WT: 2.0<br>',
    'Class: NEC WIZ MAG ENC<br>',
    'Race: ALL<br>'
  ])
  assert.equal(s.read.name, 'Ruined Robe')
})

test('BLACK LIZARD SCALE: QUEST FLAG, WEIGHT, AND THE VALUE LINE (3s 8c)', async () => {
  const s = await read('black-lizard-scale.png', textOnly)
  assert.deepEqual(lines(s), ['Quest<br>', 'Size: MEDIUM WT: 2.0<br>', 'Class: NONE<br>', 'Race: NONE<br>'])
  assert.equal(s.read.valueCopper, 38)
})

test('VIAL OF SWAMP WATER (THE OWNER\'S, D1): THE FLAGS AS THE WINDOW PRINTS THEM, SIZE BEFORE WT, NONE IN CAPS', async () => {
  // The owner asked why No Trade became NO DROP (2026-10-21); the ruling: follow the wiki's recent norm.
  const s = await read('vial-of-swamp-water.png', textOnly)
  assert.deepEqual(lines(s), ['No Trade, Quest<br>', 'Size: TINY WT: 1.0<br>', 'Class: NONE<br>', 'Race: NONE<br>'])
})

test("SUREFALL FLETCHING KIT (MALKIL'S CONTAINER, 2026-10-21): CAPACITY, SIZE CAPACITY, AND THE DEITY PRINTED WITHOUT ITS LABEL", async () => {
  const s = await read('surefall-fletching-kit.png', textOnly)
  assert.deepEqual(lines(s), ['No Trade<br>', 'Size: SMALL WT: 0.1<br>', 'Capacity: 8 Size Capacity: GIANT<br>', 'Class: ALL<br>', 'Race: ALL<br>', 'Deity: Karana<br>'])
  assert.deepEqual(s.read.unread, [])
})

for (const file of ['windstriker-ground.png', 'windstriker-sky.png']) {
  test(`WINDSTRIKER, MALKIL'S UI (${file}): THE WEAPON AND STATS; DMG 90; NO EXALTATION'S EFFECT AS THE BOW'S OWN`, async () => {
    const s = await read(file, textOnly)
    const got = lines(s)
    for (const want of ['Slot: RANGE<br>', 'Skill: Archery  Atk Delay: 60<br>', 'DMG: 90<br>', 'Range: 300<br>', 'SV VOID: +10<br>', 'Size: MEDIUM WT: 0.4<br>', 'Class: RNG<br>', 'Race: ALL<br>']) {
      assert.ok(got.includes(want), `${want} in ${JSON.stringify(got)}`)
    }
    assert.ok(got.some((l) => l.startsWith('STR: +15  AGI: +15  DEX: +15  HP: +100')), JSON.stringify(got))
    // The Focus and Click Exaltation slots hold Idol of the Underking and Rain Caller, which grant
    // Improved Healing III and Firestrike (items.json): neither is written as the bow's own, and both are said.
    assert.ok(!got.some((l) => l.includes('Firestrike')), JSON.stringify(got))
    assert.equal(s.read.focusEffect, undefined)
    assert.ok(s.read.checks?.some((c) => c.startsWith('Focus effect Improved Healing III not written')), JSON.stringify(s.read.checks))
    assert.ok(s.read.checks?.some((c) => c.startsWith('Click effect Firestrike not written') && c.includes('Rain Caller')), JSON.stringify(s.read.checks))
  })
}

test("SHRUBBERY, THE LORE TAB (THE OWNER'S, 2026-10-21): A TWO-WORD LORE IS READ AND KEPT AS LORE", async () => {
  const s = await read('shrubbery-lore.png', textOnly)
  assert.equal(s.read.lore, 'Ordinary Plant')
  assert.equal(shotKind({ read: s.read, lines: s.lines, icons: s.icons, ms: s.ms }), 'lore')
})

test("BURST OF FLAME, THE SPELL DISPLAY WINDOW (THE OWNER'S, 2026-10-21): NAME, FIELDS AND THE FILE'S WORDS WITH THE WINDOW'S NUMBERS", async () => {
  const lines = (await readLines(readPng(join(SHOTS, 'burst-of-flame-spell.png')))).map((l) => l.text)
  const r = readSpellWindow(lines, 'Creates a ball of fire that burns your target, doing between #1 and @1 damage.')
  assert.equal(r.name, 'Burst of Flame')
  assert.equal(r.description, 'Creates a ball of fire that burns your target, doing between 4 and 5 damage.')
  for (const [k, v] of Object.entries({ duration: 'Instant', mana: '4', casting_time: '1.50', range: '200', target_type: 'Single', resist: 'Fire', skill: '[[Skill Evocation | Evocation]]' })) {
    assert.equal(r.fields[k], v, `${k} in ${JSON.stringify(lines)}`)
  }
  assert.equal(r.fields.msg_cast_on_other, 'Someone singes as the Burst of Flame hits them.')
})

/** The icon each picture shows (the owner's pages and items.json), and the rank it must reach. */
const ICONS: readonly [string, number, number][] = [
  ['ruined-robe.png', 1126, 1],
  ['ruined-robe-icon.png', 1126, 1],
  ['black-lizard-scale.png', 1225, 1],
  // OCR read the icon's edge as a word (`By Class: ALL`) and placed the box over the pane's border:
  // 6911 (the same lump in brown) won until the Class word itself placed it (owner, 2026-10-21).
  ['lizardman-mystic-scale.png', 1233, 1],
  // 95 against 1,015 for the runner-up (the owner's window, 2026-10-21)
  ['vial-of-swamp-water.png', 705, 1],
  // a translucent window over the scene at a larger UI scale (Malkil's): 212 against 1,020
  ['surefall-fletching-kit.png', 883, 1],
  // 597 and 1104 are one bow in two colours: a tie the picker shows, top two.
  ['windstriker-ground.png', 1104, 2],
  ['windstriker-sky.png', 1104, 2]
]

for (const [file, id, within] of ICONS) {
  test(`ICON: ${file} FINDS ${String(id)} WITHIN THE TOP ${String(within)}`, { skip: NO_INSTALL }, async () => {
    const s = await read(file, readers)
    const rank = s.icons.findIndex((h) => h.id === id) + 1
    assert.ok(rank >= 1 && rank <= within, `rank ${String(rank)}: ${JSON.stringify(s.icons)}`)
  })
}

test("A LIZARDMAN SCOUT (THE OWNER'S PICTURE): THE NAMEPLATE IS FOUND, AND THE FILE IS NAMED AFTER THE IN-GAME NAME, NOT THE PAGE TITLE", async () => {
  // As mobs.json holds the page: title "A lizard man scout", its own imagefilename npc_a_lizard_man_scout.png.
  const page = { page: 'A lizard man scout', name: 'a lizardman scout', image: 'npc_a_lizard_man_scout.png', noImage: true as const }
  const [row] = imageGaps({ 'a lizardman scout': { display: 'a lizardman scout', count: 3 } } as never, [], [page])
  assert.equal(pictureFile(row), 'npc_a_lizardman_scout.png')
  // Read as it stands the busy scene gives noise; the near-white nameplate reading finds the name.
  const img = readPng(join(SHOTS, 'a-lizardman-scout-npc.png'))
  assert.equal(await showsName(img, row.name), true)
  assert.equal(await showsName(img, 'a gnoll pup'), false)
})

/** The owner's white wolf over snow (2026-10-22): a grey-con nameplate, grey letters, dark outline. */
test('A GREY NAMEPLATE OVER SNOW IS FOUND (a white wolf)', async () => {
  const img = readPng(join(SHOTS, 'a-white-wolf-npc.png'))
  assert.equal(await showsName(img, 'a white wolf'), true)
  assert.equal(await showsName(img, 'a gnoll pup'), false)
})

/** The wolf's grey letters recoloured (test only): the con colour can be any of seven (owner, 2026-10-22). */
function recolour(img: { w: number; h: number; data: Uint8Array }, rgb: readonly [number, number, number]): { w: number; h: number; data: Uint8Array } {
  const d = new Uint8Array(img.data)
  for (let y = 55; y < 115; y++) {
    for (let x = 100; x < 470; x++) {
      const i = (y * img.w + x) * 4
      const [r, g, b] = [d[i], d[i + 1], d[i + 2]]
      if (Math.max(r, g, b) - Math.min(r, g, b) > 18 || Math.min(r, g, b) < 90 || Math.max(r, g, b) > 190) continue
      const k = r / 160
      d.set([Math.min(255, rgb[0] * k), Math.min(255, rgb[1] * k), Math.min(255, rgb[2] * k)], i)
    }
  }
  return { w: img.w, h: img.h, data: d }
}

test('A NAMEPLATE IN ANY CON COLOUR IS FOUND (red, blue, green)', async () => {
  const img = readPng(join(SHOTS, 'a-white-wolf-npc.png'))
  for (const rgb of [[230, 40, 40], [40, 60, 240], [40, 220, 40]] as const) {
    assert.equal(await showsName(recolour(img, rgb), 'a white wolf'), true, String(rgb))
  }
})

/** The owner's upgraded and invoked Burst of Flame windows (2026-10-21): each is the base spell's page. */
const BURST_SHOTS: readonly [string, string | undefined, RegExp][] = [
  // tier 0, a cast-speed invocation on: Cast 1.5 sec (0.5), Recovery 1.5 sec (2.5 sec)
  ['burst-of-flame-invocation.png', undefined, /^A modifier was active \(Cast 0\.5, Recovery 2\.5 sec\)/],
  // tier 1, no invocation: Cast 1.5 sec (1.47), Resist Fire -15
  ['burst-of-flame-i-tier1.png', 'I', /^The rank or a modifier changed values \(Cast 1\.47/],
  // tier 1 and the invocation: Cast 1.5 sec (0.49), Recovery 1.5 sec (2.4 sec)
  ['burst-of-flame-i-tier1-invocation.png', 'I', /^The rank or a modifier changed values \(Cast 0\.49, Recovery 2\.4 sec/]
]

for (const [file, rank, modifier] of BURST_SHOTS) {
  test(`BURST OF FLAME, ${file.toUpperCase()}: THE BASE SPELL'S PAGE (CAST 1.50, RESIST FIRE), THE RANK AND THE MODIFIER NOTED`, async () => {
    const lines = (await readLines(readPng(join(SHOTS, file)))).map((l) => l.text)
    const r = readSpellWindow(lines, 'Creates a ball of fire that burns your target, doing between #1 and @1 damage.', 'Burst of Flame')
    assert.equal(r.name, 'Burst of Flame')
    assert.equal(r.rank, rank, JSON.stringify(lines))
    assert.equal(r.fields.casting_time, '1.50')
    assert.equal(r.fields.resist, 'Fire')
    assert.equal(r.description, 'Creates a ball of fire that burns your target, doing between 4 and 5 damage.')
    assert.ok(r.checks.some((c) => modifier.test(c)), r.checks.join(' | '))
    assert.equal(r.checks.some((c) => c.startsWith('An upgraded rank was read')), rank !== undefined)
  })
}

test("SICKLY MAIDEN'S HAIR, THE LORE TAB (THE OWNER'S, 2026-10-21): TWO WRAPPED LINES ARE ONE LORE; THE TITLE BAR'S JUNK IS NOT THE NAME", async () => {
  const s = await read('sickly-maidens-hair-lore.png', textOnly)
  assert.equal(s.read.lore, 'This sample of long, golden grass is tinged with disease')
  assert.equal(s.read.name, "Sickly Maiden's Hair")
  assert.equal(s.read.statsblock, '')
})

test("PETAMORPH WAND: WEREWOLF, THE LORE TAB WHOLE (THE OWNER'S, 2026-10-22): A TAB ROW READ AS 'Descriplic' IS STILL THE TAB ROW; THE SCROLLBAR IS NOT LORE", async () => {
  // The owner had to shrink and crop the window before it read ("ERROR: unable to read image"): OCR read
  // the tab row `VE A Descriplic y A rr Lore | hy.`, so the lore was that line.
  const s = await read('petamorph-wand-werewolf-lore.png', textOnly)
  assert.equal(s.read.lore, 'Likes moongazing.')
  assert.equal(s.read.name, 'Petamorph Wand: Werewolf')
  assert.equal(s.read.statsblock, '')
})

test("PETAMORPH WAND: WEREWOLF, ENLARGED (THE OWNER'S, 2026-10-22): THE CLICK EFFECT IS ONE CLEAN LINE; THE LORE TAB READS WITH ITS 'Lore' LOST", async () => {
  const w = await read('petamorph-wand-werewolf.png', textOnly)
  assert.equal(w.read.name, 'Petamorph Wand: Werewolf')
  assert.equal(w.read.loreTab, true)
  assert.ok(w.read.statsblock.includes('Effect: [[Summon Familiar: Werewolf]] (Can Equip, Casting Time: 5.0)<br>'), w.read.statsblock)
  assert.ok(w.read.statsblock.includes('No Trade, Attunable, Heirloom<br>') && w.read.statsblock.includes('Slot: AMMO<br>'), w.read.statsblock)
  // The tab row read as `Wr ~~ Descriplic TRVAC) N "ra . Coe:`: no Lore word, a slipped Description near the top.
  const l = await read('petamorph-wand-werewolf-lore-large.png', textOnly)
  assert.equal(l.read.lore, 'Likes moongazing.')
  assert.equal(l.read.name, 'Petamorph Wand: Werewolf')
})

test("WU'S FIST OF MASTERY +10 (AUGMENTED) (THE OWNER'S, 2026-10-21): THE +10 PATH, NO EXALTATION LINE, NO EFFECT AN EXALTATION GRANTS", async () => {
  const s = await read('wus-fist-of-mastery-10-augmented.png', textOnly)
  assert.equal(s.read.name, "Wu's Fist of Mastery")
  assert.equal(s.read.tier, 10)
  const got = lines(s)
  for (const want of ['No Trade, Placeable<br>', 'Slot: PRIMARY SECONDARY<br>', 'Size: TINY WT: 0.1<br>', 'Class: MNK<br>', 'Race: ALL<br>']) assert.ok(got.includes(want), `${want} in ${JSON.stringify(got)}`)
  // The Click and Proc slots hold Golem Metal Wand and Cherista's Fangs, which grant Pillage Enchantment
  // and Lifebite (items.json; Wu's Fist's own page has no effect): neither is written as the item's.
  assert.ok(!got.some((l) => /Exaltation|Ornamentation|Effect:/.test(l)), JSON.stringify(got))
  const checks = s.read.checks ?? []
  assert.ok(checks.some((c) => c.startsWith('Click effect Pillage Enchantment not written') && c.includes('Golem Metal Wand (Exaltation)')), JSON.stringify(checks))
  assert.ok(checks.some((c) => c.startsWith('Combat effect Lifebite not written') && c.includes("Proc Exaltation slot holds Cherista's Fangs (Exaltation)")), JSON.stringify(checks))
  // The +10 numbers are the upgraded item's: no +0 guess where they do not take back exactly.
  assert.ok(checks.some((c) => c.startsWith('This window is +10')), JSON.stringify(checks))
  assert.equal(s.read.baseStatsblock, undefined)
})
