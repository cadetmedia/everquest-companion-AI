// A picture pasted into a Gaps row's box that is another kind of window (owner, 2026-10-25: "lets make
// this thing smart so whatever we paste it can scrape the data into the appropriate area"): told from
// the plain OCR lines the box reads (the real OCR on the committed screenshots), never kept on the wrong
// row, offered the row that takes it by name.

import { after, test } from 'node:test'
import assert from 'node:assert/strict'
import { join } from 'node:path'
import { readLines, stopOcr } from '../src/main/shot/ocr.ts'
import { misfitOf, pastedKind, type PasteRows } from '../src/shared/rowPaste.ts'
import { readPng } from './shotPng.mts'

after(() => stopOcr())

const SHOTS = join(import.meta.dirname, 'fixtures', 'shots')
const cache = new Map<string, Promise<string[]>>()
/** The lines a row's box reads (shotReadItem and shotReadText both use the plain read). */
const lines = (file: string): Promise<string[]> => {
  if (!cache.has(file)) cache.set(file, readLines(readPng(join(SHOTS, file))).then((ls) => ls.map((l) => l.text)))
  return cache.get(file) as Promise<string[]>
}

const ROWS: PasteRows = {
  items: ['Ruined Robe', 'Black Lizard Scale', 'Petamorph Wand: Mummy'],
  spells: ['Burst of Flame', 'Familiar: Mummy'],
  pictures: [
    { name: 'Raul', file: 'npc_Raul.png' },
    { name: 'Trooni Thimblethumb', file: 'npc_Trooni_Thimblethumb.png' }
  ]
}
const NO_ROWS: PasteRows = { items: [], spells: [], pictures: [] }

test('what a picture is, from the plain read: item windows and Lore tabs, spell windows, journals, popups by their closing line, the rest', async () => {
  for (const f of ['ruined-robe.png', 'black-lizard-scale.png', 'shrubbery-lore.png', 'petamorph-wand-mummy.png', 'windstriker-sky.png']) assert.equal(pastedKind(await lines(f)), 'item', f)
  for (const f of ['burst-of-flame-spell.png', 'burst-of-flame-i-tier1-invocation.png', 'spell-familiar-mummy.png', 'spell-pet-illusion-mummy.png']) assert.equal(pastedKind(await lines(f)), 'spell', f)
  assert.equal(pastedKind(await lines('quest-journal-something-fishy.png')), 'journal')
  for (const f of ['popup-tutorial-navigation.png', 'popup-tutorial-combat.png', 'popup-tutorial-item-merging.png']) assert.equal(pastedKind(await lines(f)), 'popup', f)
  for (const f of ['raul-npc.png', 'a-white-wolf-npc.png', 'trooni-thimblethumb-npc.png', 'a-lizardman-scout-npc.png']) assert.equal(pastedKind(await lines(f)), 'other', f)
})

test('a spell window pasted on an Items row is not kept there: it names the spell and offers its Spells row', async () => {
  const m = misfitOf(await lines('burst-of-flame-spell.png'), { box: 'item', row: 'Ruined Robe' }, ROWS)
  assert.equal(m?.kind, 'spell')
  assert.equal(m.name, 'Burst of Flame')
  assert.equal(m.row, 'Burst of Flame')
  assert.equal(m.action, 'Keep it on Burst of Flame')
  assert.equal(m.text, 'This is a spell display window (Burst of Flame), not an item window or its Lore tab: nothing was kept on Ruined Robe. It belongs on the Spells row Burst of Flame.')
  // No Spells row by that name: said so, and its own reader offered (it keeps the window under the spell's name).
  const none = misfitOf(await lines('burst-of-flame-spell.png'), { box: 'item', row: 'Ruined Robe' }, NO_ROWS)
  assert.equal(none?.row, undefined)
  assert.match(none?.text ?? '', /No Spells row is named Burst of Flame\.$/)
  assert.equal(none?.action, 'Read it as a spell display window')
})

