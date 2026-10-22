// A mob picture's file name keeps the backtick, as the wiki's own files do (owner, 2026-10-22: "what's
// the agreed upon standard for backticks ` in npc filenames and such?"; 397 of the 428 backtick mobs'
// imagefilenames keep it), and a page's file is compared the wiki's way.
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { npcImageName } from '../src/shared/wikiPage'
import { imageGaps, sameWikiFile } from '../src/shared/gapImages'
import type { KillMap } from '../src/shared/kills'

const kills = (display: string): KillMap => ({ [display.toLowerCase()]: { display, count: 2, bestTier: -1, firstTs: 0, lastTs: 0, credited: 2, tiers: {} } })

test('Guard E`tru keeps its backtick; only what Windows or a wiki title refuses becomes _', () => {
  assert.equal(npcImageName('Guard E`tru'), 'npc_guard_e`tru.png')
  assert.equal(npcImageName('Drizda Tunesinger'), 'npc_drizda_tunesinger.png')
  assert.equal(npcImageName('a lizardman scout'), 'npc_a_lizardman_scout.png')
  assert.equal(npcImageName('a mob: "who?" <x> | y/z #1'), 'npc_a_mob_who_x_y_z_1.png')
})

test('a page file is one file the wiki way: the first letter and spaces against _ do not count, the rest does', () => {
  assert.ok(sameWikiFile('Npc_guard_e`tru.png', 'npc_guard_e`tru.png'))
  assert.ok(sameWikiFile('npc guard e`tru.png', 'npc_guard_e`tru.png'))
  assert.ok(!sameWikiFile('npc_Guard_E`tru.png', 'npc_guard_e`tru.png'))
  assert.ok(!sameWikiFile('npc_guard_e_tru.png', 'npc_guard_e`tru.png'))
})

test('an imageless Guard E`tru whose page names npc_guard_e`tru.png is not told to change its page', () => {
  const page = { page: 'Guard E`tru', name: 'Guard E`tru', image: 'npc_guard_e`tru.png', noImage: true as const }
  const [r] = imageGaps(kills('Guard E`tru'), [], [page])
  assert.deepEqual([r?.name, r?.image, r?.pageImage], ['Guard E`tru', 'npc_guard_e`tru.png', undefined])
  // A page naming the underscore spelling is the one to fix.
  const [u] = imageGaps(kills('Guard E`tru'), [], [{ ...page, image: 'npc_guard_e_tru.png' }])
  assert.deepEqual([u?.image, u?.pageImage], ['npc_guard_e`tru.png', 'npc_guard_e_tru.png'])
})
