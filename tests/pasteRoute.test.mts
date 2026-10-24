// pasteRoute: a picture pasted anywhere is told apart and sent where it belongs (owner, 2026-10-23: "I
// should be able to paste quest images in ANYWHERE"). The popups are the owner's tutorial windows (no
// character name in them), read by the real local OCR; the chains are shaped like the tutorial's three.
import { after, test } from 'node:test'
import assert from 'node:assert/strict'
import { join } from 'node:path'
import { readPopupLines } from '../src/main/shot/popupLines.ts'
import { stopOcr } from '../src/main/shot/ocr.ts'
import { popupRead, readPopup, type QuestPopup } from '../src/shared/questPopup.ts'
import { nameplateRow, namesIn, ordinalOf, pictureKind, placesKey, routePopup, threadTargets, type ThreadLike } from '../src/shared/pasteRoute.ts'
import { readPng } from './shotPng.mts'

after(() => stopOcr())

const SHOTS = join(import.meta.dirname, 'fixtures', 'shots')
const read = async (file: string): Promise<{ lines: string[]; popup: QuestPopup | null }> => {
  const r = await readPopupLines(readPng(join(SHOTS, file)))
  return { lines: r.lines, popup: readPopup(r) }
}

const POPUPS = [
  'popup-tutorial-navigation.png',
  'popup-tutorial-first-quest-reward.png',
  'popup-tutorial-combat.png',
  'popup-tutorial-skills-and-abilities.png',
  'popup-tutorial-spells.png',
  'popup-tutorial-item-merging.png',
  'popup-tutorial-your-first-quest.png',
  'popup-tutorial-a-few-assorted-notes.png',
  'popup-first-aa-point.png'
]

test('what a pasted picture is: popups (one with no title), a Quest Journal, item windows and Lore tabs, and the rest', async () => {
  for (const f of POPUPS) assert.equal(pictureKind(...Object.values(await read(f)) as [string[], QuestPopup | null]), 'popup', f)
  assert.equal(pictureKind(...Object.values(await read('quest-journal-something-fishy.png')) as [string[], QuestPopup | null]), 'journal')
  for (const f of ['earring-of-experimentation.png', 'black-lizard-scale.png', 'earring-of-experimentation-lore.png', 'plea-to-freeport-lore.png']) {
    assert.equal(pictureKind(...Object.values(await read(f)) as [string[], QuestPopup | null]), 'item', f)
  }
  for (const f of ['raul-npc.png', 'a-white-wolf-npc.png']) assert.equal(pictureKind(...Object.values(await read(f)) as [string[], QuestPopup | null]), 'other', f)
})

const zone = 'EverQuest Legends Tutorial'
const boots = [{ name: 'Boots of the Long Road' }]
/** The tutorial's three errands as the engine's chains give them. */
const THREADS: ThreadLike[] = [
  {
    id: 'Doug@1',
    name: "Old Doug's supplies",
    zone,
    startMs: 1_000,
    steps: [
      { kind: 'talk', npc: 'Doug', said: ["let's talk"] },
      { kind: 'talk', npc: 'Old Doug', said: ['help', 'supplies'] },
      { kind: 'buy', npc: 'Dougina', items: [{ name: 'Package for Old Doug' }] },
      { kind: 'handin', npc: 'Old Doug', items: [{ name: 'Package for Old Doug' }] },
      { kind: 'reward', npc: 'Old Doug', items: boots }
    ],
    rewards: boots
  },
  {
    id: 'Doug@2',
    name: "Dead Doug's bones",
    zone,
    startMs: 2_000,
    steps: [
      { kind: 'talk', npc: 'Doug', said: ['more work'] },
      { kind: 'talk', npc: 'Dead Doug', said: ['help', 'fragile ones'] },
      { kind: 'kill', mob: 'a fragile pet' },
      { kind: 'loot', items: [{ name: "Fragile Pet's Skull" }] },
      { kind: 'kill', mob: 'a rambunctious pet' },
      { kind: 'handin', npc: 'Dead Doug', items: [{ name: "Fragile Pet's Skull" }, { name: "Rambunctious Pet's Skull" }] },
      { kind: 'reward', npc: 'Dead Doug', items: boots }
    ],
    rewards: boots
  },
  { id: 'Doug@3', name: "Doug's send-off", zone, startMs: 3_000, steps: [{ kind: 'talk', npc: 'Doug', said: ['finished', 'ready to leave', 'send'] }] }
]
const TARGETS = threadTargets(THREADS)

