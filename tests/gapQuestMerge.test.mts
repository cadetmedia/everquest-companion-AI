// Copy on a quest page the wiki has (owner, 2026-10-23: "implement the diff idea"): the live page with
// only what the log adds, nothing removed. The log is the owner's Unfortunate news (2026-10-22, Lake
// Nerius and the Temple of Solusek Ro); the page is shaped like the wiki's, a fixture: tests send the
// wiki nothing.
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { itemTitles, mergeQuestPage, nearItemPages, plainWords, questLiveCopy, stubLinkTarget } from '../src/shared/gapQuestMerge'
import { questDraftPage } from '../src/shared/gapQuestPage'
import type { QuestLog } from '../src/shared/gapQuests'

const news: QuestLog = {
  giver: 'Lord Lyfyx of Burwood',
  zone: 'Temple of Solusek Ro',
  npcs: ['Lord Lyfyx of Burwood', 'Dorian G`Wyn'],
  reruns: 0,
  steps: [
    {
      at: '2026-10-22 23:50:22',
      kind: 'assigned',
      npc: 'Lord Lyfyx of Burwood',
      zone: 'Temple of Solusek Ro',
      talk: [{ who: 'Lord Lyfyx of Burwood', text: 'A petition for aid against some unknown evil? I am afraid the Temple has no soldiers to spare.' }]
    },
    {
      at: '2026-10-22 23:53:50',
      kind: 'updated',
      npc: 'Dorian G`Wyn',
      zone: 'Lake Nerius',
      offered: ['Exorbitant Commission', 'A Curt Dismissal', 'Ordination of Might'],
      talk: [{ who: 'Dorian G`Wyn', text: 'Curses! I should have known the cruel world would refuse aid, Drywrought.' }],
      factions: [{ faction: 'Nerius Trade Association', line: 'Your faction standing with Nerius Trade Association has been adjusted by 200.' }],
      experience: true
    }
  ]
}

const LIVE = [
  '{{Classic Era}}',
  '[[File:Npc_lord_lyfyx_of_burwood.png|thumb|Lord Lyfyx of Burwood]]',
  '{| class="questTopTable"',
  "! ''' Start Zone: '''",
  '| [[Temple of Solusek Ro]]',
  '|-',
  "! ''' Quest Giver: '''",
  '| [[Lord Lyfyx of Burwood]]',
  '|-',
  "! ''' Minimum Level: '''",
  '| ?',
  '|-',
  "! ''' Related NPCs: '''",
  '| None',
  '|}',
  '',
  '== Reward ==',
  '',
  '* Experience',
  '',
  '== Walkthrough ==',
  '',
  'Hand [[Lord Lyfyx of Burwood]] the [[Solusek Petition]].',
  '',
  ": Lord Lyfyx of Burwood says 'A petition for aid against some unknown evil? I am afraid the Temple has no soldiers to spare.'",
  '',
  'Return to [[Dorian G`Wyn]] in [[Lake Nerius]].',
  '',
  '[[Category:Quests]]',
  '[[Category:Temple of Solusek Ro]]'
].join('\n')

const ctx = { players: ['Drywrought'] }

