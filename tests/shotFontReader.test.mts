// The exact-match font reader (owner, 2026-10-21: "Build the exact-match font reader (proof of
// concept: 0 wrong of 1,903 characters)": "sure do it"). The pure parts (the I/l pick, the merge into
// OCR's lines) run anywhere. The fixture checks need the player's own GDI Arial, so they run on
// Windows (the app's only platform, and CI's) and skip elsewhere, as the icon checks skip without an
// install. The text in tests/fixtures/shots was transcribed by eye for the proof of concept (body
// text only: no title bar, tab row or buttons).

import { after, test } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { arialAtlas } from '../src/main/shot/fontAtlas.ts'
import { EXACT_FIT, exactCells, mergeFont } from '../src/main/shot/fontMerge.ts'
import { readFont, type FontCell, type FontRead } from '../src/main/shot/fontReader.ts'
import { catalogTexts, resolveIl, wordCounts } from '../src/main/shot/fontWords.ts'
import { stopOcr, type OcrLine } from '../src/main/shot/ocr.ts'
import { readItemShot, type ItemShot, type ShotReaders } from '../src/main/shot/readItemShot.ts'
import { readPng } from './shotPng.mts'

const SHOTS = join(import.meta.dirname, 'fixtures', 'shots')
const atlas = arialAtlas()
const NO_GDI = atlas === null ? 'no GDI Arial here (the font reader is Windows only)' : false
const items = JSON.parse(readFileSync(join(import.meta.dirname, '..', 'src', 'main', 'data', 'items.json'), 'utf8')) as { items: Record<string, object> }
const counts = wordCounts(catalogTexts(Object.values(items.items)))

after(() => stopOcr())

// ---- the I/l pick and the merge: pure ----

test('I OR l: A RANK, CAPITALS AND THE CATALOG’S OWN SPELLING DECIDE', () => {
  const words = new Map([
    ['Instant', 700],
    ['Idol', 30],
    ['like', 5]
  ])
  assert.equal(resolveIl('Focus Effect: lmproved Healing lll', words), 'Focus Effect: lmproved Healing III')
  assert.equal(resolveIl('Class: NEC WlZ MAG ENC', words), 'Class: NEC WIZ MAG ENC')
  assert.equal(resolveIl('Cast Time: lnstant', words), 'Cast Time: Instant')
  assert.equal(resolveIl('ldol of the Underking', words), 'Idol of the Underking')
  // A capital I inside a lowercase word is never right; an unknown word keeps its l.
  assert.equal(resolveIl('like Shrubbery', words), 'like Shrubbery')
  assert.equal(resolveIl('Pet lllusion', counts), 'Pet Illusion')
})

const box = (x: number, y: number, w: number, h: number): { x: number; y: number; w: number; h: number } => ({ x, y, w, h })
const ocrLine = (words: [string, number, number][], y = 100, h = 10): OcrLine => {
  const ws = words.map(([text, x, w]) => ({ text, box: box(x, y, w, h) }))
  const x0 = Math.min(...ws.map((w) => w.box.x))
  const x1 = Math.max(...ws.map((w) => w.box.x + w.box.w))
  return { text: words.map((w) => w[0]).join(' '), box: box(x0, y, x1 - x0, h), lead: ws[0].box, words: ws }
}
const fontRead = (cells: FontCell[]): FontRead => ({ scale: 1, filter: 'bilinear', cells, ms: 0 })
const cell = (text: string, x: number, w: number, at: { fit?: number; y?: number; h?: number } = {}): FontCell => ({ text, fit: at.fit ?? 0.003, box: box(x, at.y ?? 100, w, at.h ?? 10) })

test('THE MERGE: AN EXACT CELL REPLACES THE OCR WORDS UNDER IT; THE REST OF THE LINE STAYS AS OCR READ IT', () => {
  const lines = [ocrLine([['PB', 20, 12], ['Weight', 40, 40], ['20', 90, 14]])]
  const got = mergeFont(lines, fontRead([cell('Weight:', 40, 42), cell('2.0', 90, 16)]), counts)
  assert.equal(got[0].text, 'PB Weight: 2.0')
  // OCR's box and lead are kept: the icon is placed from them.
  assert.deepEqual(got[0].box, lines[0].box)
  assert.deepEqual(got[0].lead, lines[0].lead)
})

