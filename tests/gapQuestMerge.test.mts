// Copy on a quest page the wiki has (owner, 2026-10-23: "implement the diff idea"): the live page with
// only what the log adds, nothing removed. The log is the owner's Unfortunate news (2026-10-22, Lake
// Nerius and the Temple of Solusek Ro); the page is shaped like the wiki's, a fixture: tests send the
// wiki nothing.
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { mergeQuestPage, plainWords, questLiveCopy } from '../src/shared/gapQuestMerge'
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
  // The hand-ins, the task line, the faction block and experience land in the walkthrough, after the talk.
  for (const want of ['Give [[Exorbitant Commission]] to [[Dorian G`Wyn]]:', "'''Your task 'Unfortunate news' has been updated.'''", '* Your faction standing with [[Nerius Trade Association]] has been adjusted by 200.', '{{YouGainExperience}}']) {
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
  assert.deepEqual(out.notes, ['Start Zone: the page says lake nerius, your log took it in Temple of Solusek Ro.', 'Nerius Trade Association: the page says 100, your log says 200.'])
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
  assert.ok(lines.includes('<ul><li>{{:Cloak of the Nerius}}</li></ul>'))
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
