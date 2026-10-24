// Quests the player names by hand (owner, 2026-10-23: "i need to be able to force a quest association"):
// the EverQuest Legends Tutorial's Doug, whose errands print no task line.

import { test } from 'node:test'
import assert from 'node:assert/strict'
import { isForcedRow, questLogFromVisits, visitGist, withForcedQuests, withoutQuest, withVisitsAdded, type TalkVisit } from '../src/shared/gapForcedQuests'
import { questDraftPage } from '../src/shared/gapQuestPage'
import type { GapsSnap } from '../src/shared/gaps'

const DOUG: TalkVisit = {
  id: 'Doug@1000',
  npc: 'Doug',
  zone: 'EverQuest Legends Tutorial',
  at: '2026-10-23 17:36:17',
  startMs: 1000,
  endMs: 136000,
  talk: [
    { who: 'You', text: 'Hail, Doug', ms: 1000 },
    { who: 'Doug', text: "Hail and well met, Soandso. If you'd like to help me with a couple of errands, [let's talk].", ms: 1000 },
    { who: 'You', text: "let's talk", ms: 58000 },
    { who: 'Doug', text: 'Go talk to my old man in the cave to the south. He probably needs something.', ms: 58000 },
    { who: 'You', text: 'more work', ms: 88000 },
    { who: 'Doug', text: "Finished up with Pops, eh? Good, thanks for taking those supplies up to him. Oh, I see he gave you his old Boots.", ms: 88000 }
  ]
}

const POPS: TalkVisit = { id: 'Pops@60000', npc: 'Pops', zone: 'EverQuest Legends Tutorial', at: '2026-10-23 17:37:30', startMs: 60000, endMs: 70000, talk: [{ who: 'You', text: 'Hail, Pops' }, { who: 'Pops', text: 'Supplies! Here, take my old Boots.' }], given: ['Old Boots'] }

const snap = (rows: GapsSnap['rows'], talks: TalkVisit[]): GapsSnap & { talks: TalkVisit[] } => ({ rows, totals: {} as GapsSnap['totals'], seen: {} as GapsSnap['seen'], talks })

test("DOUG'S ERRAND, NAMED BY THE PLAYER, IS A QUEST PAGE: ONE STEP PER THING SAID, NO TASK LINE", () => {
  const log = questLogFromVisits([DOUG, POPS])
  assert.equal(log.giver, 'Doug')
  assert.deepEqual(log.npcs, ['Doug', 'Pops'])
  assert.deepEqual(log.steps.map((s) => s.talk?.[0]?.text), ['Hail, Doug', "let's talk", 'more work', 'Hail, Pops'])
  const page = questDraftPage('Doug Needs a Hand', log)
  for (const part of [
    "! ''' Starts In: '''\n| [[EverQuest Legends Tutorial]]",
    "! ''' Quest Giver: '''\n| [[Doug]]",
    "* Say 'let's talk' to [[Doug]] in [[EverQuest Legends Tutorial]].",
    "* Say 'more work' to [[Doug]] in [[EverQuest Legends Tutorial]].",
    "= Walkthrough =\n\nYou say, 'Hail, Doug'\n\n: Doug says, 'Hail and well met, Soandso.",
    "'''You receive [[Old Boots]].'''"
  ]) {
    assert.ok(page.includes(part), part)
  }
  assert.ok(!page.includes('the task'), 'no task line the game never printed')
})

test('A NAMED QUEST BECOMES ITS OWN ROW, MARKED, AND ITS VISITS LEAVE THE LIST TO PICK FROM', () => {
  const forced = withVisitsAdded({}, 'Doug Needs a Hand', [DOUG])
  const out = withForcedQuests(snap([], [DOUG, POPS]), forced)
  assert.deepEqual(out.rows.map((r) => [r.domain, r.name, isForcedRow(r)]), [['quest', 'Doug Needs a Hand', true]])
  assert.deepEqual(out.talks.map((v) => v.id), ['Pops@60000'])
  // Adding the father's visit later, under any case of the name, joins the same quest.
  const more = withVisitsAdded(forced, 'doug needs a hand', [POPS, DOUG])
  assert.deepEqual(Object.values(more).map((q) => [q.name, q.visits.map((v) => v.id)]), [['Doug Needs a Hand', ['Doug@1000', 'Pops@60000']]])
  assert.deepEqual(withoutQuest(more, 'DOUG NEEDS A HAND'), {})
})

test('VISITS ADDED TO A QUEST THE LOG HAS JOIN ITS STEPS; THE ROW STAYS THE LOG', () => {
  const task = { domain: 'quest', name: 'Something Fishy', kinds: ['assigned'], count: 1, first: '2026-10-22 21:00:12', last: '2026-10-22 21:00:12', details: {}, quest: { giver: 'Nikko Canti', zone: 'Lake Nerius', npcs: ['Nikko Canti'], steps: [{ at: '2026-10-22 21:00:12', kind: 'assigned', npc: 'Nikko Canti' }], reruns: 0 } } as unknown as GapsSnap['rows'][number]
  const out = withForcedQuests(snap([task], [POPS]), withVisitsAdded({}, 'Something Fishy', [POPS]))
  assert.equal(out.rows.length, 1)
  assert.equal(isForcedRow(out.rows[0]), false)
  const steps = (out.rows[0] as unknown as { quest: { steps: { kind: string }[]; npcs: string[] } }).quest
  assert.deepEqual(steps.steps.map((s) => s.kind), ['assigned', 'talk'])
  assert.deepEqual(steps.npcs, ['Nikko Canti', 'Pops'])
})

test('the picker shows a visit by its first NPC line, cut short', () => {
  assert.equal(visitGist(DOUG, 30), 'Hail and well met, Soandso. I…')
  assert.equal(visitGist(POPS), 'Supplies! Here, take my old Boots.')
})