test('names are matched longest first: Old Doug is not also Doug, Dead Doug is not also Doug', () => {
  const names = [
    { name: 'old doug', kind: 'npc' as const },
    { name: 'dead doug', kind: 'npc' as const },
    { name: 'doug', kind: 'npc' as const }
  ]
  assert.deepEqual([...namesIn('Find your way to Old Doug, in the caves', names)], ['old doug'])
  assert.deepEqual([...namesIn('Continue to talk with Doug as he will', names)], ['doug'])
  assert.equal(ordinalOf('Your First Quest Reward!'), 0)
  assert.equal(ordinalOf('You received a second pair of boots'), 1)
})

test('the tutorial popups go where they belong; one that names no quest is never forced onto one', async () => {
  const where: Record<string, string | undefined> = {}
  const why: Record<string, string> = {}
  for (const f of POPUPS) {
    const { popup } = await read(f)
    assert.ok(popup !== null, f)
    const r = routePopup(popup, TARGETS)
    where[f] = r.hit === undefined ? undefined : `${r.hit.key}#${String(r.hit.step)}`
    why[f] = r.why
  }
  // Old Doug is in the first errand only; the Navigation window sends you to him.
  assert.equal(where['popup-tutorial-navigation.png'], 'thread:Doug@1#2')
  // Both errands end in the boots: "Your FIRST Quest Reward!" is the first, "a SECOND pair" the second.
  assert.equal(where['popup-tutorial-first-quest-reward.png']?.split('#')[0], 'thread:Doug@1')
  assert.equal(why['popup-tutorial-first-quest-reward.png'], 'ordinal')
  assert.equal(where['popup-tutorial-item-merging.png']?.split('#')[0], 'thread:Doug@2')
  // "Your first quest!": Doug gives all three; "first" picks the first.
  assert.equal(where['popup-tutorial-your-first-quest.png']?.split('#')[0], 'thread:Doug@1')
  // Windows naming nobody wait unsorted, never forced: the tutorial's lessons and the AA point.
  for (const f of ['popup-tutorial-combat.png', 'popup-tutorial-skills-and-abilities.png', 'popup-tutorial-spells.png', 'popup-tutorial-a-few-assorted-notes.png', 'popup-first-aa-point.png']) {
    assert.equal(where[f], undefined, f)
    assert.equal(why[f], 'none', f)
  }
})

test('a window named by the one before it follows it; the last place is offered first, never taken', async () => {
  const combat = (await read('popup-tutorial-combat.png')).popup
  const skills = (await read('popup-tutorial-skills-and-abilities.png')).popup
  const spells = (await read('popup-tutorial-spells.png')).popup
  assert.ok(combat !== null && skills !== null && spells !== null)
  // The player moved Combat onto the first errand: Skills and Abilities follows, and Spells after it.
  const s = routePopup(skills, TARGETS, { attached: { 'thread:Doug@1': [combat] } })
  assert.equal(s.hit?.key, 'thread:Doug@1')
  assert.equal(s.why, 'chain')
  assert.equal(routePopup(spells, TARGETS, { attached: { 'thread:Doug@1': [combat, skills] } }).hit?.key, 'thread:Doug@1')
  // A window naming nobody, pasted right after one that went to the second errand: offered first, not taken.
  const aa = (await read('popup-first-aa-point.png')).popup
  assert.ok(aa !== null)
  const r = routePopup(aa, TARGETS, { recent: { key: 'thread:Doug@2', ms: 1_000 }, nowMs: 2_000 })
  assert.equal(r.hit, undefined)
  assert.equal(r.ranked[0].key, 'thread:Doug@2')
})

