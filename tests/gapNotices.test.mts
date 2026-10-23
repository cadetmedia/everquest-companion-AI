// The Notices domain (owner, 2026-10-22: "if we've seen a mob, we need to go update to remove this
// text that it doesn't exist in the current era"): a mob or item the log met whose page opens
// `{{DNE}}` or `{{delete}}` is a row whose work is to edit that page, citing the lines.
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { gapActions, GAP_DOMAINS, type GapRow } from '../src/shared/gaps'
import { noticeWords } from '../src/shared/gapNotices'
import { gapJob } from '../src/shared/gapJob'
import { stillNeeded, wikiPageText } from '../src/shared/wikiPage'

const citizen: GapRow = {
  domain: 'notice',
  name: 'a rotting citizen',
  page: 'A Rotting Citizen',
  notices: ['delete: No longer in game', 'DNE'],
  subject: 'mob',
  kinds: ['considered', 'killed'],
  count: 3,
  first: '2026-10-22 18:20:01',
  last: '2026-10-22 18:35:01',
  details: {
    samples: ['[Thu Oct 22 18:35:01 2026] You have slain a rotting citizen!'],
    zones: { entries: [{ name: 'Nektulos Forest', n: 3 }], distinct: 1, all: ['Nektulos Forest'] }
  }
} as GapRow

test('NOTICES IS A DOMAIN; ITS ROW EDITS THE PAGE THAT EXISTS, NAMING THE NOTICES AND HOW OFTEN THE LOG MET IT', () => {
  assert.ok(GAP_DOMAINS.includes('notice'))
  assert.equal(noticeWords(citizen), '{{delete|No longer in game}} and {{DNE}} (not Legends)')
  const [action] = gapActions(citizen, 'unknown')
  assert.equal(action.label, 'Edit page')
  assert.match(action.href ?? '', /A_Rotting_Citizen.*action=edit|action=edit.*A_Rotting_Citizen/)
  assert.match(action.why, /your log met this mob 3 times/)
  assert.equal(gapJob(citizen), 'update')
  assert.deepEqual(stillNeeded(citizen, [], {}), [])
})

test('A NOTICE ROW COPIES THE PROOF TO CITE: HOW OFTEN, WHERE, WHEN, AND THE LINES', () => {
  assert.equal(
    wikiPageText(citizen, [], {}),
    'Seen in EverQuest Legends (considered, killed), 3 times in Nektulos Forest, 2026-10-22 18:20:01 to 2026-10-22 18:35:01:\n: [Thu Oct 22 18:35:01 2026] You have slain a rotting citizen!\n'
  )
})
