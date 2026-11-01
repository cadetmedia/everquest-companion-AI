// Local first, AI second (owner, 2026-10-31): a question that names something in the app's own data,
// or that a Compendium passage plainly answers, is answered with no model call and an "Ask AI"
// offer; a question about the player, a judgement or anything unmatched goes to the AI.

import { test } from 'node:test'
import assert from 'node:assert/strict'
import { localFirstAnswer } from '../src/main/ai/aiLocalFirst'
import { parseAiChat, serializeAiChat } from '../src/shared/aiChat'
import { shownPrompt } from '../src/shared/aiSources'

test('a named item is answered from the app data, with its wiki page and the Ask AI offer', () => {
  const r = localFirstAnswer('what does fungus covered scale tunic do')
  assert.ok(r)
  assert.equal(r.source, 'instant')
  assert.equal(r.offerAi, true)
  assert.match(r.text, /\*\*Fungus Covered Scale Tunic\*\*/)
  assert.match(r.text, /Drops from:\*\* Myco/)
  assert.doesNotMatch(r.text, /\[\[/)
  assert.deepEqual(r.citations?.map((c) => c.url), ['https://eqlwiki.com/Fungus_Covered_Scale_Tunic'])
})

test('a named mob and a named spell are answered too, the question picking the kind', () => {
  assert.match(localFirstAnswer('Lodizal')?.text ?? '', /level 60[\s\S]*Iceclad Ocean/)
  assert.match(localFirstAnswer('what level is Spirit of Wolf')?.text ?? '', /SHM 9/)
})

test('a Compendium passage whose heading is the question answers it, crediting the sheet', () => {
  const r = localFirstAnswer('what limitations does DDD have')
  assert.ok(r)
  assert.match(r.text, /Compendium - DDD/)
  assert.match(r.citations?.[0]?.title ?? '', /brutallstatic/)
})

test('questions about the player, judgements and unmatched questions go to the AI', () => {
  for (const q of [
    'what is the best cloak for my warrior',
    'should I equip fungus covered scale tunic',
    'is there any benefit to doing DCs solo vs group',
    'who is the best healer',
    'cloak of the black wind or something better',
    'what can you do',
    '/help',
    ''
  ]) {
    assert.equal(localFirstAnswer(q), null, q)
  }
})

test('one common word inside a longer question is not taken for a name', () => {
  assert.equal(localFirstAnswer('how do i find a good cloak around here today'), null)
})

test('the thread shows which follow-up was pressed', () => {
  assert.equal(shownPrompt('q', undefined, 'ai'), '🤖 Ask AI: q')
  assert.equal(shownPrompt('q', undefined, 'web'), '🌐 Search other sources: q')
  assert.equal(shownPrompt('q', 'data:', 'auto'), '📷 q')
})

test('an instant answer and its pending Ask AI offer survive a reload', () => {
  const back = parseAiChat(serializeAiChat([{ role: 'ai', text: 'x', source: 'instant', askAiPrompt: 'what drops bone chips' }]))
  assert.deepEqual(back, [{ role: 'ai', text: 'x', source: 'instant', askAiPrompt: 'what drops bone chips' }])
})

test('with no AI set up, every question gets the app data, never an error', async () => {
  const { localOnlyAnswer, NO_KEY_NOTHING_TEXT } = await import('../src/main/ai/aiLocalFirst')
  const mine = localOnlyAnswer('is fungus covered scale tunic good for my warrior')
  assert.match(mine.text, /\*\*Fungus Covered Scale Tunic\*\*/)
  assert.equal(mine.offerAi, undefined)
  assert.match(localOnlyAnswer('should I do dungeon crawls solo or in a group').text, /Compendium - Dungeon Crawls/)
  assert.match(localOnlyAnswer('fungus tunic').text, /Fungus Covered Scale Tunic \(item\)/)
  const none = localOnlyAnswer('zzqx wobble')
  assert.equal(none.text, NO_KEY_NOTHING_TEXT)
  assert.equal(none.source, 'instant')
})