test('THE MERGE: A CELL THAT IS NOT EXACT, OR ART WITH NO LETTER, CHANGES NOTHING', () => {
  const lines = [ocrLine([['Omamentation:', 40, 90], ['empty', 140, 36]])]
  const notExact = mergeFont(lines, fontRead([cell('Crnamer\\tatiur\\: er\\\'ipty', 40, 140, { fit: 0.28 })]), counts)
  assert.equal(notExact[0].text, 'Omamentation: empty')
  assert.equal(exactCells(fontRead([cell("'", 10, 2, { fit: 0.001 }), cell('1', 40, 4, { fit: EXACT_FIT })])).length, 1)
})

test('THE MERGE: A CELL ON A ROW OCR STRETCHED FROM THE ICON IS NOT THAT ROW’S (`8 Quest` AND `Class: None`)', () => {
  // OCR's `8` off the icon is 30 px tall and reaches the Class row; the Class cell is that row's.
  const quest: OcrLine = { ...ocrLine([['8', 10, 10], ['Quest', 73, 30]], 77, 10), box: box(10, 77, 93, 30) }
  const klass = ocrLine([['Class:', 73, 34], ['None', 112, 26]], 93, 9)
  const got = mergeFont([quest, klass], fontRead([cell('Quest', 73, 30, { y: 77 }), cell('Class: None', 73, 66, { y: 93, h: 9 })]), counts)
  assert.deepEqual(
    got.map((l) => l.text),
    ['8 Quest', 'Class: None']
  )
})

test('THE MERGE: NO LINE IS ADDED WHERE OCR READ NONE, AND A SLIVER OF ART BESIDE A LINE IS NOT TEXT', () => {
  const lines = [ocrLine([['Agility:', 40, 40], ['15', 110, 12]])]
  // `j` (art at 1.5x) beside the line, `Place` (a button) on a row OCR left empty.
  const got = mergeFont(lines, fontRead([cell('j', 160, 3), cell('Place', 40, 30, { y: 300 })]), counts)
  assert.deepEqual(
    got.map((l) => l.text),
    ['Agility: 15']
  )
  // A word OCR missed on its line joins it in place with 3+ letters or digits; a shorter one does not.
  const beside = mergeFont([ocrLine([['Size:', 20, 25], ['MEDIUM', 80, 45]])], fontRead([cell('Accuracy:', 150, 60), cell('1', 240, 4)]), counts)
  assert.equal(beside[0].text, 'Size: MEDIUM Accuracy:')
})

// ---- the fixtures: Windows ----

/** The proof of concept's transcriptions: one array per window row, a row's cells left to right. */
const WIND = [
  ['Windstriker +10'], ['Lore Equipped, No Trade, Placeable'], ['Class: RNG'], ['Race: ALL'], ['Range'],
  ['Tier: 10 / 10'], ['This item cannot be upgraded.'],
  ['Size: MEDIUM', 'HP: 100', 'Base Dmg: 90'], ['Weight: 0.4', 'Accuracy: +25%', 'Delay: 60'], ['Skill: Archery', 'Ratio: 1.5'], ['Range: 300'],
  ['Strength: 15', 'SV. Void: 10'], ['Agility: 15'], ['Dexterity: 15'], ['Modified', 'Windstriker +10'],
  ['Ornamentation: empty'], ['Focus Exaltation: Idol of the Underking (Exaltation)'], ['Click Exaltation: Rain Caller (Exaltation)'],
  ['Worn Exaltation: empty'], ['Proc Exaltation: empty'], ['Focus Effect: Improved Healing III'], ['Click Effect: Firestrike (Must Equip)'],
  ['Cast Time: Instant'], ['Required Level: 40'], ['Cooldown: 120 seconds'], ['This item is placeable in yards, guild yards, houses and guild halls.']
]
const TRUTH: Record<string, string[][]> = {
  'ruined-robe.png': [
    ['Ruined Robe'], ['Lore Equipped, No Trade, Temporary'], ['Class: NEC WIZ MAG ENC'], ['Race: ALL'], ['Chest'],
    ['Size: MEDIUM', 'AC: 1'], ['Weight: 2.0'], ['Charisma: -20', 'SV. Magic: -15'], ['SV. Fire: -15'], ['SV. Cold: -15'],
    ['SV. Disease: -15'], ['SV. Poison: -15'], ['Unmodified']
  ],
  'black-lizard-scale.png': [['Black Lizard Scale'], ['Quest'], ['Class: None'], ['Race: None'], ['Size: MEDIUM'], ['Weight: 2.0'], ['Unmodified'], ['Value: 3 silver 8 copper']],
  'lizardman-mystic-scale.png': [['Lizardman Mystic Scale'], ['No Trade, Quest'], ['Class: ALL'], ['Race: ALL'], ['Size: SMALL'], ['Weight: 0.1'], ['Unmodified']],
  'vial-of-swamp-water.png': [['Vial of Swamp Water'], ['No Trade, Quest'], ['Class: None'], ['Race: None'], ['Size: TINY'], ['Weight: 1.0'], ['Unmodified']],
  'shrubbery-lore.png': [['Ordinary Plant']],
  'surefall-fletching-kit.png': [
    ['Surefall Fletching Kit'], ['No Trade'], ['Class: ALL'], ['Race: ALL'], ['Karana'], ['Size: SMALL'], ['Weight: 0.1'],
    ['Capacity: 8'], ['Size Cap: GIANT'], ['Unmodified'], ['Container: CLOSED.']
  ],
  'windstriker-ground.png': WIND,
  'windstriker-sky.png': WIND
}