test('THE PAGE KEEPS EVERY LINE IT HAD, AND GAINS ONLY WHAT THE LOG SAW THAT IT LACKS', () => {
  const out = mergeQuestPage(LIVE, 'Unfortunate news', news, ctx)
  const lines = out.text.split('\n')
  // Nothing removed: every live line is still there, in its order.
  let at = 0
  for (const l of LIVE.split('\n')) {
    if (l === '| None' || l === '| ?') continue
    at = lines.indexOf(l, at)
    assert.ok(at >= 0, `kept: ${l}`)
  }
  assert.equal(lines.length, out.added.length)
  // The NPC's line the page already quotes (no comma, as many pages write it) is not added again.
  assert.equal(lines.filter((l) => l.includes('A petition for aid')).length, 1)
  // The hand-ins, the faction block and experience land in the walkthrough, after the talk; the task
  // line is never added (12 of the 931 cached pages write one).
  assert.ok(!lines.some((l) => l.includes("Your task 'Unfortunate news'")))
  for (const want of ['Hand [[Exorbitant Commission]] to [[Dorian G`Wyn]]:', '* Your faction standing with [[Nerius Trade Association]] has been adjusted by 200.', '{{YouGainExperience}}']) {
    const i = lines.indexOf(want)
    assert.ok(i > lines.indexOf('== Walkthrough =='), want)
    assert.equal(out.added[i], true, `${want} is marked new`)
  }
  // The player's name reads Soandso.
  assert.ok(lines.some((l) => l.includes("refuse aid, Soandso.'")))
  assert.ok(!out.text.includes('Drywrought'))
  // Related NPCs filled where the page said None; Dorian appears in the page's prose, so he is not
  // missing from it, but the table names only what its cells name.
  assert.deepEqual(out.changes.filter((c) => !c.startsWith('Walkthrough')), ['Related Zones: Lake Nerius', 'Related NPCs: + Dorian G`Wyn'])
  assert.ok(out.changes.some((c) => /^Walkthrough: \d+ lines from your log$/.test(c)))
  assert.deepEqual(out.notes, [])
})

test('A PAGE THAT ALREADY HAS IT ALL GAINS NOTHING', () => {
  const once = mergeQuestPage(LIVE, 'Unfortunate news', news, ctx)
  const twice = mergeQuestPage(once.text, 'Unfortunate news', news, ctx)
  assert.equal(twice.text, once.text)
  assert.deepEqual(twice.changes, [])
  assert.ok(twice.added.every((a) => !a))
})

test('A NUMBER THE LOG PROVES OTHERWISE IS SHOWN, NOT CHANGED', () => {
  const page = LIVE.replace('== Walkthrough ==', '== Walkthrough ==\n\n<div class="facblock">\n* Your faction standing with [[Nerius Trade Association]] has been adjusted by 100.\n</div>')
  const out = mergeQuestPage(page.replace('| [[Temple of Solusek Ro]]', '| [[Lake Nerius]]'), 'Unfortunate news', news, ctx)
  assert.ok(out.text.includes('adjusted by 100.'))
  assert.deepEqual(out.notes, ['Start Zone: the page says Lake Nerius; your log: Temple of Solusek Ro.', 'Nerius Trade Association: the page says 100, your log says 200.'])
})

test('A PAGE WITH NO WALKTHROUGH OR REWARD GETS THEM WHOLE, BEFORE ITS CATEGORIES', () => {
  const bare = ['{| class="questTopTable"', "! ''' Starts In: '''", '| ?', '|}', '', 'Some words.', '', '[[Category:Quests]]'].join('\n')
  const withItem: QuestLog = { ...news, steps: [...news.steps.slice(0, 1), { ...news.steps[1], given: ['Cloak of the Nerius'] }] }
  const out = mergeQuestPage(bare, 'Unfortunate news', withItem, ctx)
  const lines = out.text.split('\n')
  // `Starts In` is the start zone too: filled, not added twice.
  assert.ok(lines.includes('| [[Temple of Solusek Ro]]'))
  assert.equal(lines.filter((l) => /Start(s In| Zone)/.test(l)).length, 1)
  assert.ok(lines.indexOf('== Reward ==') < lines.indexOf('== Walkthrough =='))
  assert.ok(lines.indexOf('== Walkthrough ==') < lines.indexOf('[[Category:Quests]]'))
  assert.ok(lines.includes('<li>{{:Cloak of the Nerius}}</li>'), 'the blueprint lists one reward per line')
})

test('NO PAGE IS A DRAFT, AND A FAILED READ IS THE OFFLINE TEXT, SAID TO BE OFFLINE', () => {
  const draft = questLiveCopy({ name: 'Unfortunate news', log: news, offline: 'offline text' }, { title: 'Unfortunate news', text: '' }, ctx)
  assert.equal(draft.kind, 'draft')
  assert.ok(draft.text.startsWith('{{Classic Era}}'))
  assert.ok(!draft.text.includes('Drywrought'))
  const off = questLiveCopy({ name: 'Unfortunate news', log: news, offline: 'offline text' }, null, ctx)
  assert.deepEqual([off.kind, off.text], ['offline', 'offline text'])
  const merged = questLiveCopy({ name: 'What`s going on here?', log: news, offline: '' }, { title: "What's going on here", text: LIVE }, ctx)
  assert.deepEqual([merged.kind, merged.title], ['merged', "What's going on here"])
})

