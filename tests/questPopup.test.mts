// Popup windows read into quest pages (owner, 2026-10-23: "doug gives a quest text and a popup ... i need
// it to know about this so i can create the quest page"). The real OCR runs on the owner's own pictures
// of the EverQuest Legends Tutorial's windows (tests/fixtures/shots/popup-*.png, no character name in
// them); the Merchanting and Spells windows were given as text, so they are fed in as read lines.

import { after, test } from 'node:test'
import assert from 'node:assert/strict'
import { join } from 'node:path'
import { readPopupLines } from '../src/main/shot/popupLines.ts'
import { stopOcr } from '../src/main/shot/ocr.ts'
import { cleanPopupLine, isJournalPicture, namesWindow, orderPopups, popupCheckLines, popupRewards, readPopup, type PopupLineRead, type QuestPopup } from '../src/shared/questPopup.ts'
import { questDraftPage } from '../src/shared/gapQuestPage.ts'
import { mergeQuestPage } from '../src/shared/gapQuestMerge.ts'
import type { QuestLog } from '../src/shared/gapQuests.ts'
import { readPng } from './shotPng.mts'

const SHOTS = join(import.meta.dirname, 'fixtures', 'shots')
after(() => stopOcr())

const popupOf = async (file: string): Promise<QuestPopup | null> => readPopup(await readPopupLines(readPng(join(SHOTS, file))))

/** Lines as main would hand them over: each 18 px below the last, a blank line where `''` stands. */
function shaped(title: string, rows: [string, PopupLineRead['tones'][number]][]): PopupLineRead {
  const out: PopupLineRead = { lines: [], tops: [], heights: [], tones: [], titleLines: [title], titleBottom: 22 }
  let top = 30
  for (const [text, tone] of rows) {
    if (text === '') {
      top += 18
      continue
    }
    out.lines.push(text)
    out.tops.push(top)
    out.heights.push(12)
    out.tones.push(tone)
    top += 18
  }
  return out
}

test('Navigation: title, paragraphs under their yellow sub-headings, the orange instruction as a step', async () => {
  const p = await popupOf('popup-tutorial-navigation.png')
  assert.ok(p !== null)
  assert.equal(p.title, 'Navigation')
  assert.deepEqual(p.steps, ['Find your way to Old Doug, in the caves to the South of your current position.'])
  assert.deepEqual(p.paragraphs.map((x) => x.heading).filter((h) => h !== undefined), ['Map:', 'Compass:', 'Find:'])
  assert.ok(p.paragraphs[0].text.startsWith('While this town is small, Norrath is large!'), p.paragraphs[0].text)
  // The scrollbar's marks and the closing boilerplate are gone; nothing under the closing line is kept.
  assert.ok(!p.paragraphs.some((x) => /\bt i$|Click 'OK'|continue\./.test(x.text)))
  assert.equal(p.next, undefined)
})

test('Your First Quest Reward!: the magenta item and the experience are the reward; the orange tip is no step', async () => {
  const p = await popupOf('popup-tutorial-first-quest-reward.png')
  assert.ok(p !== null)
  assert.equal(p.title, 'Your First Quest Reward!')
  assert.deepEqual(p.rewards, ['Boots of the Long Road'])
  assert.equal(p.experience, true)
  assert.deepEqual(p.steps, [], 'These boots have an activatable effect ... is a tip, not an instruction')
})

test('Combat: the con colours are one list, dim Grey restored from the scale; the closing line names the next window', async () => {
  const p = await popupOf('popup-tutorial-combat.png')
  assert.ok(p !== null)
  assert.equal(p.title, 'Combat')
  assert.equal(p.next, 'Skills and Abilities')
  assert.deepEqual(p.steps, [])
  const list = p.paragraphs.find((x) => x.list !== undefined)?.list ?? []
  assert.deepEqual(list.map((i) => i.split(':')[0]), ['Grey', 'Green', 'Light Blue', 'Dark Blue', 'White', 'Yellow', 'Red'])
})

