// questWikiUrl — the ONE rule for "which eqlwiki page does this quest use link to", shared by the
// item hover card, the mob hover card and the mob page (owner ask, 2026-10-11).
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { questWikiUrl } from '../src/shared/wiki'

test('a quests-catalog use links its catalog page', () => {
  assert.equal(
    questWikiUrl({ quest: 'Coin of Tash', page: 'Coin of Tash (Tashania)', source: 'quests' }),
    'https://eqlwiki.com/Coin_of_Tash_(Tashania)'
  )
})

test('a live wiki use links the [[Page|Label]] target, not the label it shows', () => {
  assert.equal(
    questWikiUrl({ quest: 'the Tashania spell', page: 'Coin of Tash', source: 'wiki' }),
    'https://eqlwiki.com/Coin_of_Tash'
  )
})

test('a posky use links the class Sky Tests page, never the "Plane of Sky" source line', () => {
  // The class comes off the key when the use carries one…
  assert.equal(
    questWikiUrl({ quest: 'Bard · Test of Tone', page: 'Plane of Sky', source: 'posky', poskyKey: 'Bard::Test of Tone' }),
    'https://eqlwiki.com/Bard_Plane_of_Sky_Tests'
  )
  // …and off the "Class · Name" label when it does not.
  assert.equal(
    questWikiUrl({ quest: 'Enchanter · Test of Hypnosis', page: 'Plane of Sky', source: 'posky' }),
    'https://eqlwiki.com/Enchanter_Plane_of_Sky_Tests'
  )
})

test('a use with no page (a mob quest, a bare catalog row) links the quest name itself', () => {
  assert.equal(questWikiUrl({ quest: 'Fishbone Earring' }), 'https://eqlwiki.com/Fishbone_Earring')
})

test('nothing to name is no link, not a link to the wiki root', () => {
  assert.equal(questWikiUrl({ quest: '' }), undefined)
  assert.equal(questWikiUrl({ quest: ' ', source: 'posky' }), undefined)
})
