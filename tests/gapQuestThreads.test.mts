// The chains the engine rebuilds (gaps_threads*.rs) as the page writer and the Suggested quests list read
// them: steps in the chain's order, kills, loots and purchases as their own lines.
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { askedCount, questLogFromThread, threadDisplaySteps, threadStepLabel, threadStepWhy, type QuestThread } from '../src/shared/gapQuestThreads'
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

test("an accepted chain's page: requirements are the hand-in's, kills and loots only say where an item drops", () => {
  const log = questLogFromThread(bones)
  assert.equal(log.giver, 'Doug')
  const page = questDraftPage('Grandfather Doug', log)
  const summary = page.slice(page.indexOf('= Summary ='), page.indexOf('{{End}}'))
  const at = (s: string): number => summary.indexOf(s)
  assert.ok(at("* Say 'more work' to [[Doug]]") >= 0, summary)
  // Owner, 2026-10-23: "just because i killed 4 skeletons and got 2 bone chips, doesn't mean the quest requires that".
  assert.ok(at("* Collect 6 [[Fragile Pet's Skull]] (dropped by [[a fragile pet]]).") > at("* Say 'more work'"), summary)
  assert.equal(at('Kill'), -1, summary)
  assert.ok(page.includes("Hand 6 [[Fragile Pet's Skull]] to [[Dead Doug]]:"), page)
  // The hand-over comes before Dead Doug's answer to it.
  assert.ok(page.indexOf("Hand 6 [[Fragile Pet's Skull]]") < page.indexOf('Here, take these boots!'), page)
  assert.ok(page.includes('{{YouGainExperience}}'), page)
})

test("a keyword said to the wrong NPC, answered only with 'go ask X', is not a step of its own", () => {
  const redirect: QuestThread = {
    id: 'Doug@1:ask:Doug:more work',
    name: 'Doug: more work',
    giver: 'Doug',
    zone: 'EverQuest Legends Tutorial',
    startMs: 1,
    endMs: 2,
    steps: [
      { id: 'ask:Old Doug:more work', at: 't1', ms: 1, kind: 'talk', why: 'start', npc: 'Old Doug', said: ['more work'], lines: [{ who: 'You', text: 'more work' }, { who: 'Old Doug', text: "Go ask my son Doug for 'more work'!" }] },
      { id: 'ask:Doug:more work', at: 't2', ms: 2, kind: 'talk', why: 'goask', npc: 'Doug', said: ['more work'], links: [{ from: 'ask:Old Doug:more work', why: 'goask', detail: "go ask Doug for 'more work'" }], lines: [{ who: 'You', text: 'more work' }, { who: 'Doug', text: 'Go up the stairs.' }] }
    ]
  }
  const page = questDraftPage('Doug: more work', questLogFromThread(redirect))
  assert.ok(!page.includes("* Say 'more work' to [[Old Doug]]"), page)
  assert.ok(page.includes("* Say 'more work' to [[Doug]]"), page)
})