/** The cheapest edit of `pat` into any part of `txt`. */
function fitDist(pat: string, txt: string): number {
  let prev = new Array<number>(txt.length + 1).fill(0)
  for (let i = 1; i <= pat.length; i++) {
    const cur = [i]
    for (let j = 1; j <= txt.length; j++) cur[j] = Math.min(prev[j] + 1, cur[j - 1] + 1, prev[j - 1] + (pat[i - 1] === txt[j - 1] ? 0 : 1))
    prev = cur
  }
  return Math.min(...prev)
}

/** Characters wrong against the transcription: each cell's cheapest edit into any line read. */
function wrong(file: string, lines: readonly string[]): { wrong: number; total: number } {
  const read = lines.map((l) => l.replace(/\s+/g, ' ').trim())
  let w = 0
  let total = 0
  for (const c of TRUTH[file].flat()) {
    w += Math.min(c.length, ...read.map((l) => fitDist(c, l)))
    total += c.length
  }
  return { wrong: w, total }
}

/** Cells as lines, one per row of the font reader's layout. */
function rowLines(cells: readonly FontCell[]): string[] {
  const rows = new Map<number, FontCell[]>()
  for (const c of cells) rows.set(c.box.y, [...(rows.get(c.box.y) ?? []), c])
  return [...rows.values()].map((r) => r.map((c) => resolveIl(c.text, counts)).join('   '))
}

const ocrOnly: ShotReaders = { index: () => Promise.resolve(null), cell: () => null, textures: () => [] }
const withFont: ShotReaders = { ...ocrOnly, font: (img) => Promise.resolve(atlas === null ? null : readFont(img, atlas)), words: () => counts }

const cache = new Map<string, Promise<ItemShot>>()
function read(file: string, font: boolean): Promise<ItemShot> {
  const key = `${file}|${String(font)}`
  if (!cache.has(key)) cache.set(key, readItemShot(readPng(join(SHOTS, file)), font ? withFont : ocrOnly))
  return cache.get(key)!
}

test('THE GDI ATLAS: ALL 95 PRINTABLE GLYPHS OF 12 PX ARIAL, ASCENT 12, DESCENT 3', { skip: NO_GDI }, () => {
  assert.equal(Object.keys(atlas!.glyphs).length, 95)
  assert.deepEqual([atlas!.ascent, atlas!.descent], [12, 3])
  // `I` and `l` are one bitmap: the reason the reader writes `l` for both (fontWords.ts).
  assert.deepEqual(atlas!.glyphs.I.cov, atlas!.glyphs.l.cov)
})

