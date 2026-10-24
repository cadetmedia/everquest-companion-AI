// The chains the engine rebuilds (gaps_threads*.rs) as the page writer and the Suggested quests list read
// them: steps in the chain's order, kills, loots and purchases as their own lines.
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { questLogFromThread, threadStepLabel, threadStepWhy, type QuestThread } from '../src/shared/gapQuestThreads'
import { questDraftPage } from '../src/shared/gapQuestPage'

const bones: QuestThread = {
  id: 'Doug@1',
  giver: 'Doug',
  zone: 'EverQuest Legends Tutorial',
  startMs: 1,
  endMs: 9,
  name: 'Doug: more work',
  steps: [
    { id: 'ask:Doug:more work', at: 't1', ms: 1, kind: 'talk', why: 'start', npc: 'Doug', said: ['more work'], lines: [{ who: 'You', text: 'more work' }, { who: 'Doug', text: 'Go up the stairs and check on my grandfather.' }] },
    { id: 'greet:Dead Doug#2', at: 't2', ms: 2, kind: 'talk', why: 'sent', npc: 'Dead Doug', links: [{ from: 'ask:Doug:more work', why: 'sent', detail: 'went to Dead Doug' }], lines: [{ who: 'You', text: 'Hail, Dead Doug' }, { who: 'Dead Doug', text: 'I hope you are here to [help]!' }] },
    { id: 'kill:a fragile pet', at: 't3', ms: 3, kind: 'kill', why: 'named', mob: 'a fragile pet', count: 6, links: [{ from: 'greet:Dead Doug#2', why: 'named', detail: 'named a fragile pet' }] },
    { id: "loot:a fragile pet:Fragile Pet's Skull", at: 't4', ms: 4, kind: 'loot', why: 'item', mob: 'a fragile pet', items: [{ name: "Fragile Pet's Skull", n: 6 }] },
    { id: "handin:Dead Doug:Fragile Pet's Skull", at: 't5', ms: 5, kind: 'handin', why: 'item', npc: 'Dead Doug', items: [{ name: "Fragile Pet's Skull", n: 6 }], experience: true, lines: [{ who: 'Dead Doug', text: 'Here, take these boots!' }] }
  ]
}

test('a chain reads as its steps: a kill and a loot are lines of their own, a hand-in counts its items', () => {
  assert.deepEqual(bones.steps.map(threadStepLabel), [
    "Say 'more work' to Doug",
    'Hail Dead Doug',
    'Kill 6 a fragile pet',
    "Loot 6 Fragile Pet's Skull from a fragile pet",
    "Hand 6 Fragile Pet's Skull to Dead Doug (experience)"
  ])
  assert.equal(threadStepWhy(bones.steps[1]), 'went to Dead Doug')
})

test("an accepted chain's page: Summary in the chain's order, the kill and loot as lines, the hand-in counted", () => {
  const log = questLogFromThread(bones)
  assert.equal(log.giver, 'Doug')
  const page = questDraftPage('Grandfather Doug', log)
  const summary = page.slice(page.indexOf('= Summary ='), page.indexOf('{{End}}'))
  const at = (s: string): number => summary.indexOf(s)
  assert.ok(at("* Say 'more work' to [[Doug]]") >= 0, summary)
  // A kill and its loot are one line, counted as the hand-in took them (reviewer, 2026-10-23).
  assert.ok(at("* Kill [[a fragile pet]] and loot 6 [[Fragile Pet's Skull]].") > at("* Say 'more work'"), summary)
  assert.equal(at('* Kill 6 [[a fragile pet]].'), -1, summary)
  assert.ok(page.includes("Hand 6 [[Fragile Pet's Skull]] to [[Dead Doug]]:"), page)
  // The hand-over comes before Dead Doug's answer to it.
  assert.ok(page.indexOf("Hand 6 [[Fragile Pet's Skull]]") < page.indexOf('Here, take these boots!'), page)
  assert.ok(page.includes('{{YouGainExperience}}'), page)
})