test('WORDS FOLD MARKUP, CASE, PUNCTUATION AND THE BACKTICK', () => {
  assert.equal(plainWords("'''You give [[Solusek Petition|the petition]] to Lord Lyfyx.'''"), 'you give the petition to lord lyfyx')
  assert.equal(plainWords('What`s going on here?'), plainWords("What's Going On Here"))
})

// ---- the wiki's own Unfortunate News (2026-10-23, read once by the coordinator; another player's
// name on it replaced with Otherplayer). The game's title, Unfortunate news, is a stub that only
// links here; the page writes the older layout (`Starts In`, `= Walkthrough =`) and one Hand line.
const fixture = (name: string): string => readFileSync(new URL(`./fixtures/quests/${name}.wikitext`, import.meta.url), 'utf8')
const REAL = fixture('unfortunate-news')
const STUB = fixture('unfortunate-news-stub')

/** The owner's log of it: a chained quest (assigned in the second Call for Aid was finished). */
const chained: QuestLog = {
  giver: 'Lord Lyfyx of Burwood',
  zone: 'The Temple of Solusek Ro',
  npcs: ['Lord Lyfyx of Burwood', 'Dorian G`Wyn'],
  reruns: 0,
  chainedFrom: 'Call for Aid',
  steps: [
    {
      at: '2026-10-22 23:50:22',
      kind: 'assigned',
      npc: 'Lord Lyfyx of Burwood',
      zone: 'The Temple of Solusek Ro',
      talk: [{ who: 'Lord Lyfyx of Burwood', text: 'A petition for aid against some unknown evil? I am afraid the Temple has no soldiers to spare.' }],
      offered: ['Solusek Petition'],
      given: ['Ordination of Might'],
      factions: [{ faction: 'Nerius Trade Association', line: 'Your faction standing with Nerius Trade Association has been adjusted by 150.' }],
      experience: true
    },
    {
      at: '2026-10-22 23:53:50',
      kind: 'updated',
      npc: 'Dorian G`Wyn',
      zone: 'Lake Nerius',
      offered: ['Exorbitant Commission', 'A Curt Dismissal', 'Ordination of Might'],
      talk: [{ who: 'Dorian G`Wyn', text: 'Curses! I should have known the cruel world would refuse aid to another, even of their own creed. We shall retreat back to the Undercroft and look to fortify our home against the undead, against the tumult in the castle, and from the outside world. You, however, Soandso , you will always be welcome amongst our kind.' }],
      factions: [{ faction: 'Nerius Trade Association', line: 'Your faction standing with Nerius Trade Association has been adjusted by 200.' }],
      experience: true,
      achievements: ['Race Unlock - Half Dark Elves']
    },
    { at: '2026-10-22 23:53:50', kind: 'updated', npc: 'Dorian G`Wyn', zone: 'Lake Nerius' },
    { at: '2026-10-22 23:53:50', kind: 'updated', npc: 'Dorian G`Wyn', zone: 'Lake Nerius' }
  ]
}

test('THE GAME TITLE IS A STUB THAT ONLY LINKS ITS CAPITALISED TWIN: THE READ FOLLOWS IT, AND SAYS SO', () => {
  assert.equal(stubLinkTarget('Unfortunate news', STUB), 'Unfortunate News')
  assert.equal(stubLinkTarget('Unfortunate News', REAL), undefined)
  // A page that only links an unrelated page is no stub of this quest.
  assert.equal(stubLinkTarget('Unfortunate news', STUB.replace('[[Unfortunate News]]', '[[Call for Aid]]')), undefined)
  const copy = questLiveCopy({ name: 'Unfortunate news', log: chained, offline: '' }, { title: 'Unfortunate News', text: REAL, stubOf: 'Unfortunate news' })
  assert.equal(copy.notes[0], 'Unfortunate news is a second page holding only a link here; this compares against Unfortunate News.')
})