test('an item window pasted on a Spells row or a Mobs row offers its Items row, through the OCR slips the capture allows', async () => {
  const onSpell = misfitOf(await lines('ruined-robe.png'), { box: 'spell', row: 'Burst of Flame' }, ROWS)
  assert.deepEqual([onSpell?.kind, onSpell?.row, onSpell?.action], ['item', 'Ruined Robe', 'Keep it on Ruined Robe'])
  // `BlackLizard Scale` as read: still the Black Lizard Scale row.
  const onMob = misfitOf(await lines('black-lizard-scale.png'), { box: 'mob', row: 'Raul' }, ROWS)
  assert.equal(onMob?.row, 'Black Lizard Scale')
  assert.match(onMob?.text ?? '', /^This is an item window \(BlackLizard Scale\), not a picture of Raul: it was not saved\. It belongs on the Items row Black Lizard Scale\.$/)
  // A Lore tab is an item window's part: the same offer (when the plain read shows its tab row; the
  // Mummy wand's and Peerless Sapphire's do not, and their box says it read no spell window).
  const lore = misfitOf(await lines('sickly-maidens-hair-lore.png'), { box: 'spell', row: 'Familiar: Mummy' }, ROWS)
  assert.equal(lore?.kind, 'item')
})

test("a box's own kind is never a misfit, and a mob row keeps every real mob picture (nothing blocks its save)", async () => {
  assert.equal(misfitOf(await lines('ruined-robe.png'), { box: 'item', row: 'Ruined Robe' }, ROWS), undefined)
  assert.equal(misfitOf(await lines('burst-of-flame-spell.png'), { box: 'spell', row: 'Burst of Flame' }, ROWS), undefined)
  assert.equal(misfitOf(await lines('quest-journal-something-fishy.png'), { box: 'quest', row: 'Something Fishy' }, ROWS), undefined)
  assert.equal(misfitOf(await lines('popup-tutorial-navigation.png'), { box: 'quest', row: 'Navigation' }, ROWS), undefined)
  for (const f of ['raul-npc.png', 'a-white-wolf-npc.png', 'trooni-thimblethumb-npc.png', 'a-lizardman-scout-npc.png']) {
    assert.equal(misfitOf(await lines(f), { box: 'mob', row: 'a white wolf' }, ROWS), undefined, f)
  }
})

test("a mob's picture pasted on an Items or Spells row offers its own row's file; a picture naming no row is left to the box's own reader", async () => {
  const m = misfitOf(await lines('trooni-thimblethumb-npc.png'), { box: 'item', row: 'Ruined Robe' }, ROWS)
  assert.deepEqual([m?.kind, m?.row, m?.file, m?.action], ['mob', 'Trooni Thimblethumb', 'npc_Trooni_Thimblethumb.png', 'Save it as npc_Trooni_Thimblethumb.png'])
  assert.equal(misfitOf(await lines('raul-npc.png'), { box: 'spell', row: 'Burst of Flame' }, ROWS)?.row, 'Raul')
  // Its own row's picture on its own row is no misfit; a wolf no row names is nothing known.
  assert.equal(misfitOf(await lines('a-white-wolf-npc.png'), { box: 'item', row: 'Ruined Robe' }, ROWS), undefined)
})

test('a Quest Journal or a popup pasted on an item, spell or mob row is sent to the quests, never kept on the row', async () => {
  const j = misfitOf(await lines('quest-journal-something-fishy.png'), { box: 'spell', row: 'Burst of Flame' }, ROWS)
  assert.deepEqual([j?.kind, j?.action], ['journal', 'Read it as a Quest Journal'])
  const p = misfitOf(await lines('popup-tutorial-navigation.png'), { box: 'mob', row: 'Raul' }, ROWS)
  assert.deepEqual([p?.kind, p?.action], ['popup', 'Send it to its quest'])
  assert.match(p?.text ?? '', /^This is a popup window, not a picture of Raul: it was not saved\. A popup goes to the quest it names\.$/)
  // An item or spell window on a Quests row is offered its row too.
  assert.equal(misfitOf(await lines('spell-familiar-mummy.png'), { box: 'quest', row: 'Navigation' }, ROWS)?.row, 'Familiar: Mummy')
})

test('the rules on lines alone: a popup only by its closing line (a chat window is prose too), a spell row through a slip', () => {
  assert.equal(pastedKind(['Goodurden tells General:1, \'one would have think they could have it released bug free\'', 'Revilus tells the guild, \'that robe is hella good, way better than the one I had\'']), 'other')
  assert.equal(pastedKind(['Some text here', "Click 'OK' to continue."]), 'popup')
  const spell = ['Spell: Burst of Fiame', 'Mana: 4', 'Cast: 1.5 sec', 'Range: 200']
  assert.equal(misfitOf(spell, { box: 'item', row: 'Ruined Robe' }, ROWS)?.row, 'Burst of Flame')
  // Two rows as near: none is offered.
  assert.equal(misfitOf(spell, { box: 'item', row: 'Ruined Robe' }, { ...ROWS, spells: ['Burst of Flame', 'Burst of Fiamb'] })?.row, undefined)
})