test('Skills and Abilities: read, chained to Spells and Magic; pasted first, it still follows Combat', async () => {
  const skills = await popupOf('popup-tutorial-skills-and-abilities.png')
  const combat = await popupOf('popup-tutorial-combat.png')
  assert.ok(skills !== null && combat !== null)
  assert.equal(skills.title, 'Skills and Abilities')
  assert.equal(skills.next, 'Spells and Magic')
  assert.deepEqual(orderPopups([skills, combat]).map((x) => x.title), ['Combat', 'Skills and Abilities'])
})

test('Merchanting (as read): the instruction is a step, the window prose is not; a missing space is kept as printed', () => {
  const p = readPopup(
    shaped('Merchanting', [
      ["You've made it to the store!", 'white'],
      ['', 'white'],
      ['Most merchants don\'t like to talk much about anything other than buying and selling goods.', 'white'],
      ['', 'white'],
      ['Talking to a merchant is like talking to any other NPC, simply target them and press [H] to hail them. To see what the merchant', 'white'],
      ['has for sale, or to sell items to them,[right clicking] on the merchant opens the merchant window.', 'white'],
      ['', 'white'],
      ['To Buy an item, select the item in the merchant window, and then press the Buy button.', 'white'],
      ['', 'white'],
      ['To Sell items to the merchant, right click on the item in your inventory (or within your bags) then click the Sell button.', 'white'],
      ['', 'white'],
      ['Buy the Supplies for Old Doug from the merchant.', 'orange'],
      ['', 'white'],
      ["Click 'OK' to continue.", 'orange']
    ])
  )
  assert.ok(p !== null)
  assert.equal(p.title, 'Merchanting')
  assert.deepEqual(p.steps, ['Buy the Supplies for Old Doug from the merchant.'])
  assert.equal(p.paragraphs.length, 6)
  assert.ok(p.paragraphs[2].text.includes('them,[right clicking] on the merchant'))
})

test('Spells (as read): green UI words are no item, no step; the window the Skills popup announced as Spells and Magic', () => {
  const p = readPopup(
    shaped('Spells', [
      ['Spells are learned from scrolls and cast from your Spell Bar once memorized.', 'white'],
      ['', 'white'],
      ['Scribing spells:', 'yellow'],
      ['To scribe a spell, right click the scroll in your inventory and press the Scribe button to add it to your spell book.', 'white'],
      ['', 'white'],
      ['Memorizing spells:', 'yellow'],
      ['Open your spell book with [K], then left clicking and holding a spell lets you Memorize it onto a Spell Bar gem.', 'white'],
      ['', 'white'],
      ['Casting Spells:', 'yellow'],
      ['Press the matching key on the number key row, or left click the gem on your Spell Bar.', 'white'],
      ['', 'white'],
      ["Click 'OK' to continue.", 'orange']
    ])
  )
  assert.ok(p !== null)
  assert.deepEqual(p.paragraphs.map((x) => x.heading).filter((h) => h !== undefined), ['Scribing spells:', 'Memorizing spells:', 'Casting Spells:'])
  assert.deepEqual([p.steps, p.rewards, p.next], [[], undefined, undefined])
  assert.ok(namesWindow('Spells and Magic', 'Spells'), 'the announcement matches the title loosely')
  assert.ok(!namesWindow('Skills and Abilities', 'Spells'))
})

test('line cleaning: frame marks off both ends, a lone scrollbar letter off the end, real one-letter words kept', () => {
  assert.equal(cleanPopupLine('| Navigation'), 'Navigation')
  assert.equal(cleanPopupLine('crucial skill for all Legends. t i'), 'crucial skill for all Legends.')
  assert.equal(cleanPopupLine('a pair of Boots of the Long Road i'), 'a pair of Boots of the Long Road')
  assert.equal(cleanPopupLine('will provide a bit of experience. }'), 'will provide a bit of experience.')
  assert.equal(cleanPopupLine('you have been awarded a'), 'you have been awarded a')
  assert.ok(isJournalPicture(['Quest Journal', 'Task Title Time Left Zone']))
  assert.ok(!isJournalPicture(['Navigation']))
})