test('THE REAL PAGE ALREADY HAS WHAT THE LOG SAW: NOTHING ADDED, THE TWO MISNAMED ITEMS NOTED', () => {
  const out = mergeQuestPage(REAL, 'Unfortunate news', chained, { players: ['Drywrought'] })
  // Starts In names the quest before, so no Quest Giver row, no second start row, no Temple category.
  assert.deepEqual(out.changes, [])
  assert.equal(out.text, REAL.replace(/\r\n/g, '\n'))
  assert.deepEqual(out.notes, [
    'The page links Curt Dismissal; the item is A Curt Dismissal.',
    'The page links Orgination of Might; the item is Ordination of Might.'
  ])
})

test("A NEAR LINK THAT LEADS TO NO PAGE IS FIXED TO THE ITEM'S PAGE WHEN THE CATALOG HAS IT; ANOTHER STAYS A NOTE", () => {
  // Main's read found A Curt Dismissal's page near the broken [[Curt Dismissal]]; Ordination of Might's page it did not.
  const out = mergeQuestPage(REAL, 'Unfortunate news', chained, { itemPages: ['A Curt Dismissal'] })
  const lines = out.text.split('\n')
  const hand = lines.find((l) => l.startsWith('Hand ')) ?? ''
  assert.ok(hand.includes('[[A Curt Dismissal]]') && !hand.includes('[[Curt Dismissal]]'), hand)
  assert.ok(hand.includes('[[Orgination of Might]]'), 'unproven: left as the page has it')
  assert.ok(out.added[lines.indexOf(hand)], 'the fixed line is shown as changed')
  assert.deepEqual(out.changes, ["Link fixed: Curt Dismissal is no page; the item's page is A Curt Dismissal"])
  assert.deepEqual(out.notes, ['The page links Orgination of Might; the item is Ordination of Might.'])
})

test('the catalog side: a broken link finds the item page it nearly names; a working link or a category finds none', () => {
  const titles = itemTitles(['A Curt Dismissal', 'Ordination of Might', 'Exorbitant Commission', 'Curtain Rod'])
  const isItem = (l: string): boolean => ['exorbitant commission'].includes(l.toLowerCase())
  const near = nearItemPages(REAL, isItem, titles)
  assert.deepEqual(near.sort(), ['A Curt Dismissal', 'Ordination of Might'])
})

test('A PAGE IN THE OLDER LAYOUT GETS ADDITIONS IN ITS OWN LAYOUT', () => {
  const bare = REAL.replace(/= Walkthrough =[\s\S]*?= Notes =/, '= Notes =')
  const out = mergeQuestPage(bare, 'Unfortunate news', chained, {})
  const lines = out.text.split('\n')
  assert.ok(lines.includes('= Walkthrough ='), 'level-1, as the page writes its headings')
  assert.ok(!lines.includes('== Walkthrough =='))
  assert.ok(lines.includes('Hand [[A Curt Dismissal]] to [[Dorian G`Wyn]]:'))
  assert.ok(lines.includes("'''You have completed achievement: Race Unlock - Half Dark Elves'''"))
  // The chained quest's assigning trade belongs to Call for Aid: none of it is written here.
  assert.ok(!out.text.includes('Solusek Petition') && !out.text.includes('A petition for aid'))
})

test('A CHAINED QUEST STARTS FROM THE QUEST BEFORE, NAMES NO GIVER, AND IS FILED UNDER ITS OWN ZONE', () => {
  const page = questDraftPage('Unfortunate news', chained)
  assert.ok(page.includes("! ''' Starts In: '''\n| Finishing the quest [[Call for Aid]]"))
  assert.ok(!page.includes('Quest Giver') && !page.includes('[[File:'))
  assert.ok(page.includes('[[Category:Lake Nerius]]') && !page.includes('Category:The Temple of Solusek Ro'))
  // Three updates in one second are one task line.
  assert.equal(page.split("'''Your task 'Unfortunate news' has been updated.'''").length - 1, 1)
})