/** The owner's Valtari log, Nektulos Forest, 2026-10-23: four trades of one of each, loots before the talk. */
const vlad: QuestThread = {
  id: 'Vlad Sterovich@1:handin',
  name: 'Vlad Sterovich: happened to me',
  giver: 'Vlad Sterovich',
  zone: 'Nektulos Forest',
  startMs: 1,
  endMs: 20,
  steps: [
    { id: 'kill:a skeleton', at: 't1', ms: 1, kind: 'kill', why: 'start', mob: 'a skeleton', count: 4 },
    { id: 'loot:a skeleton:Bone Chips', at: 't2', ms: 2, kind: 'loot', why: 'item', mob: 'a skeleton', items: [{ name: 'Bone Chips', n: 3 }] },
    { id: 'greet:Vlad Sterovich', at: 't3', ms: 3, kind: 'talk', why: 'start', npc: 'Vlad Sterovich', lines: [{ who: 'You', text: 'Hail, Vlad Sterovich' }, { who: 'Vlad Sterovich', text: 'Hail, traveler! What a horrible night it is, and even worse is what has [happened to me].' }] },
    { id: 'ask:Vlad Sterovich:happened to me', at: 't4', ms: 4, kind: 'talk', why: 'keyword', npc: 'Vlad Sterovich', said: ['happened to me'], lines: [{ who: 'You', text: 'happened to me' }, { who: 'Vlad Sterovich', text: 'I need some [ingredients] to make a potion to heal my wounds.' }] },
    { id: 'ask:Vlad Sterovich:ingredients', at: 't5', ms: 5, kind: 'talk', why: 'keyword', npc: 'Vlad Sterovich', said: ['ingredients'], lines: [{ who: 'You', text: 'ingredients' }, { who: 'Vlad Sterovich', text: 'I need a wing from a flying creature of the night, a fang from a creature that slithers, a chip from the aged dead, and a stone that has lost its light from a lost, wandering soul.' }] },
    { id: 'kill:a tree snake', at: 't6', ms: 6, kind: 'kill', why: 'named', mob: 'a tree snake', count: 4 },
    { id: 'loot:a tree snake:Snake Fang', at: 't7', ms: 7, kind: 'loot', why: 'item', mob: 'a tree snake', items: [{ name: 'Snake Fang', n: 3 }] },
    { id: 'loot:a greater skeleton:Bone Chips', at: 't8', ms: 8, kind: 'loot', why: 'item', mob: 'a greater skeleton', items: [{ name: 'Bone Chips', n: 2 }] },
    { id: 'loot:a large bat:Bat Wing', at: 't9', ms: 9, kind: 'loot', why: 'item', mob: 'a large bat', items: [{ name: 'Bat Wing', n: 2 }] },
    { id: 'loot:a willowisp:Burned Out Lightstone', at: 't10', ms: 10, kind: 'loot', why: 'item', mob: 'a willowisp', items: [{ name: 'Burned Out Lightstone', n: 5 }] },
    {
      id: 'handin:Vlad Sterovich:Bat Wing+Bone Chips+Burned Out Lightstone+Snake Fang', at: 't20', ms: 20, kind: 'handin', why: 'item', npc: 'Vlad Sterovich',
      items: [{ name: 'Bat Wing', n: 4 }, { name: 'Bone Chips', n: 4 }, { name: 'Burned Out Lightstone', n: 4 }, { name: 'Snake Fang', n: 4 }],
      perTrade: [{ name: 'Bat Wing', n: 1 }, { name: 'Bone Chips', n: 1 }, { name: 'Burned Out Lightstone', n: 1 }, { name: 'Snake Fang', n: 1 }],
      trades: 4, experience: true, lines: [{ who: 'Vlad Sterovich', text: 'Wonderful, you got it all!' }]
    }
  ]
}

test("Vlad Sterovich: the talk first, one Collect of what his words ask for, then the hand-in, done 4 times", () => {
  const shown = threadDisplaySteps(vlad)
  assert.deepEqual(shown.map(threadStepLabel), [
    'Hail Vlad Sterovich',
    "Say 'happened to me' to Vlad Sterovich",
    "Say 'ingredients' to Vlad Sterovich",
    'Collect Bat Wing and Bone Chips and Burned Out Lightstone and Snake Fang',
    'Hand Bat Wing and Bone Chips and Burned Out Lightstone and Snake Fang to Vlad Sterovich (experience) (repeatable: done 4 times)'
  ])
  const why = threadStepWhy(shown[3])
  assert.match(why, /^asked: 'I need a wing from a flying creature/)
  assert.match(why, /Bone Chips: a skeleton, a greater skeleton/)
  const page = questDraftPage('Vlad Sterovich: happened to me', questLogFromThread(vlad))
  for (const line of [
    '* Collect [[Bone Chips]] (dropped by [[a skeleton]], [[a greater skeleton]]).',
    '* Collect [[Snake Fang]] (dropped by [[a tree snake]]).',
    '* Collect [[Bat Wing]] (dropped by [[a large bat]]).',
    '* Collect [[Burned Out Lightstone]] (dropped by [[a willowisp]]).',
    '* This quest can be repeated.',
    '[[Category:Repeatable Turn-in Quests]]'
  ]) assert.ok(page.includes(line), `${line}\n${page}`)
  assert.ok(!/Hand 4|Collect 4|Kill/.test(page), page)
})

test("an NPC's words give the count: 'a wing' is 1 Bat Wing, 'two fangs' 2, 'a stone that has lost its light' a Lightstone", () => {
  assert.equal(askedCount('I need a wing from a flying creature of the night', 'Bat Wing'), 1)
  assert.equal(askedCount('bring me two fangs', 'Snake Fang'), 2)
  assert.equal(askedCount('and a stone that has lost its light', 'Burned Out Lightstone'), 1)
  assert.equal(askedCount('a chip from the aged dead', 'Bone Chips'), 1)
  assert.equal(askedCount('Thank you so much', 'Bone Chips'), undefined)
})