const doug: QuestLog = {
  giver: 'Doug',
  zone: 'EverQuest Legends Tutorial',
  npcs: ['Doug'],
  reruns: 0,
  steps: [{ at: '2026-10-23 17:37:15', kind: 'updated', npc: 'Doug', zone: 'EverQuest Legends Tutorial', talk: [{ who: 'You', text: "let's talk" }, { who: 'Doug', text: "Let's stretch out those legs a bit. Go talk to my old man in the cave to the south." }] }]
}

test('a quest page with popups: each window quoted ahead of the log in game order, its steps first in the Summary, its reward in Reward', async () => {
  const nav = await popupOf('popup-tutorial-navigation.png')
  const reward = await popupOf('popup-tutorial-first-quest-reward.png')
  assert.ok(nav !== null && reward !== null)
  const page = questDraftPage("Doug's errands", doug, { journal: { popups: [nav, reward] } })
  assert.ok(page.includes("= Reward =\n\n<ul>\n<li>{{:Boots of the Long Road}}</li>\n</ul>"), page)
  assert.ok(page.includes('{{CheckboxList}}\n* Find your way to Old Doug, in the caves to the South of your current position.\n'))
  const walk = page.slice(page.indexOf('= Walkthrough ='))
  const at = (s: string): number => walk.indexOf(s)
  assert.ok(at("A window titled '''Navigation''' opens:") >= 0 && at("A window titled '''Navigation''' opens:") < at("You say, 'let's talk'"))
  assert.ok(walk.includes(": '''Map:''' ''Pressing [M] opens the Map window."))
  assert.deepEqual(popupRewards([nav, reward]), ['Boots of the Long Road'])
  assert.deepEqual(popupCheckLines([reward, nav]), ['* Find your way to Old Doug, in the caves to the South of your current position.'])
})

test('the live page merge adds a popup only where the page lacks its words', async () => {
  const nav = await popupOf('popup-tutorial-navigation.png')
  assert.ok(nav !== null)
  const c = { journal: { popups: [nav] } }
  const bare = "{{Classic Era}}\n{| class=\"questTopTable\"\n! ''' Starts In: '''\n| [[Tutorial Zone]]\n|}\n\n= Walkthrough =\n\nYou say, 'let's talk'\n\n[[Category:Quests]]\n"
  const added = mergeQuestPage(bare, "Doug's errands", doug, c)
  assert.ok(added.text.includes("A window titled '''Navigation''' opens:"), added.text)
  // A page that already quotes the window's words (in its own markup) gains none of them again.
  const quoted = bare.replace("You say, 'let's talk'", `You say, 'let's talk'\n\n${nav.paragraphs.map((x) => x.text).join('\n\n')}`)
  const again = mergeQuestPage(quoted, "Doug's errands", doug, c)
  assert.ok(!again.text.includes("A window titled '''Navigation''' opens:"), again.text)
})

test('Item Merging: a long punctuated title with I misread, the merge order as a step, the second pair as a reward', async () => {
  const p = await popupOf('popup-tutorial-item-merging.png')
  assert.ok(p !== null)
  assert.equal(p.title, 'Why would I need 4 boots?! Item Merging')
  assert.deepEqual(p.steps, ['Merge your two sets of boots!'])
  // Only an award is a reward: Motes of Potential and the +1 are items the window mentions.
  assert.deepEqual(p.rewards, ['Boots of the Long Road'])
  assert.ok(p.paragraphs.some((x) => x.text.includes('first Item’s Detailed Information window')), 'ltem read as Item')
})
