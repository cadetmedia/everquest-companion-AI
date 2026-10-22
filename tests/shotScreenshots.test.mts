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
  test(`WINDSTRIKER, MALKIL'S UI (${file}): THE WEAPON, STATS AND EFFECT LINES; DMG 90; THE FOCUS APART`, async () => {
    const s = await read(file, textOnly)
    const got = lines(s)
    for (const want of ['Slot: RANGE<br>', 'Skill: Archery  Atk Delay: 60<br>', 'DMG: 90<br>', 'Range: 300<br>', 'SV VOID: +10<br>', 'Size: MEDIUM WT: 0.4<br>', 'Class: RNG<br>', 'Race: ALL<br>']) {
      assert.ok(got.includes(want), `${want} in ${JSON.stringify(got)}`)
    }
    assert.ok(got.some((l) => l.startsWith('STR: +15  AGI: +15  DEX: +15  HP: +100')), JSON.stringify(got))
    assert.ok(got.includes('Effect: [[Firestrike]] (Must Equip, Casting Time: Instant) at Level 40<br>'), JSON.stringify(got))
    assert.equal(s.read.focusEffect, 'Improved Healing III')
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