test('Merchanting (as read): "Buy the Supplies for Old Doug from the merchant" is the first errand, at its buy step', () => {
  const merchanting: QuestPopup = {
    title: 'Merchanting',
    paragraphs: [
      { text: "You've made it to the store!" },
      { text: "Most merchants don't like to talk much about anything other than buying and selling goods." },
      { text: 'Buy the Supplies for Old Doug from the merchant.' }
    ],
    steps: ['Buy the Supplies for Old Doug from the merchant.']
  }
  const r = routePopup(merchanting, TARGETS)
  assert.equal(r.hit?.key, 'thread:Doug@1')
  assert.equal(r.hit?.step, 3)
})

test('a nameplate picture names its Mobs row, through a slip; a short name only as a whole word', () => {
  const names = ['a fragile pet', 'a rambunctious pet', 'Raul', 'Doug']
  assert.equal(nameplateRow(['< - iZ 2 “afragile pe .', 'a fragile pet » _ Fy i'], names), 'a fragile pet')
  assert.equal(nameplateRow(['. alrambunctious pet -4', 'HERE ROTS'], names), 'a rambunctious pet')
  assert.equal(nameplateRow(['ay 5 ht Raul: » od | -'], names), 'Raul')
  assert.equal(nameplateRow(['TERN =F SAE', 'Ser a f we, g'], names), undefined)
  assert.equal(nameplateRow(['Dougal'], names), undefined)
})

test('placesKey moves when a Quests row or a chain appears, and only then', () => {
  const rows = [{ domain: 'quest' }, { domain: 'mob' }]
  const a = placesKey(rows, [{ id: 't1' }])
  assert.equal(a, placesKey([...rows, { domain: 'item' }], [{ id: 't1' }]))
  assert.notEqual(a, placesKey([...rows, { domain: 'quest' }], [{ id: 't1' }]))
  assert.notEqual(a, placesKey(rows, [{ id: 't1' }, { id: 't2' }]))
})

test('reward windows on chains with no reward line (as the engine serves the tutorial): by the ordinal, read through the app path', async () => {
  const bare = threadTargets(THREADS.map(({ rewards: _r, ...t }) => t))
  // The app's reply: main's whole popup read, through popupRead (the item-link flags and the title bar kept).
  const viaApp = async (file: string): Promise<QuestPopup | null> => readPopup(popupRead({ ...(await readPopupLines(readPng(join(SHOTS, file)))) }))
  const reward = await viaApp('popup-tutorial-first-quest-reward.png')
  const merging = await viaApp('popup-tutorial-item-merging.png')
  const spells = await viaApp('popup-tutorial-spells.png')
  assert.deepEqual(reward?.rewards, ['Boots of the Long Road'])
  assert.equal(spells?.title, 'Spells')
  assert.equal(routePopup(reward as QuestPopup, bare).hit?.key, 'thread:Doug@1')
  assert.equal(routePopup(merging as QuestPopup, bare).hit?.key, 'thread:Doug@2')
})

test('chains that open on the same greeting are ordered by their own errand; ids may hold a colon', async () => {
  const greet = { kind: 'talk', npc: 'Doug', ms: 100 }
  const tied: ThreadLike[] = [
    { id: 'Doug@100:handin:Dead Doug:Skull', name: 'Doug: more work', zone, startMs: 100, steps: [greet, { kind: 'talk', npc: 'Doug', said: ['more work'], ms: 900 }, { kind: 'handin', npc: 'Dead Doug', ms: 1200, items: [{ name: 'Skull' }] }] },
    { id: 'Doug@100:handin:Old Doug:Package', name: "Doug: let's talk", zone, startMs: 100, steps: [greet, { kind: 'talk', npc: 'Doug', said: ["let's talk"], ms: 300 }, { kind: 'handin', npc: 'Old Doug', ms: 600, items: [{ name: 'Package' }] }] }
  ]
  const targets = threadTargets(tied)
  const viaApp = async (file: string): Promise<QuestPopup | null> => readPopup(popupRead({ ...(await readPopupLines(readPng(join(SHOTS, file)))) }))
  assert.equal(routePopup((await viaApp('popup-tutorial-first-quest-reward.png')) as QuestPopup, targets).hit?.key, "thread:Doug@100:handin:Old Doug:Package")
  assert.equal(routePopup((await viaApp('popup-tutorial-item-merging.png')) as QuestPopup, targets).hit?.key, 'thread:Doug@100:handin:Dead Doug:Skull')
})