test('THE PROOF OF CONCEPT HOLDS: THE FONT READER READS 0 WRONG OF 1,903 CHARACTERS; WITH OCR FOR THE REST, FAR FEWER WRONG THAN OCR ALONE', { skip: NO_GDI }, async (t) => {
  const sum = { font: 0, exact: 0, merged: 0, ocr: 0, total: 0 }
  for (const file of Object.keys(TRUTH)) {
    const r = readFont(readPng(join(SHOTS, file)), atlas!)
    const f = wrong(file, rowLines(r.cells))
    const e = wrong(file, rowLines(exactCells(r)))
    const m = wrong(file, (await read(file, true)).lines)
    const o = wrong(file, (await read(file, false)).lines)
    t.diagnostic(`${file} scale ${String(r.scale)}: font ${String(f.wrong)}, exact cells only ${String(e.wrong)}, font+OCR ${String(m.wrong)}, OCR ${String(o.wrong)} of ${String(f.total)}`)
    assert.equal(f.wrong, 0, `${file}: ${JSON.stringify(rowLines(r.cells))}`)
    sum.font += f.wrong
    sum.exact += e.wrong
    sum.merged += m.wrong
    sum.ocr += o.wrong
    sum.total += f.total
  }
  t.diagnostic(`TOTAL ${JSON.stringify(sum)}`)
  assert.equal(sum.total, 1903)
  assert.equal(sum.font, 0)
  // The few cells the font decodes right but does not trust (a dim name, the Tier label) stay OCR's.
  assert.ok(sum.merged <= 5 && sum.ocr >= 30, JSON.stringify(sum))
})

test('A UI SCALE THE FONT DOES NOT FIT (WU’S FIST AT 0.91, THE MUMMY WINDOWS AT 1.24-1.30): NO CELL, OCR READS IT ALONE', { skip: NO_GDI }, () => {
  for (const file of ['wus-fist-of-mastery-10-augmented.png', 'petamorph-wand-mummy.png', 'petamorph-wand-mummy-lore.png']) {
    const r = readFont(readPng(join(SHOTS, file)), atlas!)
    assert.deepEqual([r.scale, r.cells.length], [0, 0], file)
  }
})

/** Where the font reader changes the reading, and how; every other item fixture reads the same. */
const CHANGED: Record<string, (ocr: ItemShot, font: ItemShot) => void> = {
  // OCR lost the space: `BlackLizard Scale`.
  'black-lizard-scale.png': (o, f) => {
    assert.equal(o.read.name, 'BlackLizard Scale')
    assert.equal(f.read.name, 'Black Lizard Scale')
  },
  // OCR read `Base Dmg: 920` and the Ratio check repaired it; the font reads 90.
  'windstriker-ground.png': (o, f) => {
    assert.ok(o.read.checks?.some((c) => c.startsWith('DMG read as 920')))
    assert.ok(!f.read.checks?.some((c) => c.startsWith('DMG read as')), JSON.stringify(f.read.checks))
  },
  // OCR read `Altunable` and the flag check repaired it; the font reads Attunable.
  'earring-of-experimentation.png': (o, f) => {
    assert.ok(o.read.checks?.includes('Flag read as "Altunable", taken as Attunable.'))
    assert.equal(f.read.checks, undefined)
  }
}

const ITEM_FIXTURES = [
  'ruined-robe.png', 'black-lizard-scale.png', 'vial-of-swamp-water.png', 'surefall-fletching-kit.png', 'windstriker-ground.png', 'windstriker-sky.png',
  'shrubbery-lore.png', 'sickly-maidens-hair-lore.png', 'petamorph-wand-werewolf-lore.png', 'petamorph-wand-werewolf.png', 'petamorph-wand-werewolf-lore-large.png',
  'earring-of-experimentation.png', 'earring-of-experimentation-lore.png', 'earring-of-experimentation-lore-wide.png', 'peerless-sapphire-lore.png',
  'peerless-sapphire-lore-cropped.png', 'wus-fist-of-mastery-10-augmented.png', 'petamorph-wand-mummy.png', 'petamorph-wand-mummy-lore.png',
  'signet-ring-of-lord-everling.png', 'lizardman-mystic-scale.png', 'plea-to-freeport.png', 'plea-to-freeport-lore.png', 'solusek-petition.png', 'solusek-petition-lore.png'
]

for (const file of ITEM_FIXTURES) {
  test(`${file}: WITH THE FONT READER THE PAGE IS OCR'S, OR BETTER WHERE OCR SLIPPED`, { skip: NO_GDI }, async () => {
    const o = await read(file, false)
    const f = await read(file, true)
    const page = (s: ItemShot): unknown => ({ name: s.read.name, lore: s.read.lore, statsblock: s.read.statsblock, base: s.read.baseStatsblock, unread: s.read.unread, checks: s.read.checks })
    if (CHANGED[file] === undefined) assert.deepEqual(page(f), page(o))
    else {
      CHANGED[file](o, f)
      assert.deepEqual({ ...(page(f) as object), name: undefined, checks: undefined }, { ...(page(o) as object), name: undefined, checks: undefined })
    }
  })
}
