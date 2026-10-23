// An item's quest facts on its page (owner, 2026-10-22: Encoded Missive, given by Ty`Klerr for the
// Alchemical Solution quest and turned in to Dorian G`Wyn; "the code should also pick up information
// about who the item is supposed to be turned into").
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { locFinder, questFactLines, questNote, relatedQuests, withQuestFields, type ItemQuestFacts } from '../src/shared/itemQuestFacts'
import { wikiPageText } from '../src/shared/wikiPage'
import type { GapRow } from '../src/shared/gaps'

const missive: ItemQuestFacts = {
  givenBy: { npc: 'Ty`Klerr', zone: 'Neriak - Foreign Quarter', keywords: ['Dorian', 'ready', 'report'] },
  turnedInTo: [{ npc: 'Dorian G`Wyn', n: 1 }],
  quests: ['Alchemical Solution']
}

test('THE QUEST SENTENCES NAME THE GIVER, WHERE, THE QUEST, THE WORDS, AND WHO TAKES IT', () => {
  const locOf = locFinder([{ mob: 'Ty`Klerr', points: [[-395.03, -228.06, 3.19]] }])
  assert.equal(
    questNote(missive, { locOf }),
    'Given by [[Ty`Klerr]] in [[Neriak - Foreign Quarter]] at /loc (-395.03, -228.06, 3.19) during the [[Alchemical Solution]] quest: say [Dorian], [ready], [report]. Turn in to [[Dorian G`Wyn]].'
  )
  // Only a turn-in seen: the quest rides on it.
  assert.equal(questNote({ turnedInTo: [{ npc: 'Dorian G`Wyn', n: 2 }], quests: ['Alchemical Solution'] }), 'Turn in to [[Dorian G`Wyn]] for the [[Alchemical Solution]] quest.')
  assert.equal(questNote(undefined), undefined)
  assert.equal(relatedQuests(missive), '\n* [[Alchemical Solution]]')
  assert.deepEqual(questFactLines(missive), ['Given by Ty`Klerr in Neriak - Foreign Quarter (you said: Dorian, ready, report)', 'Turned in to Dorian G`Wyn', 'Quest: Alchemical Solution'])
})

test("COPY WIKI PAGE FOR AN ITEM WRITES THE QUEST IN |notes AND |relatedquests", () => {
  const row = { domain: 'item', name: 'Encoded Missive', kinds: ['received'], count: 1, first: '', last: '', details: {}, questFacts: missive } as unknown as GapRow
  const page = wikiPageText(row, [], {}, { mobLocs: [{ mob: 'Ty`Klerr', points: [[-395.03, -228.06, 3.19]] }] })
  assert.ok(page.includes('|notes = Given by [[Ty`Klerr]] in [[Neriak - Foreign Quarter]] at /loc (-395.03, -228.06, 3.19)'), page)
  assert.ok(page.includes('|relatedquests = \n* [[Alchemical Solution]]'), page)
})

test('THE QUEST JOINS A SCREENSHOT\'S LORE NOTE, OR STANDS BEFORE THE STATSBLOCK ALONE', () => {
  const q = { questNote: 'Turn in to [[Dorian G`Wyn]].', relatedQuests: '\n* [[Alchemical Solution]]' }
  assert.deepEqual(withQuestFields([['itemname', 'X'], ['notes', '{{Item Lore|Likes moongazing.}}'], ['statsblock', 'S']], q), [
    ['itemname', 'X'],
    ['notes', '{{Item Lore|Likes moongazing.}}<br>\nTurn in to [[Dorian G`Wyn]].'],
    ['statsblock', 'S'],
    ['relatedquests', '\n* [[Alchemical Solution]]']
  ])
  assert.deepEqual(withQuestFields([['itemname', 'X'], ['statsblock', 'S']], { questNote: 'N' }), [['itemname', 'X'], ['notes', 'N'], ['statsblock', 'S']])
})
